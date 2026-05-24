"""
Feature Engineering: computes baselines, player features, comparisons with benchmarks.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import engine
from app.models import MlKaggleBaseline, MlPlayerAnalysis

logger = logging.getLogger(__name__)

# 8 MMR bands by medal (instead of 4 wide bands)
MMR_BANDS = [
    ("herald", 10, 19),
    ("guardian", 20, 29),
    ("crusader", 30, 39),
    ("archon", 40, 49),
    ("legend", 50, 59),
    ("ancient", 60, 69),
    ("divine", 70, 79),
    ("immortal", 80, 100),
]

# Fallback: map old 4-band names to new 8-band
OLD_TO_NEW_BAND = {
    "0-2000": "crusader",
    "2000-4000": "archon",
    "4000-6000": "ancient",
    "6000+": "immortal",
}


def rank_tier_to_mmr_band(rank_tier: float) -> str:
    """Convert rank_tier to mmr_band string (8 bands by medal)."""
    if pd.isna(rank_tier) or rank_tier <= 0:
        return "crusader"  # default for unknown
    rt = int(rank_tier)
    medal = rt // 10
    band_map = {
        1: "herald", 2: "guardian", 3: "crusader", 4: "archon",
        5: "legend", 6: "ancient", 7: "divine", 8: "immortal",
    }
    return band_map.get(medal, "crusader")


def compute_baselines(db: Session) -> int:
    """Compute baseline statistics for each (mmr_band, hero_id, lane_role) configuration."""
    logger.info("Computing baselines from raw player data...")

    query = """
    SELECT
        p.hero_id,
        p.lane_role,
        p.rank_tier,
        p.kills, p.deaths, p.assists,
        p.gold_per_min, p.xp_per_min,
        p.last_hits, p.denies,
        p.hero_damage, p.tower_damage, p.net_worth,
        CASE
            WHEN p.player_slot < 128 THEN m.radiant_win
            ELSE NOT m.radiant_win
        END as win
    FROM ml_raw_players p
    JOIN ml_raw_matches m ON p.match_id = m.match_id AND p.source_dir = m.source_dir
    WHERE p.hero_id IS NOT NULL
      AND p.kills IS NOT NULL
      AND p.gold_per_min IS NOT NULL
    """

    df = pd.read_sql(query, engine)
    if df.empty:
        logger.warning("No data for baselines computation")
        return 0

    # Assign MMR bands
    df["mmr_band"] = df["rank_tier"].apply(rank_tier_to_mmr_band)

    # Compute KDA
    df["kda"] = (df["kills"] + df["assists"]) / df["deaths"].clip(lower=1)

    # Group by (mmr_band, hero_id, lane_role)
    metrics = ["gold_per_min", "xp_per_min", "kills", "deaths", "assists",
               "kda", "last_hits", "denies", "hero_damage", "tower_damage", "net_worth"]

    grouped = df.groupby(["mmr_band", "hero_id", "lane_role"]).agg(
        avg_gpm=("gold_per_min", "mean"),
        avg_xpm=("xp_per_min", "mean"),
        avg_kills=("kills", "mean"),
        avg_deaths=("deaths", "mean"),
        avg_assists=("assists", "mean"),
        avg_kda=("kda", "mean"),
        avg_last_hits=("last_hits", "mean"),
        avg_denies=("denies", "mean"),
        avg_hero_damage=("hero_damage", "mean"),
        avg_tower_damage=("tower_damage", "mean"),
        avg_net_worth=("net_worth", "mean"),
        winrate=("win", "mean"),
        match_count=("win", "count"),
    ).reset_index()

    # Filter: at least 5 matches for a baseline
    grouped = grouped[grouped["match_count"] >= 5]

    # Compute percentiles per group
    def calc_percentiles(group):
        pct = {}
        for m in metrics:
            col = group[m].dropna()
            if len(col) < 3:
                continue
            pct[m] = {
                "p25": round(float(col.quantile(0.25)), 2),
                "p50": round(float(col.quantile(0.50)), 2),
                "p75": round(float(col.quantile(0.75)), 2),
                "p90": round(float(col.quantile(0.90)), 2),
                "p95": round(float(col.quantile(0.95)), 2),
            }
        return pct

    pct_map = {}
    for key, group in df.groupby(["mmr_band", "hero_id", "lane_role"]):
        pct_map[key] = calc_percentiles(group)

    def get_pct(row):
        key = (row["mmr_band"], row["hero_id"], row["lane_role"])
        return pct_map.get(key, {})

    grouped["percentiles"] = grouped.apply(get_pct, axis=1)

    # Clear existing baselines
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM ml_kaggle_baselines"))
        conn.commit()

    # Insert new
    grouped.rename(columns={"lane_role": "role"}, inplace=True)
    # Convert percentiles dict to JSON string for PostgreSQL JSONB
    import json as json_mod
    grouped["percentiles"] = grouped["percentiles"].apply(
        lambda x: json_mod.dumps(x) if isinstance(x, dict) else None
    )
    grouped.to_sql("ml_kaggle_baselines", engine, if_exists="append", index=False)

    logger.info(f"Computed {len(grouped)} baselines with percentiles (8 bands)")
    return len(grouped)


def analyze_player(account_id: int, player_profile_id: int = None, db: Session = None) -> dict:
    """Analyze a player based on their match history in raw data."""

    # Get player's matches
    query = f"""
    SELECT
        p.match_id, p.hero_id, p.lane_role, p.rank_tier,
        p.kills, p.deaths, p.assists,
        p.gold_per_min, p.xp_per_min,
        p.last_hits, p.denies,
        p.hero_damage, p.tower_damage, p.net_worth, p.level,
        p.obs_placed, p.sen_placed, p.camps_stacked,
        p.teamfight_participation, p.towers_killed, p.stuns,
        p.player_slot,
        m.duration, m.radiant_win, m.start_date_time
    FROM ml_raw_players p
    JOIN ml_raw_matches m ON p.match_id = m.match_id AND p.source_dir = m.source_dir
    WHERE p.account_id = {account_id}
      AND p.kills IS NOT NULL
    ORDER BY m.start_date_time DESC
    LIMIT 200
    """

    df = pd.read_sql(query, engine)

    if df.empty:
        # Return minimal analysis for unknown player
        analysis_id = f"analysis_{uuid.uuid4().hex[:12]}"
        return _minimal_analysis(analysis_id, player_profile_id)

    # Compute win
    df["win"] = df.apply(
        lambda r: (r["radiant_win"] if r["player_slot"] < 128 else not r["radiant_win"]),
        axis=1,
    ).astype(int)

    # KDA
    df["kda"] = (df["kills"] + df["assists"]) / df["deaths"].clip(lower=1)
    df["duration_minutes"] = df["duration"] / 60.0

    # Estimate MMR
    avg_rank_tier = df["rank_tier"].dropna().mean()
    mmr_band = rank_tier_to_mmr_band(avg_rank_tier)
    estimated_mmr = estimate_mmr(avg_rank_tier, df, mmr_band)

    # Summary
    summary = {
        "estimated_rank_tier": mmr_band,
        "estimated_mmr": estimated_mmr,
        "games_analyzed": len(df),
        "winrate": round(df["win"].mean(), 3),
        "gpm_avg": round(df["gold_per_min"].mean(), 1),
        "xpm_avg": round(df["xp_per_min"].mean(), 1),
        "kda_avg": round(df["kda"].mean(), 2),
        "avg_kills": round(df["kills"].mean(), 1),
        "avg_deaths": round(df["deaths"].mean(), 1),
        "avg_assists": round(df["assists"].mean(), 1),
        "avg_duration_min": round(df["duration_minutes"].mean(), 1),
    }

    # Trends (by month)
    df["month"] = pd.to_datetime(df["start_date_time"], errors="coerce").dt.to_period("M").astype(str)
    monthly = df.groupby("month").agg(
        gpm=("gold_per_min", "mean"),
        xpm=("xp_per_min", "mean"),
        winrate=("win", "mean"),
        kda=("kda", "mean"),
        games=("win", "count"),
    ).reset_index()
    trends = {
        "gpm_over_time": [{"ts": r["month"], "gpm": round(r["gpm"], 1)} for _, r in monthly.iterrows()],
        "xpm_over_time": [{"ts": r["month"], "xpm": round(r["xpm"], 1)} for _, r in monthly.iterrows()],
        "winrate_over_time": [{"ts": r["month"], "winrate": round(r["winrate"], 3)} for _, r in monthly.iterrows()],
        "kda_over_time": [{"ts": r["month"], "kda": round(r["kda"], 2)} for _, r in monthly.iterrows()],
    }

    # Roles distribution — filter out 0 (unknown)
    valid_roles = df["lane_role"].dropna()
    valid_roles = valid_roles[valid_roles > 0]
    roles_dist = valid_roles.value_counts(normalize=True).to_dict() if len(valid_roles) > 0 else {}
    roles_data = {
        "actual_roles_distribution": {f"POS{int(k)}": round(v, 3) for k, v in roles_dist.items() if pd.notna(k) and int(k) > 0},
    }

    # Top heroes
    hero_stats = df.groupby("hero_id").agg(
        games=("win", "count"),
        winrate=("win", "mean"),
        avg_kda=("kda", "mean"),
    ).reset_index().sort_values("games", ascending=False).head(10)
    heroes_data = {
        "top_heroes": [
            {"hero_id": int(r["hero_id"]), "games": int(r["games"]),
             "winrate": round(r["winrate"], 3), "avg_kda": round(r["avg_kda"], 2)}
            for _, r in hero_stats.iterrows()
        ]
    }

    # Comparisons with baselines
    comparisons = _compute_comparisons(df, mmr_band)

    # Features
    features = {
        "lane_cs_per_min": round(df["last_hits"].mean() / df["duration_minutes"].mean(), 2) if df["duration_minutes"].mean() > 0 else 0,
        "wards_placed_per_game": round((df["obs_placed"].fillna(0) + df["sen_placed"].fillna(0)).mean(), 1),
        "camps_stacked_per_game": round(df["camps_stacked"].fillna(0).mean(), 1),
        "teamfight_participation_avg": round(df["teamfight_participation"].fillna(0).mean(), 3),
        "towers_killed_per_game": round(df["towers_killed"].fillna(0).mean(), 2),
        "stuns_per_game": round(df["stuns"].fillna(0).mean(), 1),
    }

    # Strengths / Weaknesses
    strengths, weaknesses = _compute_strengths_weaknesses(df, mmr_band)

    analysis_id = f"analysis_{uuid.uuid4().hex[:12]}"

    # Save to DB
    if db:
        analysis = MlPlayerAnalysis(
            analysis_id=analysis_id,
            player_profile_id=player_profile_id,
            account_id=account_id,
            estimated_mmr=estimated_mmr,
            mmr_band=mmr_band,
            summary=summary,
            trends=trends,
            roles_data=roles_data,
            heroes_data=heroes_data,
            comparisons=comparisons,
            features=features,
            weaknesses_ranked=weaknesses,
            strengths_ranked=strengths,
        )
        db.add(analysis)
        db.commit()

    return {
        "ml_analysis_id": analysis_id,
        "summary": summary,
        "trends": trends,
        "roles": roles_data,
        "heroes": heroes_data,
        "comparisons": comparisons,
        "features": features,
        "weaknesses_ranked": weaknesses,
        "strengths_ranked": strengths,
    }


_RANK_TIER_TO_MMR = {
    1: 500,   # Herald
    2: 1200,  # Guardian
    3: 1900,  # Crusader
    4: 2700,  # Archon
    5: 3500,  # Legend
    6: 4300,  # Ancient
    7: 5200,  # Divine
    8: 6500,  # Immortal
}


def estimate_mmr(rank_tier: int | float | None, df: pd.DataFrame | None = None, mmr_band: str | None = None) -> int:
    """Single source of truth for "estimated MMR".

    Prefers the rank_tier → MMR mapping (Valve's own calibration is always
    closer to reality than any heuristic on averages). Only falls back to
    the stats-based heuristic when the profile is closed / rank unknown.
    The whole app — analyze_player, detailed_features, the dashboard card —
    must go through this function so we stop showing two different numbers
    for the same user.
    """
    if rank_tier:
        try:
            rt = int(rank_tier)
        except (TypeError, ValueError):
            rt = 0
        if rt > 0:
            medal = rt // 10
            stars = rt % 10
            base = _RANK_TIER_TO_MMR.get(medal)
            if base is not None:
                return base + max(stars - 1, 0) * 150

    if df is None or df.empty:
        return 1000
    return _estimate_mmr_from_stats(df, mmr_band or "crusader")


def infer_rank_tier_from_matches(df: pd.DataFrame | None, recent_limit: int = 10) -> tuple[int | None, str]:
    """Infer current rank_tier from the most recent ranked match averages.

    Priority:
    1. Player account profile rank_tier is handled by callers before this.
    2. Median average_rank from the latest ranked matches with average_rank.
       Median is more robust than mode/mean when one match has a noisy lobby.
    3. None, so callers can decide whether to show unknown or use a heuristic.
    """
    if df is None or df.empty or "average_rank" not in df.columns:
        return None, "unknown"

    scope = df.copy()
    if "start_time" in scope.columns:
        scope = scope.sort_values("start_time", ascending=False, na_position="last")

    # Average_rank is only meaningful for ranked matches — turbo's
    # ``average_rank`` is randomised garbage. Use the proper cluster
    # classifier so a Captain's Mode draft (game_mode != 22) but in a
    # ranked lobby still counts.
    if {"lobby_type", "game_mode"}.intersection(scope.columns):
        ranked_scope = add_cluster_column(scope.copy())
        ranked_scope = ranked_scope[ranked_scope["cluster"] == CLUSTER_RANKED]
        if not ranked_scope.empty:
            scope = ranked_scope

    ranks = pd.to_numeric(scope["average_rank"], errors="coerce").dropna()
    ranks = ranks[(ranks > 0) & (ranks < 100)]
    if ranks.empty:
        return None, "unknown"
    recent_ranks = ranks.head(max(int(recent_limit), 1))
    return int(round(float(recent_ranks.median()))), "recent_ranked_average_rank"


def _estimate_mmr_from_stats(df: pd.DataFrame, mmr_band: str) -> int:
    """Simple heuristic MMR estimation based on GPM/XPM/KDA percentiles."""
    avg_gpm = df["gold_per_min"].fillna(0).mean()
    avg_xpm = df["xp_per_min"].fillna(0).mean()
    avg_kda = ((df["kills"].fillna(0) + df["assists"].fillna(0)) / df["deaths"].fillna(0).clip(lower=1)).mean()
    winrate = df["win"].mean() if "win" in df.columns else 0.5

    # Handle NaN
    if pd.isna(avg_gpm): avg_gpm = 0
    if pd.isna(avg_xpm): avg_xpm = 0
    if pd.isna(avg_kda): avg_kda = 0
    if pd.isna(winrate): winrate = 0.5

    gpm_score = float(np.clip((avg_gpm - 300) / 400, 0, 1))
    xpm_score = float(np.clip((avg_xpm - 300) / 400, 0, 1))
    kda_score = float(np.clip((avg_kda - 1) / 7, 0, 1))
    wr_score = float(np.clip((winrate - 0.3) / 0.4, 0, 1))

    composite = 0.3 * gpm_score + 0.2 * xpm_score + 0.3 * kda_score + 0.2 * wr_score
    if pd.isna(composite):
        composite = 0.0
    estimated = int(1000 + composite * 8000)
    return min(max(estimated, 1000), 9000)


def _baseline_scope_conditions(mmr_band: str, role: int | None = None, hero_id: int | None = None) -> list[tuple[str, str]]:
    """Return baseline WHERE clauses from most specific to broadest."""
    safe_band = str(mmr_band).replace("'", "''")
    scopes = []
    if role and hero_id:
        scopes.append(("same_rank_role_hero", f"mmr_band = '{safe_band}' AND role = {int(role)} AND hero_id = {int(hero_id)}"))
    if role:
        scopes.append(("same_rank_role", f"mmr_band = '{safe_band}' AND role = {int(role)}"))
    if hero_id:
        scopes.append(("same_rank_hero", f"mmr_band = '{safe_band}' AND hero_id = {int(hero_id)}"))
    scopes.append(("same_rank", f"mmr_band = '{safe_band}'"))
    return scopes


def _read_baselines_for_scope(mmr_band: str, role: int | None = None, hero_id: int | None = None, columns: str = "*") -> tuple[pd.DataFrame, str]:
    for scope, where_clause in _baseline_scope_conditions(mmr_band, role, hero_id):
        df = pd.read_sql(f"SELECT {columns} FROM ml_kaggle_baselines WHERE {where_clause}", engine)
        if not df.empty:
            return df, scope
    return pd.DataFrame(), "none"


def _mean_present(series: pd.Series, digits: int = 1, default=None):
    """Mean over values that are actually present.

    OpenDota's /players/{id}/matches history often lacks economy fields like
    GPM/XPM for older rows. Treating those NULLs as zero makes the UI look like
    the player farmed 0 GPM; it really means "metric not loaded for this row".
    """
    values = pd.to_numeric(series, errors="coerce").dropna()
    if values.empty:
        return default
    return round(float(values.mean()), digits)


def _series_present(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").dropna()


def _sample_quality(df: pd.DataFrame | None) -> dict:
    if df is None or df.empty:
        return {
            "matches_count": 0,
            "gpm_count": 0,
            "xpm_count": 0,
            "role_count": 0,
            "average_rank_count": 0,
            "latest_match_at": None,
        }

    latest_match_at = None
    if "start_time" in df.columns:
        starts = pd.to_numeric(df["start_time"], errors="coerce").dropna()
        if not starts.empty:
            latest_match_at = datetime.fromtimestamp(int(starts.max()), tz=timezone.utc).isoformat()

    role_count = 0
    if "lane_role" in df.columns:
        roles = pd.to_numeric(df["lane_role"], errors="coerce").dropna()
        role_count = int(((roles >= 1) & (roles <= 5)).sum())

    average_rank_count = 0
    if "average_rank" in df.columns:
        ranks = pd.to_numeric(df["average_rank"], errors="coerce").dropna()
        average_rank_count = int(((ranks > 0) & (ranks < 100)).sum())

    return {
        "matches_count": int(len(df)),
        "gpm_count": int(_series_present(df["gold_per_min"]).count()) if "gold_per_min" in df.columns else 0,
        "xpm_count": int(_series_present(df["xp_per_min"]).count()) if "xp_per_min" in df.columns else 0,
        "role_count": role_count,
        "average_rank_count": average_rank_count,
        "latest_match_at": latest_match_at,
    }


def _data_freshness(df: pd.DataFrame | None, *, min_sample: int = 10, stale_days: int = 90) -> str:
    if df is None or df.empty:
        return "no_matches"
    if len(df) < min_sample:
        return "low_sample"
    if "start_time" in df.columns:
        starts = pd.to_numeric(df["start_time"], errors="coerce").dropna()
        if not starts.empty:
            cutoff = datetime.now(timezone.utc).timestamp() - stale_days * 24 * 3600
            if float(starts.max()) < cutoff:
                return "stale"
    return "fresh"


def _compute_comparisons(df: pd.DataFrame, mmr_band: str, filters: dict | None = None) -> dict:
    """Compare player stats with baselines for the same MMR band."""
    filters = filters or {}
    baselines, scope = _read_baselines_for_scope(
        mmr_band,
        role=filters.get("role"),
        hero_id=filters.get("hero_id"),
        columns="avg_gpm, avg_xpm, avg_kda, avg_deaths, avg_last_hits, avg_hero_damage, avg_tower_damage",
    )

    if baselines.empty:
        return {"vs_same_tier": {}, "baseline_scope": "none"}

    avg_baseline = baselines.mean(numeric_only=True)
    player_gpm = _mean_present(df["gold_per_min"], default=None) if "gold_per_min" in df.columns else None
    player_xpm = _mean_present(df["xp_per_min"], default=None) if "xp_per_min" in df.columns else None
    player_kda = ((df["kills"].fillna(0) + df["assists"].fillna(0)) / df["deaths"].fillna(0).clip(lower=1)).mean()

    def safe_ratio(a, b):
        if pd.isna(a) or pd.isna(b) or b == 0:
            return 0.5
        return round(float(np.clip(a / max(b, 0.01), 0, 2)), 3)

    return {
        "baseline_scope": scope,
        "vs_same_tier": {
            "gpm_percentile": safe_ratio(player_gpm, avg_baseline.get("avg_gpm", 1)),
            "xpm_percentile": safe_ratio(player_xpm, avg_baseline.get("avg_xpm", 1)),
            "kda_percentile": safe_ratio(player_kda, avg_baseline.get("avg_kda", 1)),
        }
    }


def _compute_strengths_weaknesses(df: pd.DataFrame, mmr_band: str, filters: dict | None = None) -> tuple[list, list]:
    """Determine player's strengths and weaknesses based on baselines."""
    metrics = {
        "gpm": ("gold_per_min", "Farm and Economy"),
        "xpm": ("xp_per_min", "Experience gain"),
        "kda": (None, "Combat Efficiency"),
        "last_hits": ("last_hits", "Last Hitting"),
        "hero_damage": ("hero_damage", "Hero Damage"),
        "tower_damage": ("tower_damage", "Tower Damage"),
        "teamfight": ("teamfight_participation", "Teamfight Participation"),
        "vision": (None, "Vision (Wards)"),
    }

    filters = filters or {}
    baselines, _scope = _read_baselines_for_scope(
        mmr_band,
        role=filters.get("role"),
        hero_id=filters.get("hero_id"),
        columns=(
            "avg_gpm, avg_xpm, avg_kda, avg_kills, avg_deaths, avg_assists, "
            "avg_last_hits, avg_hero_damage, avg_tower_damage"
        ),
    )

    strengths = []
    weaknesses = []

    if baselines.empty:
        return strengths, weaknesses

    avg_b = baselines.mean(numeric_only=True)

    def safe_col_mean(col, default=0):
        return df[col].fillna(0).mean() if col in df.columns else default

    kda_val = ((df["kills"].fillna(0) + df["assists"].fillna(0)) / df["deaths"].fillna(0).clip(lower=1)).mean()

    player_scores = {
        "gpm": (_mean_present(df["gold_per_min"], default=0) or 0) / max(avg_b.get("avg_gpm", 1), 1),
        "xpm": (_mean_present(df["xp_per_min"], default=0) or 0) / max(avg_b.get("avg_xpm", 1), 1),
        "kda": kda_val / max(avg_b.get("avg_kda", 1), 1),
        "last_hits": (_mean_present(df["last_hits"], default=0) or 0) / max(avg_b.get("avg_last_hits", 1), 1),
        "hero_damage": (_mean_present(df["hero_damage"], default=0) or 0) / max(avg_b.get("avg_hero_damage", 1), 1),
        "tower_damage": (_mean_present(df["tower_damage"], default=0) or 0) / max(avg_b.get("avg_tower_damage", 1), 1),
    }

    for key, score in player_scores.items():
        label = metrics[key][1]
        score_10 = min(round(score * 5, 1), 10)  # Scale to 0-10

        entry = {"feature": key, "score": round(score_10, 1), "description": label}
        if score >= 1.1:
            strengths.append(entry)
        elif score <= 0.85:
            weaknesses.append(entry)

    strengths.sort(key=lambda x: x["score"], reverse=True)
    weaknesses.sort(key=lambda x: x["score"])

    return strengths, weaknesses


