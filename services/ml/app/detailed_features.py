"""
Detailed Feature System: 6 categories, each with sub-components.
Score 0-10 where 10 = baseline for (rank, hero, role).
Computes current level, target level for desired rank, and gap.
"""

import logging
import pandas as pd
import numpy as np
from sqlalchemy.orm import Session

from app.database import engine
from app.models import PlayerAccount, MlKaggleBaseline

logger = logging.getLogger(__name__)

RANK_NAMES = {1: "HERALD", 2: "GUARDIAN", 3: "CRUSADER", 4: "ARCHON",
              5: "LEGEND", 6: "ANCIENT", 7: "DIVINE", 8: "IMMORTAL"}

RANK_TO_MMR_BAND = {
    "HERALD": "0-2000", "GUARDIAN": "0-2000", "CRUSADER": "2000-4000",
    "ARCHON": "2000-4000", "LEGEND": "4000-6000", "ANCIENT": "4000-6000",
    "DIVINE": "6000+", "IMMORTAL": "6000+",
}


def rank_tier_to_name(rt: int) -> str:
    if not rt:
        return "UNKNOWN"
    medal = rt // 10
    return RANK_NAMES.get(medal, "UNKNOWN")


def get_baseline_averages(mmr_band: str, db: Session) -> dict:
    """Get average baselines for an MMR band."""
    query = f"""
    SELECT
        AVG(avg_gpm) as gpm, AVG(avg_xpm) as xpm,
        AVG(avg_kills) as kills, AVG(avg_deaths) as deaths, AVG(avg_assists) as assists,
        AVG(avg_kda) as kda, AVG(avg_last_hits) as last_hits, AVG(avg_denies) as denies,
        AVG(avg_hero_damage) as hero_damage, AVG(avg_tower_damage) as tower_damage,
        AVG(winrate) as winrate, SUM(match_count) as total_matches
    FROM ml_kaggle_baselines
    WHERE mmr_band = '{mmr_band}'
    """
    df = pd.read_sql(query, engine)
    if df.empty or df.iloc[0]["gpm"] is None:
        return {}
    row = df.iloc[0]
    return {k: float(row[k]) if pd.notna(row[k]) else 0 for k in row.index}


