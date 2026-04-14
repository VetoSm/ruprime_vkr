from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.models import MlPlayerAnalysis, MlConstantHero, PlayerAccount, PlayerMatch
from app.schemas import PlayerAnalysisResponse, HeroResponse
from app.feature_engine import analyze_player
from app.opendota_client import fetch_full_player_data, steam_id_to_account_id

router = APIRouter(prefix="/ml", tags=["ml-analysis"])


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
    total_games: Optional[int] = None
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
    if not rank_tier:
        return None
    medal = rank_tier // 10
    stars = rank_tier % 10
    base_by_medal = {
        1: 500,
        2: 1200,
        3: 1900,
        4: 2700,
        5: 3500,
        6: 4300,
        7: 5200,
        8: 6500,
    }
    base = base_by_medal.get(medal)
    if base is None:
        return None
    return base + max(stars - 1, 0) * 150


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
    for m in matches[:limit]:
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


def _build_totals_payload(acc: PlayerAccount) -> dict:
    return {
        "total_games": acc.total_games,
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

    # Fetch from OpenDota
    data = fetch_full_player_data(steam_id)

    if data.get("error"):
        return PlayerAccountResponse(
            account_id=data.get("account_id", 0),
            error=data["error"],
        )

    account_id = data["account_id"]

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

    # Save lifetime totals
    t = data.get("totals", {})
    acc.total_games = t.get("total_games") or data.get("total_games")
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
    matches = data.get("matches", [])
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
    recent_match_ids = [m.get("match_id") for m in matches[:20] if m.get("match_id")]
    if recent_match_ids:
        import threading
        from app.match_collector import request_match_parse

        def _do_parse():
            return request_match_parse(recent_match_ids)

        parse_thread = threading.Thread(target=_do_parse, daemon=True)
        parse_thread.start()
        parse_requested = len(recent_match_ids)
        parse_message = (
            f"Запрошен парсинг {parse_requested} матчей в OpenDota. "
            f"Полные данные (варды, станы, APM) будут доступны через 5-10 минут. "
            f"Нажмите «Обновить данные» позже для получения обогащённой статистики."
        )

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
        total_games=acc.total_games,
        totals=t,
        last_match_time=data.get("last_match_time"),
        profile_url=acc.profile_url,
        is_public=acc.is_public,
        matches_loaded=len(matches),
        roles_distribution=roles_distribution,
        recent_matches=recent_matches,
        heroes_top=data.get("heroes", [])[:10],
        rankings_top=data.get("rankings", [])[:10],
        warning=data.get("warning"),
        parse_requested=parse_requested,
        parse_message=parse_message,
    )


@router.post("/refresh-player-data/{account_id}", response_model=PlayerAccountResponse)
def refresh_player_data(account_id: int, db: Session = Depends(get_db)):
    """Обновить данные игрока из OpenDota."""
    from app.opendota_client import account_id_to_steam_id
    steam_id = account_id_to_steam_id(account_id)
    return link_steam_account(LinkSteamRequest(steam_id=steam_id), db)


@router.get("/player-account/{account_id}", response_model=PlayerAccountResponse)
def get_player_account(account_id: int, db: Session = Depends(get_db)):
    """Получить сохранённые данные аккаунта игрока."""
    acc = db.query(PlayerAccount).filter(PlayerAccount.account_id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    matches_rows = db.query(PlayerMatch).filter(
        PlayerMatch.account_id == account_id
    ).order_by(PlayerMatch.start_time.desc().nullslast()).all()
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
    } for m in matches_rows])
    roles_distribution = _build_roles_distribution([{
        "lane_role": m.lane_role,
    } for m in matches_rows])
    heroes_top = _build_heroes_top(matches_rows)
    totals = _build_totals_payload(acc)
    mmr_estimate = _estimate_mmr_from_rank_tier(acc.rank_tier)

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
        total_games=acc.total_games,
        totals=totals,
        last_match_time=str(acc.last_match_time) if acc.last_match_time else None,
        profile_url=acc.profile_url,
        is_public=acc.is_public,
        matches_loaded=matches_count,
        roles_distribution=roles_distribution,
        recent_matches=recent_matches,
        heroes_top=heroes_top,
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
def analyze_player_endpoint(account_id: int, player_profile_id: int = None, db: Session = Depends(get_db)):
    """Run analysis for a specific player from player_matches data."""
    from app.feature_engine import analyze_player_from_account
    result = analyze_player_from_account(account_id, player_profile_id, db)
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
def detailed_features_endpoint(account_id: int, desired_rank: str = None, db: Session = Depends(get_db)):
    """Get detailed 6-category features with drill-down, score/target/gap."""
    from app.detailed_features import compute_detailed_features
    result = compute_detailed_features(account_id, desired_rank, db)
    return result


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