from app.match_clusters import (
    CLUSTER_RANKED, CLUSTER_TURBO, CLUSTER_UNRANKED, CLUSTER_OTHER,
    add_cluster_column, counts_by_cluster,
)

# Legacy constants kept only because external modules import them. New
# filtering goes through ``match_clusters.classify_*``.
RANKED_GAME_MODES = {2, 3, 4, 22}
TURBO_GAME_MODE = 23

DEFAULT_STATS_MODE = "ranked"
DEFAULT_STATS_PERIOD = "50"
# Minimum ranked matches in the analysis window before we trust the
# ranked baseline. Below that we fall back to unranked+turbo with a clear
# disclaimer on the response.
RANKED_FALLBACK_MIN = 8


def _filter_ranked(df: pd.DataFrame) -> pd.DataFrame:
    """Keep only matches that classify as ``ranked``.

    NULL ``lobby_type`` is treated as ``unranked`` (see
    ``match_clusters``), so legacy rows never sneak into the ranked
    baseline. They'll start being counted as ranked again the next time
    OpenDota re-syncs with the lobby_type populated.
    """
    if df.empty:
        return df
    out = add_cluster_column(df.copy())
    return out[out["cluster"] == CLUSTER_RANKED].copy()


def normalize_stats_filters(
    mode: str | None = None,
    period: str | None = None,
    role: int | str | None = None,
    hero_id: int | str | None = None,
) -> dict:
    """Normalize user-facing stats filters into a small trusted dict."""
    mode_val = (mode or DEFAULT_STATS_MODE).lower()
    if mode_val not in {"ranked", "turbo", "unranked", "all"}:
        mode_val = DEFAULT_STATS_MODE

    period_val = str(period or DEFAULT_STATS_PERIOD).lower()
    if period_val not in {"20", "50", "month", "all"}:
        period_val = DEFAULT_STATS_PERIOD

    def _to_int(value, min_value=None, max_value=None):
        if value in (None, "", "all"):
            return None
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return None
        if min_value is not None and parsed < min_value:
            return None
        if max_value is not None and parsed > max_value:
            return None
        return parsed

    return {
        "mode": mode_val,
        "period": period_val,
        "role": _to_int(role, 1, 5),
        "hero_id": _to_int(hero_id, 1, None),
    }


