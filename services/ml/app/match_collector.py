"""
Background Match Collector.
Runs inside ML service, collects parsed matches from OpenDota,
fetches full match data, saves to DB. Auto-recomputes baselines.
"""

import time
import threading
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session
from sqlalchemy import text, func as sqlfunc

from app.database import engine, SessionLocal
from app.models import MlRawMatch, MlRawPlayer

logger = logging.getLogger(__name__)

OPENDOTA_BASE = "https://api.opendota.com/api"
RATE_DELAY = 1.2  # seconds between requests

_state = {
    "running": False,
    "collecting": False,
    "last_run": None,
    "matches_collected_total": 0,
    "matches_collected_session": 0,
    "last_match_id": None,
    "baselines_last_recomputed": None,
    "errors": [],
    "log": [],
}
_lock = threading.Lock()
_stop_event = threading.Event()


def get_collector_status() -> dict:
    with _lock:
        return dict(_state)


def _log(msg: str):
    with _lock:
        _state["log"].append(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")
        if len(_state["log"]) > 200:
            _state["log"] = _state["log"][-100:]
    logger.info(f"[Collector] {msg}")


def _update(key, val):
    with _lock:
        _state[key] = val


def start_collector():
    """Start background collector thread."""
    if _state["running"]:
        return {"status": "already_running"}

    _stop_event.clear()
    _update("running", True)
    _update("matches_collected_session", 0)
    _update("log", [])

    thread = threading.Thread(target=_collector_loop, daemon=True)
    thread.start()
    return {"status": "started"}


def stop_collector():
    """Stop background collector."""
    _stop_event.set()
    _update("running", False)
    return {"status": "stopped"}


def _collector_loop():
    """Main collector loop: collect matches, then sleep, repeat."""
    _log("Сборщик запущен")

    while not _stop_event.is_set():
        try:
            _update("collecting", True)
            collected = _collect_parsed_matches()
            _update("collecting", False)
            _update("last_run", datetime.now(timezone.utc).isoformat())

            if collected > 0:
                _log(f"Собрано {collected} матчей в этом цикле")

                total = _state["matches_collected_total"] + collected
                _update("matches_collected_total", total)
                _update("matches_collected_session",
                        _state["matches_collected_session"] + collected)

                # Recompute baselines every 500 new matches
                if _state["matches_collected_session"] % 500 < collected:
                    _recompute_baselines()
            else:
                _log("Нет новых матчей")

        except Exception as e:
            _log(f"Ошибка: {str(e)}")
            with _lock:
                _state["errors"].append(str(e))

        # Sleep 10 minutes between cycles
        for _ in range(600):
            if _stop_event.is_set():
                break
            time.sleep(1)

    _update("running", False)
    _update("collecting", False)
    _log("Сборщик остановлен")


def _collect_parsed_matches() -> int:
    """Fetch recently parsed match IDs, then fetch full data for each."""
    collected = 0

    # Get DB session
    db = SessionLocal()
    try:
        # Get latest match_id in our DB to avoid duplicates
        max_id = db.query(sqlfunc.max(MlRawMatch.match_id)).filter(
            MlRawMatch.source_dir == "opendota_parsed"
        ).scalar() or 0

        # Fetch parsed match IDs from OpenDota (paginate back)
        match_ids = []
        last_id = None

        for page in range(5):  # 5 pages × 100 = 500 match IDs max per cycle
            if _stop_event.is_set():
                break

            url = f"{OPENDOTA_BASE}/parsedMatches"
            if last_id:
                url += f"?less_than_match_id={last_id}"

            time.sleep(RATE_DELAY)
            try:
                with httpx.Client(timeout=15) as client:
                    resp = client.get(url)
                if resp.status_code != 200:
                    break
                data = resp.json()
                if not data:
                    break

                new_ids = [m["match_id"] for m in data if m["match_id"] > max_id]
                match_ids.extend(new_ids)
                last_id = data[-1]["match_id"]

                if len(new_ids) == 0:
                    break  # All older than what we have

            except Exception as e:
                _log(f"Ошибка parsedMatches: {e}")
                break

        if not match_ids:
            return 0

        # Deduplicate
        existing = set()
        if match_ids:
            existing_rows = db.query(MlRawMatch.match_id).filter(
                MlRawMatch.match_id.in_(match_ids),
                MlRawMatch.source_dir == "opendota_parsed",
            ).all()
            existing = {r[0] for r in existing_rows}

        new_ids = [mid for mid in match_ids if mid not in existing]
        _log(f"Найдено {len(match_ids)} parsed, новых: {len(new_ids)}")

        # Fetch full data for each match
        for match_id in new_ids[:50]:  # Max 50 per cycle to stay within rate limits
            if _stop_event.is_set():
                break

            time.sleep(RATE_DELAY)
            match_data = _fetch_match(match_id)
            if match_data:
                _save_match(db, match_data)
                collected += 1
                _update("last_match_id", match_id)

    except Exception as e:
        _log(f"Ошибка сбора: {e}")
    finally:
        db.close()

    return collected


def _fetch_match(match_id: int) -> dict | None:
    """Fetch full match data from OpenDota."""
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.get(f"{OPENDOTA_BASE}/matches/{match_id}")
        if resp.status_code == 200:
            return resp.json()
        return None
    except Exception:
        return None


def _save_match(db: Session, data: dict):
    """Save match + players to DB."""
    match_id = data.get("match_id")
    if not match_id:
        return

    duration = data.get("duration", 0)
    if not duration or duration < 300:
        return  # Skip very short matches

    # Determine avg rank
    players = data.get("players", [])
    ranks = [p.get("rank_tier") for p in players if p.get("rank_tier") and p["rank_tier"] > 0]
    avg_rank = int(sum(ranks) / len(ranks)) if ranks else None

    # Save match
    match = MlRawMatch(
        match_id=match_id,
        start_date_time=str(datetime.fromtimestamp(data.get("start_time", 0), tz=timezone.utc)),
        duration=duration,
        radiant_win=data.get("radiant_win"),
        radiant_score=data.get("radiant_score"),
        dire_score=data.get("dire_score"),
        patch=str(data.get("patch")),
        region=str(data.get("region")),
        game_mode=data.get("game_mode"),
        cluster=data.get("cluster"),
        first_blood_time=data.get("first_blood_time"),
        source_dir="opendota_parsed",
    )
    db.add(match)

    # Save players
    for p in players:
        hero_id = p.get("hero_id")
        if not hero_id:
            continue

        player = MlRawPlayer(
            match_id=match_id,
            player_slot=p.get("player_slot"),
            hero_id=hero_id,
            kills=p.get("kills"),
            deaths=p.get("deaths"),
            assists=p.get("assists"),
            gold_per_min=p.get("gold_per_min"),
            xp_per_min=p.get("xp_per_min"),
            last_hits=p.get("last_hits"),
            denies=p.get("denies"),
            hero_damage=p.get("hero_damage"),
            tower_damage=p.get("tower_damage"),
            net_worth=p.get("net_worth"),
            level=p.get("level"),
            kills_per_min=p.get("kills_per_min"),
            lane=p.get("lane"),
            lane_role=p.get("lane_role"),
            is_roaming=p.get("is_roaming"),
            obs_placed=p.get("obs_placed"),
            sen_placed=p.get("sen_placed"),
            camps_stacked=p.get("camps_stacked"),
            rune_pickups=p.get("rune_pickups"),
            teamfight_participation=p.get("teamfight_participation"),
            towers_killed=p.get("towers_killed"),
            stuns=p.get("stuns"),
            actions_per_min=p.get("actions_per_min"),
            rank_tier=p.get("rank_tier") or avg_rank,
            account_id=p.get("account_id"),
            team_number=p.get("team_number"),
            team_slot=p.get("team_slot"),
            item_0=p.get("item_0"),
            item_1=p.get("item_1"),
            item_2=p.get("item_2"),
            item_3=p.get("item_3"),
            item_4=p.get("item_4"),
            item_5=p.get("item_5"),
            source_dir="opendota_parsed",
        )
        db.add(player)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning(f"Failed to save match {match_id}: {e}")


def _recompute_baselines():
    """Recompute baselines from all data (Kaggle + parsed)."""
    _log("Пересчёт baselines...")
    try:
        from app.feature_engine import compute_baselines
        db = SessionLocal()
        count = compute_baselines(db)
        db.close()
        _update("baselines_last_recomputed", datetime.now(timezone.utc).isoformat())
        _log(f"Baselines пересчитаны: {count} конфигураций")
    except Exception as e:
        _log(f"Ошибка пересчёта baselines: {e}")


def request_match_parse(match_ids: list[int]) -> dict:
    """Request OpenDota to parse specific matches (for player linking)."""
    results = {"requested": 0, "failed": 0, "ids": []}

    for match_id in match_ids[:20]:  # Max 20
        time.sleep(RATE_DELAY)
        try:
            with httpx.Client(timeout=10) as client:
                resp = client.post(f"{OPENDOTA_BASE}/request/{match_id}")
            if resp.status_code in (200, 201):
                results["requested"] += 1
                results["ids"].append(match_id)
            else:
                results["failed"] += 1
        except Exception:
            results["failed"] += 1

    return results
