import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text, func as sqlfunc

from app.database import get_db
from app.models import MlPlayerAnalysis, MlConstantHero, PlayerAccount, PlayerMatch
from app.schemas import PlayerAnalysisResponse, HeroResponse
from app.feature_engine import analyze_player
from app.opendota_client import fetch_full_player_data, steam_id_to_account_id
from app.player_sync_manager import schedule_deep_sync, get_sync_status

router = APIRouter(prefix="/ml", tags=["ml-analysis"])

BACKGROUND_REFRESH_MINUTES = max(15, int(os.getenv("PLAYER_BACKGROUND_REFRESH_MINUTES", "120")))
INITIAL_PARSE_MATCHES = max(25, int(os.getenv("PLAYER_INITIAL_PARSE_MATCHES", "80")))


# ---- Schemas for steam linking ----

class LinkSteamRequest(BaseModel):
    steam_id: str


class PlayerAccountResponse(BaseModel):
    account_id: int
    steam_id: Optional[str] = None
    personaname: Optional[str] = None
    avatar_url: Optional[str] = None
    rank_tier: Optional[int] = None
    mmr_estimate: Optional[int] = None
    win: Optional[int] = None
    lose: Optional[int] = None
    estimated_hours: Optional[float] = None
    # total_games is kept for legacy clients and equals lifetime_games.
    total_games: Optional[int] = None
    lifetime_games: Optional[int] = None
    parsed_games_n: Optional[int] = None
    totals: Optional[dict] = None
    last_match_time: Optional[str] = None
    profile_url: Optional[str] = None
    is_public: Optional[bool] = None
    matches_loaded: int = 0
    roles_distribution: Optional[dict] = None
    recent_matches: Optional[list] = None
    heroes_top: Optional[list] = None
    rankings_top: Optional[list] = None
    error: Optional[str] = None
    warning: Optional[str] = None
    parse_requested: int = 0
    parse_message: Optional[str] = None


def _normalize_mmr_estimate(raw_mmr) -> Optional[int]:
    if isinstance(raw_mmr, dict):
        raw_mmr = raw_mmr.get("estimate")
    try:
        if raw_mmr is None:
            return None
        return int(float(raw_mmr))
    except Exception:
        return None


def _estimate_mmr_from_rank_tier(rank_tier: Optional[int]) -> Optional[int]:
    """Thin wrapper around ``feature_engine.estimate_mmr`` so we keep one
    calibration table for the whole app (see ``_RANK_TIER_TO_MMR``)."""
    if not rank_tier:
        return None
    from app.feature_engine import estimate_mmr

    return estimate_mmr(rank_tier)


def _build_roles_distribution(matches: list[dict]) -> dict:
    counts = {}
    for m in matches:
        role = m.get("lane_role")
        try:
            role = int(role)
        except Exception:
            continue
        if role < 1 or role > 5:
            continue
        key = f"POS{role}"
        counts[key] = counts.get(key, 0) + 1

    total = sum(counts.values())
    if total == 0:
        return {}
    return {k: round(v / total, 3) for k, v in counts.items()}


def _build_recent_matches(matches: list[dict], limit: int = 12) -> list[dict]:
    recent = []
    deduped = _dedupe_match_dicts(matches)
    deduped.sort(key=lambda x: x.get("start_time") or 0, reverse=True)
    for m in deduped[:limit]:
        kills = int(m.get("kills") or 0)
        deaths = int(m.get("deaths") or 0)
        assists = int(m.get("assists") or 0)
        slot = m.get("player_slot")
        radiant_win = m.get("radiant_win")
        win = None
        if radiant_win is not None:
            win = bool(radiant_win) if (slot is not None and slot < 128) else not bool(radiant_win)
        recent.append({
            "match_id": m.get("match_id"),
            "hero_id": m.get("hero_id"),
            "start_time": m.get("start_time"),
            "win": win,
            "kills": kills,
            "deaths": deaths,
            "assists": assists,
            "kda": round((kills + assists) / max(deaths, 1), 2),
            "gpm": m.get("gold_per_min"),
            "xpm": m.get("xp_per_min"),
            "duration": m.get("duration"),
            "lane_role": m.get("lane_role"),
        })
    return recent