def apply_stats_filters(df: pd.DataFrame, filters: dict | None = None) -> tuple[pd.DataFrame, dict]:
    """Apply mode/period/role/hero filters to newest-first match rows.

    Order matters for product semantics: "last 50 ranked, POS3" means first
    take the latest 50 ranked-ish matches, then narrow that report by POS3.
    That way role buckets add up to the number the player sees in the current
    report, with an explicit "unknown role" bucket for unparsed rows.
    """
    filters = normalize_stats_filters(**(filters or {}))
    result = df.copy()
    total_available = int(len(result))

    if "start_time" in result.columns:
        result = result.sort_values("start_time", ascending=False, na_position="last").reset_index(drop=True)

    # Classify every row into ranked / turbo / unranked / other up front
    # so subsequent filtering and counts share one definition.
    result = add_cluster_column(result)
    cluster_counts = counts_by_cluster(result)
    mode_counts = {
        "all": total_available,
        "ranked": cluster_counts.get(CLUSTER_RANKED, 0),
        "turbo": cluster_counts.get(CLUSTER_TURBO, 0),
        "unranked": cluster_counts.get(CLUSTER_UNRANKED, 0),
        "other": cluster_counts.get(CLUSTER_OTHER, 0),
        # Legacy field — some callers still read it. Maps to "lobby_type
        # missing AND not turbo" which we now reclassify as unranked.
        "unknown": cluster_counts.get(CLUSTER_UNRANKED, 0) if "lobby_type" not in result.columns else 0,
    }

    # Mode filter — for product semantics we always apply the user's
    # choice strictly. The "automatic fallback to unranked+turbo when
    # ranked is empty" happens upstream (analyze_player_from_account)
    # because it needs to communicate *that fallback* to the UI.
    if filters["mode"] in {CLUSTER_RANKED, CLUSTER_TURBO, CLUSTER_UNRANKED}:
        result = result[result["cluster"] == filters["mode"]]

    after_mode = int(len(result))

    before_period = int(len(result))
    date_from = None
    limit = None
    if filters["period"] in {"20", "50"}:
        limit = int(filters["period"])
        result = result.head(limit)
    elif filters["period"] == "month" and "start_time" in result.columns:
        date_from = int((datetime.now(timezone.utc) - timedelta(days=30)).timestamp())
        result = result[result["start_time"].fillna(0) >= date_from]

    after_period = int(len(result))

    role_counts: dict[str, int] = {str(i): 0 for i in range(1, 6)}
    unknown_role_count = 0
    if "lane_role" in result.columns:
        role_values = pd.to_numeric(result["lane_role"], errors="coerce")
        valid_roles_for_counts = role_values[(role_values >= 1) & (role_values <= 5)]
        for role_num, count in valid_roles_for_counts.value_counts().to_dict().items():
            role_counts[str(int(role_num))] = int(count)
        unknown_role_count = int(after_period - len(valid_roles_for_counts))

    explicit_role = filters["role"]
    role_source = "explicit" if explicit_role else "auto"
    auto_role = None
    role_pool = result.copy()
    if explicit_role and "lane_role" in result.columns:
        result = result[result["lane_role"] == explicit_role]
    elif not explicit_role and "lane_role" in result.columns:
        valid_roles = result["lane_role"].dropna()
        valid_roles = valid_roles[(valid_roles >= 1) & (valid_roles <= 5)]
        # OpenDota only fills lane_role for parsed matches (recentMatches +
        # explicit /request). For unparsed history the column is NULL. If we
        # blindly auto-filter by the most common role we'd discard 95 % of the
        # history just because we know the role for 5 % of it. So only apply
        # auto-role when at least ~30 % of the available matches have a
        # detected role and we'll keep at least 10 of them after filtering.
        if not valid_roles.empty and len(valid_roles) >= 10 and len(valid_roles) >= 0.3 * max(len(result), 1):
            candidate = int(valid_roles.mode().iloc[0])
            kept = int((result["lane_role"] == candidate).sum())
            if kept >= 10:
                auto_role = candidate
                filters["role"] = auto_role
                result = result[result["lane_role"] == auto_role]

    if filters["hero_id"] and "hero_id" in result.columns:
        result = result[result["hero_id"] == filters["hero_id"]]

    filtered_count = int(len(result))
    narrowing_applied = bool(filters["role"] or filters["hero_id"])
    labels = {
        "mode": {
            "ranked": "рейтинговые матчи",
            "turbo": "turbo-матчи",
            "unranked": "обычные матчи (без рейтинга)",
            "all": "все режимы",
        }[filters["mode"]],
        "period": {
            "20": "последние 20",
            "50": "последние 50",
            "month": "последние 30 дней",
            "all": "вся загруженная история",
        }[filters["period"]],
    }

    meta = {
        **filters,
        "label": f"{labels['period']}, {labels['mode']}",
        "total_available": total_available,
        "mode_counts": mode_counts,
        "after_mode_count": after_mode,
        "after_period_count": after_period,
        "role_source": role_source if filters["role"] else "none",
        "auto_role": auto_role,
        "role_pool_count": int(len(role_pool)),
        "role_counts": role_counts,
        "unknown_role_count": unknown_role_count,
        "before_period_count": before_period,
        "base_report_count": after_period,
        "narrowing_applied": narrowing_applied,
        "matches_count": filtered_count,
        "limit": limit,
        "date_from": date_from,
    }
    if filters["role"]:
        role_label = f"POS{filters['role']}"
        if meta["role_source"] == "auto":
            meta["label"] = f"{meta['label']}, основная роль {role_label}"
        else:
            meta["label"] = f"{meta['label']}, роль {role_label}"
    return result.copy(), meta


