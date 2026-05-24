"""
Endpoints for viewing loaded ML data: table stats, baselines, samples, analyses.
"""

from fastapi import APIRouter, Query
from sqlalchemy import text, func as sqlfunc
from sqlalchemy.orm import Session
from fastapi import Depends

from app.database import get_db, engine
from app.models import (
    MlRawMatch, MlRawPlayer, MlRawTeam, MlRawPicksBans,
    MlConstantHero, MlConstantItem, MlConstantAbility,
    MlKaggleBaseline, MlPlayerAnalysis,
    PlayerAccount, PlayerMatch,
)

router = APIRouter(prefix="/ml/data", tags=["ml-data-view"])


@router.get("/stats")
def data_stats(db: Session = Depends(get_db)):
    """Статистика по всем ML-таблицам: кол-во строк, источники."""
    tables = {
        "ml_raw_matches": MlRawMatch,
        "ml_raw_players": MlRawPlayer,
        "ml_raw_teams": MlRawTeam,
        "ml_raw_picks_bans": MlRawPicksBans,
        "ml_constants_heroes": MlConstantHero,
        "ml_constants_items": MlConstantItem,
        "ml_constants_abilities": MlConstantAbility,
        "ml_kaggle_baselines": MlKaggleBaseline,
        "ml_player_analyses": MlPlayerAnalysis,
    }

    result = {}
    for name, model in tables.items():
        try:
            count = db.query(sqlfunc.count(model.id)).scalar() or 0
            result[name] = {"count": count}
        except Exception:
            result[name] = {"count": 0, "error": "table may not exist"}

    # Source dirs breakdown for matches
    try:
        sources = db.query(
            MlRawMatch.source_dir,
            sqlfunc.count(MlRawMatch.id)
        ).group_by(MlRawMatch.source_dir).all()
        result["ml_raw_matches"]["sources"] = {s[0]: s[1] for s in sources if s[0]}
    except Exception:
        pass

    return result


@router.get("/table/{table_name}")
def view_table(
    table_name: str,
    limit: int = Query(50, le=500),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    """Просмотр содержимого ML-таблицы с пагинацией."""
    allowed = {
        "ml_raw_matches": MlRawMatch,
        "ml_raw_players": MlRawPlayer,
        "ml_raw_teams": MlRawTeam,
        "ml_raw_picks_bans": MlRawPicksBans,
        "ml_constants_heroes": MlConstantHero,
        "ml_constants_items": MlConstantItem,
        "ml_constants_abilities": MlConstantAbility,
        "ml_kaggle_baselines": MlKaggleBaseline,
        "ml_player_analyses": MlPlayerAnalysis,
    }

    if table_name not in allowed:
        return {"error": f"Таблица не найдена. Доступные: {list(allowed.keys())}"}

    model = allowed[table_name]
    total = db.query(sqlfunc.count(model.id)).scalar() or 0
    rows = db.query(model).offset(offset).limit(limit).all()

    # Get column names
    columns = [col.name for col in model.__table__.columns]

    data = []
    for row in rows:
        row_dict = {}
        for col_name in columns:
            val = getattr(row, col_name, None)
            # Truncate long JSON fields for readability
            if isinstance(val, (dict, list)):
                s = str(val)
                row_dict[col_name] = s[:200] + "..." if len(s) > 200 else s
            elif val is not None:
                s = str(val)
                row_dict[col_name] = s[:200] + "..." if len(s) > 200 else s
            else:
                row_dict[col_name] = None
        data.append(row_dict)

    return {
        "table": table_name,
        "total": total,
        "offset": offset,
        "limit": limit,
        "columns": columns,
        "rows": data,
    }


@router.get("/baselines")
def view_baselines(
    mmr_band: str = Query(None),
    hero_id: int = Query(None),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
):
    """Просмотр эталонных игроков (baselines) с фильтрами."""
    query = db.query(MlKaggleBaseline)
    if mmr_band:
        query = query.filter(MlKaggleBaseline.mmr_band == mmr_band)
    if hero_id:
        query = query.filter(MlKaggleBaseline.hero_id == hero_id)

    total = query.count()
    rows = query.order_by(MlKaggleBaseline.match_count.desc().nullslast()).limit(limit).all()

    data = []
    for b in rows:
        data.append({
            "id": b.id,
            "mmr_band": b.mmr_band,
            "hero_id": b.hero_id,
            "role": b.role,
            "avg_gpm": round(b.avg_gpm, 1) if b.avg_gpm else None,
            "avg_xpm": round(b.avg_xpm, 1) if b.avg_xpm else None,
            "avg_kills": round(b.avg_kills, 2) if b.avg_kills else None,
            "avg_deaths": round(b.avg_deaths, 2) if b.avg_deaths else None,
            "avg_assists": round(b.avg_assists, 2) if b.avg_assists else None,
            "avg_kda": round(b.avg_kda, 2) if b.avg_kda else None,
            "avg_last_hits": round(b.avg_last_hits, 1) if b.avg_last_hits else None,
            "avg_hero_damage": round(b.avg_hero_damage, 0) if b.avg_hero_damage else None,
            "avg_tower_damage": round(b.avg_tower_damage, 0) if b.avg_tower_damage else None,
            "winrate": round(b.winrate, 3) if b.winrate else None,
            "match_count": b.match_count,
        })

    # Summary: unique MMR bands and their counts
    bands_summary = db.query(
        MlKaggleBaseline.mmr_band,
        sqlfunc.count(MlKaggleBaseline.id),
        sqlfunc.sum(MlKaggleBaseline.match_count),
    ).group_by(MlKaggleBaseline.mmr_band).all()

    summary = {b[0]: {"configs": b[1], "total_matches": b[2]} for b in bands_summary}

    return {
        "total_baselines": total,
        "bands_summary": summary,
        "rows": data,
    }


@router.get("/analyses")
def view_analyses(
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db),
):
    """Просмотр выполненных анализов игроков."""
    rows = db.query(MlPlayerAnalysis).order_by(
        MlPlayerAnalysis.created_at.desc().nullslast()
    ).limit(limit).all()

    data = []
    for a in rows:
        summary = a.summary or {}
        data.append({
            "analysis_id": a.analysis_id,
            "player_profile_id": a.player_profile_id,
            "account_id": a.account_id,
            "estimated_mmr": a.estimated_mmr,
            "mmr_band": a.mmr_band,
            "games_analyzed": summary.get("games_analyzed", 0),
            "winrate": summary.get("winrate", 0),
            "gpm_avg": summary.get("gpm_avg", 0),
            "xpm_avg": summary.get("xpm_avg", 0),
            "kda_avg": summary.get("kda_avg", 0),
            "strengths": len(a.strengths_ranked or []),
            "weaknesses": len(a.weaknesses_ranked or []),
            "created_at": str(a.created_at) if a.created_at else None,
        })

    return {"total": len(data), "analyses": data}