def compute_detailed_features(account_id: int, desired_rank: str = None, db: Session = None) -> dict:
    """
    Compute 6 feature categories with sub-components.
    Each component: player value, baseline value, score (0-10), target, gap.
    """
    # Get player account data (lifetime totals)
    acc = db.query(PlayerAccount).filter(PlayerAccount.account_id == account_id).first() if db else None

    # Get player matches for recent stats
    match_query = f"""
    SELECT hero_id, kills, deaths, assists, gold_per_min, xp_per_min,
           last_hits, denies, hero_damage, tower_damage, hero_healing,
           duration, player_slot, radiant_win, lane_role, average_rank,
           is_detailed
    FROM player_matches
    WHERE account_id = {account_id}
    ORDER BY start_time DESC NULLS LAST
    """
    df = pd.read_sql(match_query, engine)

    if df.empty and not acc:
        return {"categories": [], "overall_score": 0, "error": "Нет данных"}

    # Determine current MMR band
    current_rank = rank_tier_to_name(acc.rank_tier) if acc and acc.rank_tier else "ARCHON"
    current_band = RANK_TO_MMR_BAND.get(current_rank, "2000-4000")

    # Determine target MMR band
    target_rank = (desired_rank or "IMMORTAL").upper().split(" ")[0].split("[")[0].strip()
    target_band = RANK_TO_MMR_BAND.get(target_rank, "6000+")

    # Get baselines
    current_baseline = get_baseline_averages(current_band, db)
    target_baseline = get_baseline_averages(target_band, db)

    # Compute player averages from matches + account totals
    player = _compute_player_averages(df, acc)

    # Build 6 categories
    categories = []

    # 1. Фарм и Экономика
    categories.append(_build_category(
        key="farming",
        name="Фарм и Экономика",
        icon="$",
        components=[
            _component("gpm", "Золото в минуту (GPM)", player.get("gpm", 0), current_baseline.get("gpm", 400), target_baseline.get("gpm", 500)),
            _component("last_hits", "Добивания крипов (LH/мин)", player.get("lh_per_min", 0), current_baseline.get("last_hits", 5) / max(player.get("avg_duration_min", 35), 1), target_baseline.get("last_hits", 6) / 35),
            _component("denies", "Денаи за игру", player.get("denies", 0), current_baseline.get("denies", 5), target_baseline.get("denies", 8)),
            _component("xpm", "Опыт в минуту (XPM)", player.get("xpm", 0), current_baseline.get("xpm", 450), target_baseline.get("xpm", 550)),
        ],
    ))

    # 2. Боевая эффективность
    categories.append(_build_category(
        key="combat",
        name="Боевая эффективность",
        icon="/",
        components=[
            _component("kda", "KDA", player.get("kda", 0), current_baseline.get("kda", 3.0), target_baseline.get("kda", 4.0)),
            _component("kills", "Убийства за игру", player.get("kills", 0), current_baseline.get("kills", 7), target_baseline.get("kills", 9)),
            _component("hero_damage", "Урон героям за игру", player.get("hero_damage", 0), current_baseline.get("hero_damage", 15000), target_baseline.get("hero_damage", 20000)),
            _component("assists", "Ассисты за игру", player.get("assists", 0), current_baseline.get("assists", 12), target_baseline.get("assists", 15)),
        ],
    ))

    # 3. Выживаемость
    avg_deaths_baseline = current_baseline.get("deaths", 6)
    avg_deaths_target = target_baseline.get("deaths", 5)
    categories.append(_build_category(
        key="survival",
        name="Выживаемость",
        icon="O",
        components=[
            _component_inverted("deaths", "Смертей за игру (меньше = лучше)", player.get("deaths", 0), avg_deaths_baseline, avg_deaths_target),
            _component("healing", "Лечение за игру", player.get("hero_healing", 0), 1500, 2500),
            _component("winrate", "Процент побед", player.get("winrate", 0.5) * 100, 50, 55),
        ],
    ))

    # 4. Картография и Вижн
    obs_per_game = player.get("obs_per_game", 0)
    sen_per_game = player.get("sen_per_game", 0)
    categories.append(_build_category(
        key="vision",
        name="Картография и Вижн",
        icon="E",
        components=[
            _component("observer_wards", "Обсервер варды за игру", obs_per_game, 2.0, 4.0),
            _component("sentry_wards", "Сентри варды за игру", sen_per_game, 2.0, 5.0),
            _component("wards_total", "Всего вардов за игру", obs_per_game + sen_per_game, 4.0, 8.0),
        ],
    ))

    # 5. Инициация и Контроль
    categories.append(_build_category(
        key="initiation",
        name="Инициация и Контроль",
        icon="/",
        components=[
            _component("tower_damage", "Урон по башням за игру", player.get("tower_damage", 0), current_baseline.get("tower_damage", 3000), target_baseline.get("tower_damage", 5000)),
            _component("tower_kills", "Башен уничтожено за игру", player.get("tower_kills_per_game", 0), 0.5, 1.0),
            _component("stuns", "Стан/контроль за игру", player.get("stuns_per_game", 0), 5.0, 10.0),
        ],
    ))

    # 6. Ранняя игра
    categories.append(_build_category(
        key="early_game",
        name="Ранняя игра",
        icon="~",
        components=[
            _component("xpm", "XPM (ранний опыт)", player.get("xpm", 0), current_baseline.get("xpm", 450), target_baseline.get("xpm", 550)),
            _component("last_hits_total", "LH за игру", player.get("last_hits", 0), current_baseline.get("last_hits", 150), target_baseline.get("last_hits", 200)),
            _component("gpm_early", "GPM (ранний фарм)", player.get("gpm", 0), current_baseline.get("gpm", 400), target_baseline.get("gpm", 500)),
        ],
    ))

    # Overall score
    overall = np.mean([c["score"] for c in categories]) if categories else 0

    # Top gaps (what to improve most)
    all_gaps = []
    for cat in categories:
        for comp in cat["components"]:
            if comp["gap"] > 0.5:
                all_gaps.append({
                    "category": cat["name"],
                    "category_key": cat["key"],
                    "component": comp["name"],
                    "component_key": comp["key"],
                    "current_score": comp["score"],
                    "target_score": comp["target_score"],
                    "gap": comp["gap"],
                    "player_value": comp["player_value"],
                    "target_value": comp["target_value"],
                })
    all_gaps.sort(key=lambda x: x["gap"], reverse=True)

    return {
        "categories": categories,
        "overall_score": round(overall, 1),
        "current_rank": current_rank,
        "current_band": current_band,
        "target_rank": target_rank,
        "target_band": target_band,
        "top_gaps": all_gaps[:10],
        "total_matches": len(df),
        "total_games_lifetime": acc.total_games if acc else len(df),
    }