def _closed_stats_warning(matches_loaded: int, win: Optional[int], lose: Optional[int]) -> Optional[str]:
    wins = int(win or 0)
    losses = int(lose or 0)
    if matches_loaded == 0 and wins == 0 and losses == 0:
        return (
            "Статистика закрыта или недоступна в OpenDota.\n"
            "1. Откройте Dota 2 -> Настройки -> Социальные сети\n"
            "2. Включите «Показывать данные матчей» (Expose Public Match Data)\n"
            "3. Подождите 5-10 минут и нажмите «Обновить данные»"
        )
    return None


def _should_background_refresh(acc: PlayerAccount) -> bool:
    fetched_at = acc.fetched_at
    if not fetched_at:
        return True
    now = datetime.now(timezone.utc)
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=timezone.utc)
    age_minutes = (now - fetched_at).total_seconds() / 60.0
    return age_minutes >= BACKGROUND_REFRESH_MINUTES


def _build_totals_payload(acc: PlayerAccount) -> dict:
    return {
        "total_games": acc.total_games,
        "lifetime_games": acc.lifetime_games,
        "parsed_games_n": acc.parsed_games_n,
        "avg_gpm": acc.avg_gpm,
        "avg_xpm": acc.avg_xpm,
        "avg_kills": acc.avg_kills,
        "avg_deaths": acc.avg_deaths,
        "avg_assists": acc.avg_assists,
        "avg_last_hits": acc.avg_last_hits,
        "avg_denies": acc.avg_denies,
        "avg_hero_damage": acc.avg_hero_damage,
        "avg_tower_damage": acc.avg_tower_damage,
        "avg_duration": acc.avg_duration,
        "avg_hero_healing": acc.avg_hero_healing,
        "total_stuns": acc.total_stuns,
        "total_obs": acc.total_obs_placed,
        "total_sen": acc.total_sen_placed,
        "total_tower_kills": acc.total_tower_kills,
    }


def _build_heroes_top(matches: list[PlayerMatch], limit: int = 10) -> list[dict]:
    heroes = {}
    for m in matches:
        hero_id = m.hero_id
        if hero_id is None:
            continue
        if hero_id not in heroes:
            heroes[hero_id] = {
                "hero_id": hero_id,
                "games": 0,
                "win": 0,
                "kills_sum": 0.0,
                "deaths_sum": 0.0,
                "assists_sum": 0.0,
            }
        heroes[hero_id]["games"] += 1
        heroes[hero_id]["kills_sum"] += float(m.kills or 0)
        heroes[hero_id]["deaths_sum"] += float(m.deaths or 0)
        heroes[hero_id]["assists_sum"] += float(m.assists or 0)
        if m.radiant_win is not None:
            won = bool(m.radiant_win) if (m.player_slot is not None and m.player_slot < 128) else not bool(m.radiant_win)
            if won:
                heroes[hero_id]["win"] += 1

    result = []
    for row in heroes.values():
        games = row["games"]
        win = row["win"]
        avg_kills = row["kills_sum"] / games if games > 0 else 0
        avg_deaths = row["deaths_sum"] / games if games > 0 else 0
        avg_assists = row["assists_sum"] / games if games > 0 else 0
        result.append({
            "hero_id": row["hero_id"],
            "games": games,
            "win": win,
            "winrate": round(win / games, 3) if games > 0 else 0,
            "avg_kda": round((avg_kills + avg_assists) / max(avg_deaths, 1), 2),
        })
    return sorted(result, key=lambda x: x["games"], reverse=True)[:limit]


def _dedupe_match_dicts(matches: list[dict]) -> list[dict]:
    by_id: dict[int, dict] = {}
    for row in matches:
        try:
            match_id = int(row.get("match_id"))
        except (TypeError, ValueError):
            continue
        if not match_id:
            continue
        current = by_id.get(match_id)
        if not current:
            by_id[match_id] = row
            continue
        current_score = int(bool(current.get("is_detailed"))) + sum(1 for v in current.values() if v is not None) / 1000
        row_score = int(bool(row.get("is_detailed"))) + sum(1 for v in row.values() if v is not None) / 1000
        if row_score >= current_score:
            by_id[match_id] = row
    return list(by_id.values())