@router.get("/baselines/mmr-bands")
def baselines_mmr_bands(db: Session = Depends(get_db)):
    """Список MMR-бэндов для фильтрации."""
    bands = db.query(MlKaggleBaseline.mmr_band).distinct().all()
    return [b[0] for b in bands if b[0]]


@router.get("/player-accounts")
def view_player_accounts(db: Session = Depends(get_db)):
    """Просмотр всех привязанных аккаунтов игроков."""
    accounts = db.query(PlayerAccount).order_by(PlayerAccount.fetched_at.desc().nullslast()).all()
    data = []
    for a in accounts:
        match_count = db.query(sqlfunc.count(PlayerMatch.id)).filter(
            PlayerMatch.account_id == a.account_id
        ).scalar() or 0

        # Check if analysis exists
        analysis = db.query(MlPlayerAnalysis).filter(
            MlPlayerAnalysis.account_id == a.account_id
        ).order_by(MlPlayerAnalysis.created_at.desc().nullslast()).first()

        data.append({
            "account_id": a.account_id,
            "steam_id": a.steam_id,
            "personaname": a.personaname,
            "avatar_url": a.avatar_url,
            "rank_tier": a.rank_tier,
            "win": a.win,
            "lose": a.lose,
            "estimated_hours": a.estimated_hours,
            "is_public": a.is_public,
            "last_match_time": str(a.last_match_time) if a.last_match_time else None,
            "fetched_at": str(a.fetched_at) if a.fetched_at else None,
            "matches_in_db": match_count,
            "has_analysis": analysis is not None,
            "analysis_id": analysis.analysis_id if analysis else None,
            "estimated_mmr": analysis.estimated_mmr if analysis else None,
        })

    return {"total": len(data), "accounts": data}


@router.get("/player-account-detail/{account_id}")
def view_player_account_detail(account_id: int, db: Session = Depends(get_db)):
    """Детальный просмотр данных одного аккаунта: профиль + матчи + анализ."""
    acc = db.query(PlayerAccount).filter(PlayerAccount.account_id == account_id).first()
    if not acc:
        return {"error": "Аккаунт не найден"}

    # Matches
    matches = db.query(PlayerMatch).filter(
        PlayerMatch.account_id == account_id
    ).order_by(PlayerMatch.start_time.desc().nullslast()).limit(50).all()

    matches_data = []
    for m in matches:
        win = (m.radiant_win if m.player_slot is not None and m.player_slot < 128
               else (not m.radiant_win if m.radiant_win is not None else None))
        matches_data.append({
            "match_id": m.match_id,
            "hero_id": m.hero_id,
            "kills": m.kills,
            "deaths": m.deaths,
            "assists": m.assists,
            "gpm": m.gold_per_min,
            "xpm": m.xp_per_min,
            "last_hits": m.last_hits,
            "hero_damage": m.hero_damage,
            "tower_damage": m.tower_damage,
            "duration_min": round(m.duration / 60, 1) if m.duration else None,
            "lane_role": m.lane_role,
            "win": win,
            "start_time": m.start_time,
        })

    # Analysis
    analysis = db.query(MlPlayerAnalysis).filter(
        MlPlayerAnalysis.account_id == account_id
    ).order_by(MlPlayerAnalysis.created_at.desc().nullslast()).first()

    analysis_data = None
    if analysis:
        analysis_data = {
            "analysis_id": analysis.analysis_id,
            "estimated_mmr": analysis.estimated_mmr,
            "mmr_band": analysis.mmr_band,
            "summary": analysis.summary,
            "features": analysis.features,
            "strengths": analysis.strengths_ranked,
            "weaknesses": analysis.weaknesses_ranked,
            "heroes": analysis.heroes_data,
            "roles": analysis.roles_data,
        }

    return {
        "account": {
            "account_id": acc.account_id,
            "steam_id": acc.steam_id,
            "personaname": acc.personaname,
            "avatar_url": acc.avatar_url,
            "rank_tier": acc.rank_tier,
            "win": acc.win,
            "lose": acc.lose,
            "estimated_hours": acc.estimated_hours,
            "is_public": acc.is_public,
            "fetched_at": str(acc.fetched_at) if acc.fetched_at else None,
        },
        "matches_count": len(matches_data),
        "matches": matches_data,
        "analysis": analysis_data,
    }