def _compute_player_averages(df: pd.DataFrame, acc: PlayerAccount = None) -> dict:
    """Compute player averages from matches + account totals."""
    result = {}

    # From totals (lifetime, more accurate)
    if acc:
        result["gpm"] = acc.avg_gpm or 0
        result["xpm"] = acc.avg_xpm or 0
        result["kills"] = acc.avg_kills or 0
        result["deaths"] = acc.avg_deaths or 0
        result["assists"] = acc.avg_assists or 0
        result["last_hits"] = acc.avg_last_hits or 0
        result["denies"] = acc.avg_denies or 0
        result["hero_damage"] = acc.avg_hero_damage or 0
        result["tower_damage"] = acc.avg_tower_damage or 0
        result["hero_healing"] = acc.avg_hero_healing or 0
        result["avg_duration_min"] = (acc.avg_duration or 2000) / 60
        result["lh_per_min"] = result["last_hits"] / max(result["avg_duration_min"], 1)

        total = acc.total_games or 1
        result["stuns_per_game"] = (acc.total_stuns or 0) / max(total, 1)
        result["obs_per_game"] = (acc.total_obs_placed or 0) / max(total, 1)
        result["sen_per_game"] = (acc.total_sen_placed or 0) / max(total, 1)
        result["tower_kills_per_game"] = (acc.total_tower_kills or 0) / max(total, 1)

        wins = acc.win or 0
        losses = acc.lose or 0
        result["winrate"] = wins / max(wins + losses, 1)

    # From recent matches (override if available and more detailed)
    if not df.empty:
        detailed = df[df["is_detailed"] == True] if "is_detailed" in df.columns else pd.DataFrame()

        if not detailed.empty:
            result["gpm"] = result.get("gpm") or round(detailed["gold_per_min"].fillna(0).mean(), 1)
            result["xpm"] = result.get("xpm") or round(detailed["xp_per_min"].fillna(0).mean(), 1)
            result["hero_damage"] = result.get("hero_damage") or round(detailed["hero_damage"].fillna(0).mean(), 0)
            result["tower_damage"] = result.get("tower_damage") or round(detailed["tower_damage"].fillna(0).mean(), 0)
            result["hero_healing"] = result.get("hero_healing") or round(detailed["hero_healing"].fillna(0).mean(), 0)
            result["last_hits"] = result.get("last_hits") or round(detailed["last_hits"].fillna(0).mean(), 1)

        # KDA from all matches
        if not result.get("kills"):
            result["kills"] = round(df["kills"].fillna(0).mean(), 1)
            result["deaths"] = round(df["deaths"].fillna(0).mean(), 1)
            result["assists"] = round(df["assists"].fillna(0).mean(), 1)

        # Winrate from matches
        df["win"] = df.apply(
            lambda r: (r["radiant_win"] if r["player_slot"] is not None and r["player_slot"] < 128
                       else not r["radiant_win"]) if r["radiant_win"] is not None else False,
            axis=1,
        ).astype(int)
        if not result.get("winrate"):
            result["winrate"] = df["win"].mean()

    # KDA
    deaths = max(result.get("deaths", 1), 1)
    result["kda"] = round((result.get("kills", 0) + result.get("assists", 0)) / deaths, 2)

    return result


def _build_category(key: str, name: str, icon: str, components: list) -> dict:
    """Build a category from components."""
    scores = [c["score"] for c in components]
    avg_score = round(np.mean(scores), 1) if scores else 5.0
    target_scores = [c["target_score"] for c in components]
    avg_target = round(np.mean(target_scores), 1) if target_scores else 7.0
    gap = round(max(avg_target - avg_score, 0), 1)

    return {
        "key": key,
        "name": name,
        "icon": icon,
        "score": avg_score,
        "target": avg_target,
        "gap": gap,
        "components": components,
    }


def _component(key: str, name: str, player_value: float, baseline_value: float, target_value: float) -> dict:
    """Build a component where higher is better."""
    # Score: player / baseline * 5, capped at 10
    score = min(round((player_value / max(baseline_value, 0.01)) * 5, 1), 10) if baseline_value > 0 else 5.0
    target_score = min(round((target_value / max(baseline_value, 0.01)) * 5, 1), 10) if baseline_value > 0 else 7.0
    gap = round(max(target_score - score, 0), 1)
    pct = round(player_value / max(target_value, 0.01) * 100, 0) if target_value > 0 else 0

    return {
        "key": key,
        "name": name,
        "player_value": round(player_value, 1) if isinstance(player_value, float) else player_value,
        "baseline_value": round(baseline_value, 1) if isinstance(baseline_value, float) else baseline_value,
        "target_value": round(target_value, 1) if isinstance(target_value, float) else target_value,
        "score": score,
        "target_score": target_score,
        "gap": gap,
        "pct_of_target": pct,
    }


def _component_inverted(key: str, name: str, player_value: float, baseline_value: float, target_value: float) -> dict:
    """Build a component where lower is better (e.g. deaths)."""
    # Inverted: lower player value = higher score
    ratio = baseline_value / max(player_value, 0.01) if player_value > 0 else 1.0
    score = min(round(ratio * 5, 1), 10)
    target_ratio = baseline_value / max(target_value, 0.01) if target_value > 0 else 1.0
    target_score = min(round(target_ratio * 5, 1), 10)
    gap = round(max(target_score - score, 0), 1)

    return {
        "key": key,
        "name": name,
        "player_value": round(player_value, 1),
        "baseline_value": round(baseline_value, 1),
        "target_value": round(target_value, 1),
        "score": score,
        "target_score": target_score,
        "gap": gap,
        "pct_of_target": round(target_value / max(player_value, 0.01) * 100, 0) if player_value > 0 else 0,
    }