def _unique_match_ids(matches: list[dict], limit: int) -> list[int]:
    ids = []
    seen = set()
    for row in matches:
        try:
            match_id = int(row.get("match_id"))
        except (TypeError, ValueError):
            continue
        if not match_id or match_id in seen:
            continue
        seen.add(match_id)
        ids.append(match_id)
        if len(ids) >= limit:
            break
    return ids


# ---- Steam linking endpoints ----

@router.post("/link-steam-account", response_model=PlayerAccountResponse)
def link_steam_account(body: LinkSteamRequest, db: Session = Depends(get_db)):
    """
    Привязка Steam: загрузка профиля, W/L, матчей из OpenDota.
    Сохраняет в player_accounts и player_matches.
    """
    steam_id = body.steam_id.strip()
    if not steam_id:
        raise HTTPException(status_code=400, detail="Steam ID не указан")
    account_id = steam_id_to_account_id(steam_id)

    # Reuse cached account data if we already have this OpenDota account in DB.
    existing_acc = db.query(PlayerAccount).filter(PlayerAccount.account_id == account_id).first()
    if existing_acc:
        cached_matches_count = db.query(sqlfunc.count(PlayerMatch.id)).filter(
            PlayerMatch.account_id == account_id
        ).scalar() or 0

        sync_job = schedule_deep_sync(account_id, steam_id=steam_id, force=False)
        cached_response = get_player_account(account_id, db)
        cached_response.parse_message = (
            f"Найдены сохранённые данные ({cached_matches_count} матчей). "
            "Запущена фоновая догрузка: обновим профиль, подтянем больше матчей и расширенные данные."
        )
        if sync_job.get("status") == "already_scheduled":
            cached_response.parse_message = (
                f"Найдены сохранённые данные ({cached_matches_count} матчей). "
                "Фоновая догрузка уже выполняется."
            )
        if not cached_response.warning:
            cached_response.warning = _closed_stats_warning(
                cached_matches_count,
                existing_acc.win,
                existing_acc.lose,
            )
        return cached_response

    # Fetch from OpenDota
    data = fetch_full_player_data(steam_id)

    if data.get("error"):
        return PlayerAccountResponse(
            account_id=data.get("account_id", 0),
            error=data["error"],
        )

    account_id = int(data["account_id"])

    # Save/update player_accounts
    acc = db.query(PlayerAccount).filter(PlayerAccount.account_id == account_id).first()
    if not acc:
        acc = PlayerAccount(account_id=account_id)
        db.add(acc)

    acc.steam_id = data.get("steam_id", steam_id)
    acc.personaname = data.get("personaname")
    acc.avatar_url = data.get("avatar_url")
    acc.rank_tier = data.get("rank_tier")
    acc.win = data.get("win", 0)
    acc.lose = data.get("lose", 0)
    acc.estimated_hours = data.get("estimated_hours", 0)
    acc.profile_url = data.get("profile_url")
    acc.is_public = data.get("is_public", True)
    acc.fetched_at = datetime.now(timezone.utc)

    if data.get("last_match_time"):
        try:
            acc.last_match_time = datetime.fromisoformat(data["last_match_time"])
        except Exception:
            pass

    # Save lifetime totals. Source of truth for counts:
    #   lifetime_games = wl.win + wl.lose
    #   parsed_games_n = max n across /totals fields
    t = data.get("totals", {})
    lifetime_games = int(data.get("lifetime_games") or 0)
    parsed_games_n = int(data.get("parsed_games_n") or t.get("parsed_games_n") or 0)
    acc.lifetime_games = lifetime_games
    acc.parsed_games_n = parsed_games_n
    acc.total_games = lifetime_games  # back-compat alias
    acc.avg_gpm = t.get("avg_gpm")
    acc.avg_xpm = t.get("avg_xpm")
    acc.avg_kills = t.get("avg_kills")
    acc.avg_deaths = t.get("avg_deaths")
    acc.avg_assists = t.get("avg_assists")
    acc.avg_last_hits = t.get("avg_last_hits")
    acc.avg_denies = t.get("avg_denies")
    acc.avg_hero_damage = t.get("avg_hero_damage")
    acc.avg_tower_damage = t.get("avg_tower_damage")
    acc.avg_duration = t.get("avg_duration")
    acc.avg_hero_healing = t.get("avg_hero_healing")
    acc.total_stuns = t.get("total_stuns")
    acc.total_obs_placed = t.get("total_obs")
    acc.total_sen_placed = t.get("total_sen")
    acc.total_tower_kills = t.get("total_tower_kills")

    db.flush()

    # Save matches (clear old, insert new)
    db.query(PlayerMatch).filter(PlayerMatch.account_id == account_id).delete()
    matches = _dedupe_match_dicts(data.get("matches", []))
    for m in matches:
        pm = PlayerMatch(
            account_id=account_id,
            match_id=m.get("match_id"),
            hero_id=m.get("hero_id"),
            kills=m.get("kills"),
            deaths=m.get("deaths"),
            assists=m.get("assists"),
            gold_per_min=m.get("gold_per_min"),
            xp_per_min=m.get("xp_per_min"),
            last_hits=m.get("last_hits"),
            denies=m.get("denies"),
            hero_damage=m.get("hero_damage"),
            tower_damage=m.get("tower_damage"),
            hero_healing=m.get("hero_healing"),
            obs_placed=m.get("obs_placed"),
            sen_placed=m.get("sen_placed"),
            duration=m.get("duration"),
            player_slot=m.get("player_slot"),
            radiant_win=m.get("radiant_win"),
            lane_role=m.get("lane_role"),
            start_time=m.get("start_time"),
            party_size=m.get("party_size"),
            game_mode=m.get("game_mode"),
            average_rank=m.get("average_rank"),
            is_detailed=m.get("is_detailed", False),
        )
        db.add(pm)

    db.commit()

    # Request parse for recent matches (non-blocking background thread)
    parse_requested = 0
    parse_message = None
    recent_match_ids = _unique_match_ids(matches, INITIAL_PARSE_MATCHES)
    if recent_match_ids:
        import threading
        from app.match_collector import request_match_parse

        def _do_parse():
            return request_match_parse(recent_match_ids, max_requests=INITIAL_PARSE_MATCHES)

        parse_thread = threading.Thread(target=_do_parse, daemon=True)
        parse_thread.start()
        parse_requested = len(recent_match_ids)
        parse_message = (
            f"Запрошен парсинг {parse_requested} матчей в OpenDota. "
            f"Полные данные (варды, станы, APM) будут доступны через 5-10 минут. "
            f"Нажмите «Обновить данные» позже для получения обогащённой статистики."
        )

    sync_job = schedule_deep_sync(account_id, steam_id=steam_id, force=True)
    sync_msg = (
        "Запущена фоновая глубокая синхронизация: догружаем максимум матчей, "
        "расширенные данные и кэшируем других игроков из этих матчей."
    )
    if sync_job.get("status") == "already_scheduled":
        sync_msg = "Фоновая глубокая синхронизация уже выполняется."
    parse_message = f"{parse_message}\n{sync_msg}" if parse_message else sync_msg

    mmr_estimate = _normalize_mmr_estimate(data.get("mmr_estimate"))
    if mmr_estimate is None:
        mmr_estimate = _estimate_mmr_from_rank_tier(acc.rank_tier)

    roles_distribution = _build_roles_distribution(matches)
    recent_matches = _build_recent_matches(matches)

    return PlayerAccountResponse(
        account_id=account_id,
        steam_id=acc.steam_id,
        personaname=acc.personaname,
        avatar_url=acc.avatar_url,
        rank_tier=acc.rank_tier,
        mmr_estimate=mmr_estimate,
        win=acc.win,
        lose=acc.lose,
        estimated_hours=acc.estimated_hours,
        total_games=acc.lifetime_games or acc.total_games,
        lifetime_games=acc.lifetime_games,
        parsed_games_n=acc.parsed_games_n,
        totals=t,
        last_match_time=data.get("last_match_time"),
        profile_url=acc.profile_url,
        is_public=acc.is_public,
        matches_loaded=len(matches),
        roles_distribution=roles_distribution,
        recent_matches=recent_matches,
        heroes_top=data.get("heroes", [])[:10],
        rankings_top=data.get("rankings", [])[:10],
        warning=data.get("warning") or _closed_stats_warning(len(matches), acc.win, acc.lose),
        parse_requested=parse_requested,
        parse_message=parse_message,
    )