def analyze_player_from_account(
    account_id: int,
    player_profile_id: int = None,
    db: Session = None,
    filters: dict | None = None,
) -> dict:
    """
    Analyze a player based on their data in player_matches table (from OpenDota).
    This is separate from Kaggle data in ml_raw_players.

    Notes on data accuracy:
    * Input is every match we managed to load for this account (no LIMIT).
      Deep-sync fills this table up to PLAYER_DEEP_SYNC_MAX_MATCHES in the
      background; summary will stabilise as more matches arrive. The default
      product view then narrows that history to the latest ranked matches.
    * Per-match CS/min and damage/min are computed on each match and then
      averaged, which is mathematically different from (mean last_hits) /
      (mean duration) and gives the correct expected value.
    * Matches without a radiant_win signal are excluded from winrate instead
      of being silently counted as losses.
    """
    query = f"""
    SELECT
        match_id, hero_id, lane_role, game_mode, lobby_type,
        kills, deaths, assists,
        gold_per_min, xp_per_min,
        last_hits, denies,
        hero_damage, tower_damage,
        duration, player_slot, radiant_win, start_time, average_rank,
        obs_placed, sen_placed
    FROM player_matches
    WHERE account_id = {account_id}
    ORDER BY start_time DESC NULLS LAST
    """

    df_all = pd.read_sql(query, engine)

    if df_all.empty:
        analysis_id = f"analysis_{uuid.uuid4().hex[:12]}"
        return _minimal_analysis(analysis_id, player_profile_id)

    normalized_filters = normalize_stats_filters(**(filters or {}))
    df, filters_applied = apply_stats_filters(df_all, normalized_filters)
    sample_quality = _sample_quality(df)
    freshness = _data_freshness(df)

    # Ranked is our preferred analytical baseline. If the user is on the
    # default ('ranked') and we don't have enough ranked data, fall back
    # to unranked+turbo so they get *some* analysis — but mark it so the
    # UI can warn that comparisons are less reliable.
    fallback_in_effect = False
    fallback_notice = None
    requested_mode = normalized_filters["mode"]
    if (
        requested_mode == CLUSTER_RANKED
        and len(df) < RANKED_FALLBACK_MIN
    ):
        relaxed = dict(normalized_filters)
        relaxed["mode"] = "all"
        df_fallback, fb_applied = apply_stats_filters(df_all, relaxed)
        # Only switch if the fallback actually has more material than the
        # ranked-only slice (otherwise we'd show the user a tiny mixed
        # report instead of an honest "few ranked matches" report).
        if len(df_fallback) > len(df):
            df = df_fallback
            filters_applied = {
                **fb_applied,
                "requested_mode": requested_mode,
                "effective_mode": "all",
                "fallback_in_effect": True,
            }
            fallback_in_effect = True
            fallback_notice = (
                f"Для рейтинговых матчей нашлось всего "
                f"{filters_applied['mode_counts'].get('ranked', 0)} — "
                "анализ построен по всем доступным режимам, перцентили снижены по надёжности."
            )

    if df.empty:
        ranked_only_notice = "По выбранным фильтрам нет матчей. Измените фильтр режима, роли, героя или периода."
    else:
        ranked_only_notice = fallback_notice

    # Win per match — only when we actually know radiant_win and player_slot.
    def _win_row(row):
        rw = row.get("radiant_win")
        slot = row.get("player_slot")
        if rw is None or slot is None:
            return None
        return int(rw) if int(slot) < 128 else int(not rw)

    df["win"] = df.apply(_win_row, axis=1)

    # KDA
    df["kda"] = (df["kills"].fillna(0) + df["assists"].fillna(0)) / df["deaths"].fillna(0).clip(lower=1)
    df["duration_minutes"] = df["duration"].fillna(0) / 60.0
    # Per-match rates (mean of ratios is correct; ratio of means is not).
    safe_dur = df["duration_minutes"].where(df["duration_minutes"] > 0)
    df["cs_per_min"] = (df["last_hits"].fillna(0) / safe_dur).where(safe_dur.notna())
    df["hero_damage_per_min"] = (df["hero_damage"].fillna(0) / safe_dur).where(safe_dur.notna())
    metric_counts = {
        "gpm": int(_series_present(df["gold_per_min"]).count()) if "gold_per_min" in df.columns else 0,
        "xpm": int(_series_present(df["xp_per_min"]).count()) if "xp_per_min" in df.columns else 0,
        "last_hits": int(_series_present(df["last_hits"]).count()) if "last_hits" in df.columns else 0,
        "hero_damage": int(_series_present(df["hero_damage"]).count()) if "hero_damage" in df.columns else 0,
    }

    # Get rank from player_accounts if available
    rank_query = f"SELECT rank_tier FROM player_accounts WHERE account_id = {account_id}"
    try:
        rank_df = pd.read_sql(rank_query, engine)
        rank_tier = rank_df["rank_tier"].iloc[0] if not rank_df.empty else 0
    except Exception:
        rank_tier = 0

    rank_source = "account_rank_tier" if rank_tier else "unknown"
    effective_rank_tier = rank_tier
    if not effective_rank_tier:
        effective_rank_tier, rank_source = infer_rank_tier_from_matches(df_all)
    mmr_band = rank_tier_to_mmr_band(effective_rank_tier or 0)
    estimated_mmr = estimate_mmr(effective_rank_tier, df, mmr_band)
    if rank_source == "unknown" and estimated_mmr:
        rank_source = "stats_heuristic"

    # Winrate: mean of win column where it is known. If all values are null
    # (no decidable matches), fall back to None so the UI can hide the number
    # instead of showing a fake "0%".
    decidable_wins = df["win"].dropna()
    winrate_val = round(float(decidable_wins.mean()), 3) if len(decidable_wins) > 0 else None

    # Lifetime/parsed counts from player_accounts so that the analysis shares
    # the same "всего игр" source of truth as the rest of the app.
    lifetime_games = 0
    parsed_games_n = 0
    try:
        counts_df = pd.read_sql(
            f"SELECT COALESCE(lifetime_games, 0) AS lifetime_games, "
            f"COALESCE(parsed_games_n, 0) AS parsed_games_n, "
            f"COALESCE(win, 0) AS win, COALESCE(lose, 0) AS lose "
            f"FROM player_accounts WHERE account_id = {account_id}",
            engine,
        )
        if not counts_df.empty:
            r = counts_df.iloc[0]
            lifetime_games = int(r["lifetime_games"] or (r["win"] + r["lose"]))
            parsed_games_n = int(r["parsed_games_n"])
    except Exception:
        pass

    if df.empty:
        analysis_id = f"analysis_{uuid.uuid4().hex[:12]}"
        summary = {
            "estimated_rank_tier": mmr_band,
            "estimated_mmr": estimated_mmr,
            "rank_source": rank_source,
            "rank_tier": int(effective_rank_tier) if effective_rank_tier else None,
            "total_games": lifetime_games,
            "games_analyzed": 0,
            "games_analyzed_ranked": 0 if normalized_filters["mode"] == "ranked" else None,
            "filters_applied": filters_applied,
            "stats_scope_label": filters_applied["label"],
            "parsed_games_n": parsed_games_n,
            "winrate": None,
            "gpm_avg": None,
            "xpm_avg": None,
            "kda_avg": 0,
            "notice": ranked_only_notice,
            "metric_counts": metric_counts,
            "sample_quality": sample_quality,
            "data_freshness": freshness,
            "last_match_at": sample_quality.get("latest_match_at"),
        }
        return {
            "ml_analysis_id": analysis_id,
            "summary": summary,
            "trends": {},
            "roles": {"actual_roles_distribution": {}},
            "heroes": {"top_heroes": []},
            "comparisons": {"vs_same_tier": {}, "baseline_scope": "none"},
            "features": {},
            "weaknesses_ranked": [],
            "strengths_ranked": [],
        }

    summary = {
        "estimated_rank_tier": mmr_band,
        "estimated_mmr": estimated_mmr,
        "rank_source": rank_source,
        "rank_tier": int(effective_rank_tier) if effective_rank_tier else None,
        # User-visible "всего игр" is always lifetime.
        "total_games": lifetime_games,
        # Analytics-only counts — kept for tech panel / debugging.
        "games_analyzed": int(len(df)),
        "games_analyzed_ranked": int(len(df)) if normalized_filters["mode"] == "ranked" else None,
        "filters_applied": filters_applied,
        "stats_scope_label": filters_applied["label"],
        "parsed_games_n": parsed_games_n,
        "winrate": winrate_val,
        "gpm_avg": _mean_present(df["gold_per_min"], 1, default=None),
        "xpm_avg": _mean_present(df["xp_per_min"], 1, default=None),
        "kda_avg": round(df["kda"].mean(), 2),
        "avg_kills": round(df["kills"].fillna(0).mean(), 1),
        "avg_deaths": round(df["deaths"].fillna(0).mean(), 1),
        "avg_assists": round(df["assists"].fillna(0).mean(), 1),
        "avg_duration_min": round(df["duration_minutes"].mean(), 1),
        "cs_per_min_avg": round(float(df["cs_per_min"].dropna().mean() or 0), 2),
        "hero_damage_per_min_avg": round(float(df["hero_damage_per_min"].dropna().mean() or 0), 0),
        "notice": ranked_only_notice,
        "metric_counts": metric_counts,
        "sample_quality": sample_quality,
        "data_freshness": freshness,
        "last_match_at": sample_quality.get("latest_match_at"),
    }

    # Trends by time periods (group by batches of 20 games).
    # ``trends`` feeds the frontend "Динамика" chart on /stats. Keep the
    # metric set wide enough that users can flip through their growth in
    # different dimensions (combat / farm / consistency), but only emit
    # series for metrics where the underlying column was present — otherwise
    # the chart would show a flat zero line and look like a bug.
    df_sorted = df.sort_values("start_time", ascending=True).reset_index(drop=True)
    batch_size = max(len(df_sorted) // 5, 1)
    trends_data = []
    for i in range(0, len(df_sorted), batch_size):
        batch = df_sorted.iloc[i:i + batch_size]
        if len(batch) == 0:
            continue
        decidable = batch["win"].dropna()
        # Surface batch positional bounds + a representative unix timestamp so
        # the frontend can pick its X-axis flavour: numeric match index for
        # the dashboard "Динамика" mini-chart (3 ticks: 1, mid, last) or a
        # formatted date for the /stats Dynamics chart. ``start_ts``/``end_ts``
        # are unix seconds (None when start_time was NaN for the whole batch).
        start_times = batch["start_time"].dropna()
        start_ts = int(start_times.min()) if len(start_times) > 0 else None
        end_ts = int(start_times.max()) if len(start_times) > 0 else None
        trends_data.append({
            "batch": f"Матчи {i+1}-{min(i+batch_size, len(df_sorted))}",
            "batch_start_idx": i + 1,
            "batch_end_idx": min(i + batch_size, len(df_sorted)),
            "start_ts": start_ts,
            "end_ts": end_ts,
            "gpm":       _mean_present(batch["gold_per_min"], 1, default=None),
            "xpm":       _mean_present(batch["xp_per_min"], 1, default=None),
            "winrate":   round(float(decidable.mean()), 3) if len(decidable) > 0 else None,
            "kda":       round(batch["kda"].mean(), 2),
            "kills":     _mean_present(batch["kills"], 1, default=None),
            "deaths":    _mean_present(batch["deaths"], 1, default=None),
            "assists":   _mean_present(batch["assists"], 1, default=None),
            "last_hits": _mean_present(batch["last_hits"], 0, default=None),
            "cs_per_min": _mean_present(batch["cs_per_min"], 2, default=None),
            "hero_damage_per_min": _mean_present(batch["hero_damage_per_min"], 0, default=None),
            "tower_damage": _mean_present(batch["tower_damage"], 0, default=None),
        })

    def _series(metric: str) -> list:
        out = []
        for t in trends_data:
            v = t.get(metric)
            if v is not None:
                out.append({
                    "ts": t["batch"],
                    "batch_start_idx": t["batch_start_idx"],
                    "batch_end_idx": t["batch_end_idx"],
                    "start_ts": t["start_ts"],
                    "end_ts": t["end_ts"],
                    metric: v,
                })
        return out

    trends = {
        "gpm_over_time":            _series("gpm"),
        "xpm_over_time":            _series("xpm"),
        "winrate_over_time":        _series("winrate"),
        "kda_over_time":            _series("kda"),
        "kills_over_time":          _series("kills"),
        "deaths_over_time":         _series("deaths"),
        "assists_over_time":        _series("assists"),
        "last_hits_over_time":      _series("last_hits"),
        "cs_per_min_over_time":     _series("cs_per_min"),
        "hero_damage_per_min_over_time": _series("hero_damage_per_min"),
        "tower_damage_over_time":   _series("tower_damage"),
    }

    # Roles distribution — filter out 0 (unknown) lane_role
    valid_roles = df["lane_role"].dropna()
    valid_roles = valid_roles[valid_roles > 0]
    roles_dist = valid_roles.value_counts(normalize=True).to_dict() if len(valid_roles) > 0 else {}
    roles_data = {
        "actual_roles_distribution": {f"POS{int(k)}": round(v, 3) for k, v in roles_dist.items() if pd.notna(k) and int(k) > 0},
    }

    # Top heroes
    hero_stats = pd.DataFrame(columns=["hero_id", "games", "winrate", "avg_kda"])
    if not df.empty and "hero_id" in df.columns:
        hero_stats = df.dropna(subset=["hero_id"]).groupby("hero_id").agg(
            games=("match_id", "count"),
            winrate=("win", "mean"),
            avg_kda=("kda", "mean"),
        ).reset_index().sort_values("games", ascending=False).head(10)
    def _safe_round(v, digits):
        try:
            if v is None or pd.isna(v):
                return None
            return round(float(v), digits)
        except Exception:
            return None

    heroes_data = {
        "top_heroes": [
            {"hero_id": int(r["hero_id"]), "games": int(r["games"]),
             "winrate": _safe_round(r["winrate"], 3),
             "avg_kda": _safe_round(r["avg_kda"], 2)}
            for _, r in hero_stats.iterrows()
        ]
    }

    # Comparisons with baselines
    comparisons = _compute_comparisons(df, mmr_band, normalized_filters)

    # Features. All "per minute" fields use the per-match series computed above,
    # not a ratio of means, which would bias towards long/short games.
    features = {
        "lane_cs_per_min": round(float(df["cs_per_min"].dropna().mean() or 0), 2),
        "hero_damage_per_min": round(float(df["hero_damage_per_min"].dropna().mean() or 0), 0),
        "tower_damage_per_game": _mean_present(df["tower_damage"], 0, default=None),
        "avg_gpm": _mean_present(df["gold_per_min"], 1, default=None),
        "avg_xpm": _mean_present(df["xp_per_min"], 1, default=None),
        "avg_kda": round(df["kda"].mean(), 2),
    }

    # Strengths / Weaknesses
    strengths, weaknesses = _compute_strengths_weaknesses(df, mmr_band, normalized_filters)

    analysis_id = f"analysis_{uuid.uuid4().hex[:12]}"

    # Save to DB
    if db:
        analysis = MlPlayerAnalysis(
            analysis_id=analysis_id,
            player_profile_id=player_profile_id,
            account_id=account_id,
            estimated_mmr=estimated_mmr,
            mmr_band=mmr_band,
            summary=summary,
            trends=trends,
            roles_data=roles_data,
            heroes_data=heroes_data,
            comparisons=comparisons,
            features=features,
            weaknesses_ranked=weaknesses,
            strengths_ranked=strengths,
        )
        db.add(analysis)
        db.commit()

    return {
        "ml_analysis_id": analysis_id,
        "summary": summary,
        "trends": trends,
        "roles": roles_data,
        "heroes": heroes_data,
        "comparisons": comparisons,
        "features": features,
        "weaknesses_ranked": weaknesses,
        "strengths_ranked": strengths,
    }


def _minimal_analysis(analysis_id: str, player_profile_id: int = None) -> dict:
    """Return a minimal analysis for players with no data."""
    sample_quality = _sample_quality(pd.DataFrame())
    return {
        "ml_analysis_id": analysis_id,
        "summary": {
            "estimated_rank_tier": "BEGINNER",
            "estimated_mmr": 1000,
            "games_analyzed": 0,
            "winrate": 0,
            "gpm_avg": 0,
            "xpm_avg": 0,
            "kda_avg": 0,
            "avg_kills": 0,
            "avg_deaths": 0,
            "avg_assists": 0,
            "avg_duration_min": 0,
            "data_freshness": "no_matches",
            "last_match_at": None,
            "sample_quality": sample_quality,
        },
        "trends": {},
        "roles": {"actual_roles_distribution": {}},
        "heroes": {"top_heroes": []},
        "comparisons": {"vs_same_tier": {}},
        "features": {},
        "weaknesses_ranked": [],
        "strengths_ranked": [],
    }
