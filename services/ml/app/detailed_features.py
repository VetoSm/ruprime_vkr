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
    "HERALD": "herald", "GUARDIAN": "guardian", "CRUSADER": "crusader",
    "ARCHON": "archon", "LEGEND": "legend", "ANCIENT": "ancient",
    "DIVINE": "divine", "IMMORTAL": "immortal",
}


def rank_tier_to_name(rt: int) -> str:
    if not rt:
        return "UNKNOWN"
    medal = rt // 10
    return RANK_NAMES.get(medal, "UNKNOWN")


def get_baseline_percentiles(mmr_band: str) -> dict[str, dict]:
    """Aggregate the per-(hero,role) percentile JSON stored in
    ``ml_kaggle_baselines`` into a single mmr_band-level distribution per
    metric.

    Strategy: for each metric (gold_per_min, xp_per_min, kills, …) take the
    median of each percentile across all hero/role rows of the band. It's
    not a statistically pure percentile merge, but it is the best we can do
    without the raw samples and is an order of magnitude better than "value
    over average" scoring: Immortal cap no longer leaks into Crusader.
    """
    query = f"""
    SELECT percentiles FROM ml_kaggle_baselines
    WHERE mmr_band = '{mmr_band}' AND percentiles IS NOT NULL
    """
    df = pd.read_sql(query, engine)
    if df.empty:
        return {}

    aggregated: dict[str, dict[str, list[float]]] = {}
    for raw in df["percentiles"].dropna():
        if not isinstance(raw, dict):
            continue
        for metric, pcts in raw.items():
            if not isinstance(pcts, dict):
                continue
            slot = aggregated.setdefault(metric, {})
            for key, val in pcts.items():
                try:
                    slot.setdefault(key, []).append(float(val))
                except (TypeError, ValueError):
                    continue

    result: dict[str, dict] = {}
    for metric, pct_lists in aggregated.items():
        result[metric] = {
            k: float(np.median(v)) for k, v in pct_lists.items() if v
        }
    return result


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
    current_pcts = get_baseline_percentiles(current_band)

    def _pct(metric: str) -> dict | None:
        """Shortcut: percentile dict for ``metric`` in the current band."""
        return current_pcts.get(metric)

    # Compute player averages from matches + account totals
    player = _compute_player_averages(df, acc)

    # Build 8 categories (no duplicates, honest about missing data)
    categories = []
    dur_min = max(player.get("avg_duration_min", 35), 1)

    # Helper: check if player has data for a metric
    def has_data(key, min_val=0.001):
        return player.get(key, 0) > min_val

    # 1. Фарм
    categories.append(_build_category(
        key="farming",
        name="Фарм",
        icon="$",
        components=[
            _component("gpm", "Золото в минуту (GPM)",
                       player.get("gpm", 0),
                       current_baseline.get("gpm", 400),
                       target_baseline.get("gpm", 500),
                       percentiles=_pct("gold_per_min")),
            _component("cs_per_min", "Крипов в минуту (CS/мин)",
                       player.get("last_hits", 0) / dur_min,
                       current_baseline.get("last_hits", 150) / 35,
                       target_baseline.get("last_hits", 180) / 35),
            _component("denies", "Денаи за игру",
                       player.get("denies", 0),
                       current_baseline.get("denies", 5),
                       target_baseline.get("denies", 8),
                       percentiles=_pct("denies")),
            _component("last_hits", "Последних ударов за игру",
                       player.get("last_hits", 0),
                       current_baseline.get("last_hits", 150),
                       target_baseline.get("last_hits", 180),
                       percentiles=_pct("last_hits")),
        ],
    ))

    # 2. Бой
    categories.append(_build_category(
        key="combat",
        name="Боевая эффективность",
        icon="/",
        components=[
            _component("kda", "KDA",
                       player.get("kda", 0),
                       current_baseline.get("kda", 3.0),
                       target_baseline.get("kda", 4.5),
                       percentiles=_pct("kda")),
            _component("hero_damage_per_min", "Урон героям в минуту",
                       player.get("hero_damage", 0) / dur_min,
                       current_baseline.get("hero_damage", 15000) / 35,
                       target_baseline.get("hero_damage", 20000) / 35),
            _component("kills", "Убийства за игру",
                       player.get("kills", 0),
                       current_baseline.get("kills", 5),
                       target_baseline.get("kills", 6),
                       percentiles=_pct("kills")),
            _component("assists", "Ассисты за игру",
                       player.get("assists", 0),
                       current_baseline.get("assists", 10),
                       target_baseline.get("assists", 13),
                       percentiles=_pct("assists")),
        ],
    ))

    # 3. Выживаемость
    categories.append(_build_category(
        key="survival",
        name="Выживаемость",
        icon="O",
        components=[
            _component_inverted("deaths", "Смертей за игру (меньше = лучше)",
                                player.get("deaths", 0),
                                current_baseline.get("deaths", 5),
                                target_baseline.get("deaths", 4),
                                percentiles=_pct("deaths")),
            _component("winrate", "Процент побед",
                       (player.get("winrate") or 0.5) * 100, 50, 55),
            _component("healing", "Лечение за игру", player.get("hero_healing", 0), 1000, 2000),
        ],
    ))

    # 4. Вижн (с проверкой наличия данных)
    obs = player.get("obs_per_game", 0)
    sen = player.get("sen_per_game", 0)
    vision_has_data = has_data("obs_per_game") or has_data("sen_per_game")
    categories.append(_build_category(
        key="vision",
        name="Вижн и Картография",
        icon="E",
        components=[
            _component("observer_wards", "Обсервер варды/игра", obs, 2.0, 4.0),
            _component("sentry_wards", "Сентри варды/игра", sen, 2.0, 4.0),
        ] if vision_has_data else [
            _component("vision_data", "Недостаточно данных — нужны parsed матчи", 0, 1, 1),
        ],
    ))

    # 5. Объекты
    categories.append(_build_category(
        key="objectives",
        name="Давление на объекты",
        icon="T",
        components=[
            _component("tower_damage", "Урон по башням",
                       player.get("tower_damage", 0),
                       current_baseline.get("tower_damage", 2000),
                       target_baseline.get("tower_damage", 3000),
                       percentiles=_pct("tower_damage")),
            _component("tower_kills", "Башен уничтожено/игра", player.get("tower_kills_per_game", 0), 0.5, 1.0),
            _component("objective_focus", "Фокус на объектах (tower/hero dmg)", player.get("tower_damage", 0) / max(player.get("hero_damage", 1), 1), 0.1, 0.15),
        ],
    ))

    # 6. Механика
    apm = player.get("apm", 0)
    apm_has_data = apm > 0
    xpm_component = _component(
        "xpm", "Опыт в минуту (XPM)",
        player.get("xpm", 0),
        current_baseline.get("xpm", 450),
        target_baseline.get("xpm", 550),
        percentiles=_pct("xp_per_min"),
    )
    level_component = _component("level", "Средний уровень", player.get("avg_level", 0), 19, 22)
    categories.append(_build_category(
        key="mechanics",
        name="Механический скилл",
        icon="A",
        components=[
            _component("apm", "Действий в минуту (APM)", apm, 80, 120),
            xpm_component,
            level_component,
        ] if apm_has_data else [
            xpm_component,
            level_component,
        ],
    ))

    # 7. Стабильность
    categories.append(_build_category(
        key="consistency",
        name="Стабильность",
        icon="S",
        components=[
            _component("winrate", "Общий винрейт (%)", (player.get("winrate") or 0.5) * 100, 50, 55),
            _component("hero_count", "Пул героев", player.get("hero_count", 0), 10, 20),
            _component("total_games", "Опыт (всего игр)", min(player.get("total_games", 0) / 100, 10) * 10, 50, 80),
        ],
    ))

    # 8. Контроль (stuns)
    stuns = player.get("stuns_per_game", 0)
    stuns_has_data = stuns > 0
    categories.append(_build_category(
        key="control",
        name="Контроль и инициация",
        icon="C",
        components=[
            _component("stuns", "Секунд стана/игра", stuns, 15, 25),
        ] if stuns_has_data else [
            _component("stuns_data", "Недостаточно данных — нужны parsed матчи", 0, 1, 1),
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

    lifetime_games = getattr(acc, "lifetime_games", None) or (acc.total_games if acc else None) or len(df)
    parsed_games_n = getattr(acc, "parsed_games_n", None) or 0

    return {
        "categories": categories,
        "overall_score": round(overall, 1),
        "current_rank": current_rank,
        "current_band": current_band,
        "target_rank": target_rank,
        "target_band": target_band,
        "top_gaps": all_gaps[:10],
        # Number of matches we have locally in player_matches for this account.
        "total_matches": int(len(df)),
        # Lifetime count shown in the UI as "всего игр".
        "total_games_lifetime": int(lifetime_games),
        # Number of parsed matches OpenDota has detailed data for; intended for
        # the tech panel, not for user-facing labels.
        "parsed_games_n": int(parsed_games_n),
    }


def _compute_player_averages(df: pd.DataFrame, acc: PlayerAccount = None) -> dict:
    """Compute player averages from matches + account totals."""
    result = {}

    # From totals (parsed-match averages, more accurate than recent matches).
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

        # Cumulative fields (wards, stuns, tower kills) come only from parsed
        # matches. Dividing them by lifetime_games would understate everyone,
        # especially supports. Use parsed_games_n; if it's not available yet
        # (legacy row), fall back to lifetime to keep something non-zero.
        parsed_n = getattr(acc, "parsed_games_n", None) or 0
        lifetime_n = getattr(acc, "lifetime_games", None) or acc.total_games or 0
        denom = parsed_n if parsed_n > 0 else max(lifetime_n, 1)
        result["parsed_games_n"] = parsed_n
        result["lifetime_games"] = lifetime_n
        result["stuns_per_game"] = (acc.total_stuns or 0) / denom
        result["obs_per_game"] = (acc.total_obs_placed or 0) / denom
        result["sen_per_game"] = (acc.total_sen_placed or 0) / denom
        result["tower_kills_per_game"] = (acc.total_tower_kills or 0) / denom
        # "Total games" shown to the user must be the lifetime count.
        result["total_games"] = lifetime_n

        wins = acc.win or 0
        losses = acc.lose or 0
        result["winrate"] = wins / max(wins + losses, 1) if (wins + losses) > 0 else None

        # Additional metrics from totals
        result["apm"] = getattr(acc, "avg_apm", 0) or 0
        result["avg_level"] = getattr(acc, "avg_level", 0) or 0
        result["hero_count"] = 0  # Will be computed from matches

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

    # Hero count from matches
    if not df.empty and "hero_id" in df.columns:
        result["hero_count"] = df["hero_id"].nunique()

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


# Anchor scores used when turning a player value into a 0..10 score. The
# anchors correspond to percentile positions inside the rank/role baseline:
# p25 → 3.0, p50 → 5.0, p75 → 7.0, p90 → 8.5, p95 → 10. Values between
# anchors are linearly interpolated, values below p25 go down to 0 at 0,
# values above p95 stay at 10. This replaces the old "value/baseline * 5"
# formula, which was too forgiving for outliers (a turbo carry with 1000 GPM
# could score "Immortal-level" farming against a crusader baseline).
_PCT_ANCHORS = [
    (0.0, 0.0),
    (0.25, 3.0),
    (0.50, 5.0),
    (0.75, 7.0),
    (0.90, 8.5),
    (0.95, 10.0),
]


def _score_from_percentile(percentile_value: float) -> float:
    """Map a percentile in [0, 1] to the 0..10 anchor scale."""
    if percentile_value <= 0:
        return 0.0
    if percentile_value >= _PCT_ANCHORS[-1][0]:
        return _PCT_ANCHORS[-1][1]
    for i in range(1, len(_PCT_ANCHORS)):
        lo_p, lo_s = _PCT_ANCHORS[i - 1]
        hi_p, hi_s = _PCT_ANCHORS[i]
        if percentile_value <= hi_p:
            span = hi_p - lo_p
            if span <= 0:
                return hi_s
            t = (percentile_value - lo_p) / span
            return round(lo_s + t * (hi_s - lo_s), 1)
    return 10.0


def _value_to_percentile(value: float, percentiles: dict | None, inverted: bool = False) -> float:
    """Return the percentile position of ``value`` inside the ``percentiles``
    distribution.

    ``percentiles`` is expected to have keys ``p25/p50/p75/p90/p95`` (floats).
    If it's missing or malformed we return 0.5 so the metric receives a
    neutral score instead of biasing up or down.

    When ``inverted=True`` (e.g. deaths — lower is better), we reflect the
    position: a very low value becomes a very high percentile.
    """
    if not percentiles:
        return 0.5
    try:
        anchors = [
            (0.25, float(percentiles["p25"])),
            (0.50, float(percentiles["p50"])),
            (0.75, float(percentiles["p75"])),
            (0.90, float(percentiles["p90"])),
            (0.95, float(percentiles["p95"])),
        ]
    except (KeyError, TypeError, ValueError):
        return 0.5

    # Sort anchors by the value-axis to handle malformed inputs and the
    # inverted case (we reflect later).
    anchors_by_val = sorted(anchors, key=lambda x: x[1])
    lo_p, lo_v = 0.0, anchors_by_val[0][1] * 0.5  # virtual "zero" below p25
    hi_p, hi_v = 1.0, anchors_by_val[-1][1] * 1.2  # virtual ceiling above p95
    points = [(lo_p, lo_v)] + anchors_by_val + [(hi_p, hi_v)]

    result = 0.0
    if value <= points[0][1]:
        result = 0.0
    elif value >= points[-1][1]:
        result = 1.0
    else:
        for i in range(1, len(points)):
            p_prev, v_prev = points[i - 1]
            p_next, v_next = points[i]
            if value <= v_next:
                span = v_next - v_prev
                if span <= 0:
                    result = p_next
                    break
                t = (value - v_prev) / span
                result = p_prev + t * (p_next - p_prev)
                break

    if inverted:
        result = 1.0 - result
    return max(0.0, min(1.0, result))


def _component(
    key: str,
    name: str,
    player_value: float,
    baseline_value: float,
    target_value: float,
    *,
    percentiles: dict | None = None,
) -> dict:
    """Higher-is-better component. Uses percentile-based scoring when the
    baseline row includes a ``percentiles`` dict; otherwise falls back to
    the legacy "value / baseline * 5" formula so existing tests keep passing.
    """
    if percentiles:
        player_pct = _value_to_percentile(player_value, percentiles)
        target_pct = _value_to_percentile(target_value, percentiles)
        score = _score_from_percentile(player_pct)
        target_score = _score_from_percentile(target_pct)
    else:
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


def _component_inverted(
    key: str,
    name: str,
    player_value: float,
    baseline_value: float,
    target_value: float,
    *,
    percentiles: dict | None = None,
) -> dict:
    """Lower-is-better component (deaths, for example)."""
    if percentiles:
        player_pct = _value_to_percentile(player_value, percentiles, inverted=True)
        target_pct = _value_to_percentile(target_value, percentiles, inverted=True)
        score = _score_from_percentile(player_pct)
        target_score = _score_from_percentile(target_pct)
    else:
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