@router.post("/refresh-player-data/{account_id}", response_model=PlayerAccountResponse)
def refresh_player_data(account_id: int, db: Session = Depends(get_db)):
    """Обновить данные игрока из OpenDota."""
    from app.opendota_client import account_id_to_steam_id
    steam_id = account_id_to_steam_id(account_id)
    return link_steam_account(LinkSteamRequest(steam_id=steam_id), db)


@router.get("/player-sync-status/{account_id}")
def player_sync_status(account_id: int):
    """Статус фоновой догрузки матчей для игрока."""
    return get_sync_status(account_id)


@router.get("/player-account/{account_id}", response_model=PlayerAccountResponse)
def get_player_account(account_id: int, db: Session = Depends(get_db)):
    """Получить сохранённые данные аккаунта игрока."""
    acc = db.query(PlayerAccount).filter(PlayerAccount.account_id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    matches_rows = db.query(PlayerMatch).filter(
        PlayerMatch.account_id == account_id
    ).order_by(
        PlayerMatch.start_time.desc().nullslast(),
        PlayerMatch.is_detailed.desc().nullslast(),
        PlayerMatch.id.desc(),
    ).all()
    matches_count = len(matches_rows)

    recent_matches = _build_recent_matches([{
        "match_id": m.match_id,
        "hero_id": m.hero_id,
        "kills": m.kills,
        "deaths": m.deaths,
        "assists": m.assists,
        "gold_per_min": m.gold_per_min,
        "xp_per_min": m.xp_per_min,
        "duration": m.duration,
        "player_slot": m.player_slot,
        "radiant_win": m.radiant_win,
        "lane_role": m.lane_role,
        "start_time": m.start_time,
        "is_detailed": m.is_detailed,
    } for m in matches_rows])
    roles_distribution = _build_roles_distribution([{
        "lane_role": m.lane_role,
    } for m in matches_rows])
    heroes_top = _build_heroes_top(matches_rows)
    totals = _build_totals_payload(acc)
    mmr_estimate = _estimate_mmr_from_rank_tier(acc.rank_tier)
    warning = _closed_stats_warning(matches_count, acc.win, acc.lose)

    parse_message = None
    if _should_background_refresh(acc):
        sync_job = schedule_deep_sync(acc.account_id, steam_id=acc.steam_id, force=False)
        if sync_job.get("status") == "queued":
            parse_message = "Запущена фоновая догрузка данных (без блокировки интерфейса)."
        elif sync_job.get("status") == "already_scheduled":
            parse_message = "Фоновая догрузка данных уже выполняется."

    return PlayerAccountResponse(
        account_id=acc.account_id,
        steam_id=acc.steam_id,
        personaname=acc.personaname,
        avatar_url=acc.avatar_url,
        rank_tier=acc.rank_tier,
        mmr_estimate=mmr_estimate,
        win=acc.win,
        lose=acc.lose,
        estimated_hours=acc.estimated_hours,
        total_games=acc.lifetime_games or acc.total_games,
        lifetime_games=acc.lifetime_games,
        parsed_games_n=acc.parsed_games_n,
        totals=totals,
        last_match_time=str(acc.last_match_time) if acc.last_match_time else None,
        profile_url=acc.profile_url,
        is_public=acc.is_public,
        matches_loaded=matches_count,
        roles_distribution=roles_distribution,
        recent_matches=recent_matches,
        heroes_top=heroes_top,
        warning=warning,
        parse_message=parse_message,
    )


# ---- Existing endpoints ----

@router.get("/player-analysis/{analysis_id}", response_model=PlayerAnalysisResponse)
def get_player_analysis(analysis_id: str, db: Session = Depends(get_db)):
    """Get a previously computed player analysis by ID."""
    record = db.query(MlPlayerAnalysis).filter(
        MlPlayerAnalysis.analysis_id == analysis_id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Analysis not found")

    return PlayerAnalysisResponse(
        ml_analysis_id=record.analysis_id,
        summary=record.summary,
        trends=record.trends,
        roles=record.roles_data,
        heroes=record.heroes_data,
        comparisons=record.comparisons,
        features=record.features,
        weaknesses_ranked=record.weaknesses_ranked,
        strengths_ranked=record.strengths_ranked,
    )


@router.get("/analyze-player/{account_id}", response_model=PlayerAnalysisResponse)
def analyze_player_endpoint(
    account_id: int,
    player_profile_id: int = None,
    mode: str = "ranked",
    period: str = "50",
    role: int | None = None,
    hero_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Run analysis for a specific player from player_matches data."""
    from app.feature_engine import analyze_player_from_account
    result = analyze_player_from_account(
        account_id,
        player_profile_id,
        db,
        filters={"mode": mode, "period": period, "role": role, "hero_id": hero_id},
    )
    return PlayerAnalysisResponse(
        ml_analysis_id=result["ml_analysis_id"],
        summary=result.get("summary"),
        trends=result.get("trends"),
        roles=result.get("roles"),
        heroes=result.get("heroes"),
        comparisons=result.get("comparisons"),
        features=result.get("features"),
        weaknesses_ranked=result.get("weaknesses_ranked"),
        strengths_ranked=result.get("strengths_ranked"),
    )


@router.get("/detailed-features/{account_id}")
def detailed_features_endpoint(
    account_id: int,
    desired_rank: str = None,
    mode: str = "ranked",
    period: str = "50",
    role: int | None = None,
    hero_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Get detailed 6-category features with drill-down, score/target/gap."""
    from app.detailed_features import compute_detailed_features
    result = compute_detailed_features(
        account_id,
        desired_rank,
        db,
        filters={"mode": mode, "period": period, "role": role, "hero_id": hero_id},
    )
    return result


@router.get("/debug/steam-web/{steam_id}")
def debug_steam_web(steam_id: str):
    """Live probe of Steam Web API for one SteamID. Used by the admin
    user-detail view to show 'key configured?', 'is this account visible
    to Valve?', persona and playtime right now.

    Internal-only; protected by the X-Internal-Token dependency on the
    whole ml router.
    """
    from app.steam_web_api import is_configured, enrich_profile

    if not is_configured():
        return {"configured": False, "found": False}
    enriched = enrich_profile(steam_id)
    found = bool(enriched.get("steam_web_available"))
    return {
        "configured": True,
        "found": found,
        "profile": {
            "personaname": enriched.get("personaname"),
            "avatar_url": enriched.get("avatar_url"),
            "profile_url": enriched.get("profile_url"),
            "realname": enriched.get("realname"),
            "country_code": enriched.get("country_code"),
            "community_visibility": enriched.get("community_visibility"),
        } if found else None,
        "playtime": {
            "dota_hours": enriched.get("steam_dota_hours"),
            "last_played": enriched.get("steam_dota_last_played"),
        } if found else None,
    }


@router.get("/heroes", response_model=list[HeroResponse])
def list_heroes(db: Session = Depends(get_db)):
    """List all heroes from constants."""
    heroes = db.query(MlConstantHero).order_by(MlConstantHero.localized_name).all()
    return [
        HeroResponse(
            hero_id=h.hero_id,
            name=h.name,
            localized_name=h.localized_name,
            primary_attr=h.primary_attr,
            attack_type=h.attack_type,
            roles=h.roles,
            img=h.img,
        )
        for h in heroes
    ]
