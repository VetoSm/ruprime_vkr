"""
Feature Engineering: computes baselines, player features, comparisons with benchmarks.
"""

import logging
import uuid

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import engine
from app.models import MlKaggleBaseline, MlPlayerAnalysis

logger = logging.getLogger(__name__)

# MMR bands based on rank_tier ranges
MMR_BANDS = [
    ("0-2000", 0, 39),
    ("2000-4000", 40, 59),
    ("4000-6000", 60, 79),
    ("6000+", 80, 100),
]


def rank_tier_to_mmr_band(rank_tier: float) -> str:
    """Convert rank_tier to mmr_band string."""
    if pd.isna(rank_tier) or rank_tier <= 0:
        return "0-2000"
    rt = int(rank_tier)
    # rank_tier format: first digit = medal (1-8), second = stars (0-5)
    medal = rt // 10
    if medal <= 3:
        return "0-2000"
    elif medal <= 5:
        return "2000-4000"
    elif medal <= 7:
        return "4000-6000"
    else:
        return "6000+"


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

    # Clear existing baselines
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM ml_kaggle_baselines"))
        conn.commit()

    # Insert new
    grouped.rename(columns={"lane_role": "role"}, inplace=True)
    grouped.to_sql("ml_kaggle_baselines", engine, if_exists="append", index=False)

    logger.info(f"Computed {len(grouped)} baselines")
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
    estimated_mmr = _estimate_mmr_from_stats(df, mmr_band)

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

    # Roles distribution
    roles_dist = df["lane_role"].value_counts(normalize=True).to_dict()
    roles_data = {
        "actual_roles_distribution": {f"POS{int(k)}": round(v, 3) for k, v in roles_dist.items() if pd.notna(k)},
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


def _compute_comparisons(df: pd.DataFrame, mmr_band: str) -> dict:
    """Compare player stats with baselines for the same MMR band."""
    baseline_query = f"""
    SELECT avg_gpm, avg_xpm, avg_kda, avg_deaths, avg_last_hits, avg_hero_damage, avg_tower_damage
    FROM ml_kaggle_baselines
    WHERE mmr_band = '{mmr_band}'
    """
    baselines = pd.read_sql(baseline_query, engine)

    if baselines.empty:
        return {"vs_same_tier": {}}

    avg_baseline = baselines.mean(numeric_only=True)
    player_gpm = df["gold_per_min"].fillna(0).mean() if "gold_per_min" in df.columns else 0
    player_xpm = df["xp_per_min"].fillna(0).mean() if "xp_per_min" in df.columns else 0
    player_kda = ((df["kills"].fillna(0) + df["assists"].fillna(0)) / df["deaths"].fillna(0).clip(lower=1)).mean()

    def safe_ratio(a, b):
        if pd.isna(a) or pd.isna(b) or b == 0:
            return 0.5
        return round(float(np.clip(a / max(b, 0.01), 0, 2)), 3)

    return {
        "vs_same_tier": {
            "gpm_percentile": safe_ratio(player_gpm, avg_baseline.get("avg_gpm", 1)),
            "xpm_percentile": safe_ratio(player_xpm, avg_baseline.get("avg_xpm", 1)),
            "kda_percentile": safe_ratio(player_kda, avg_baseline.get("avg_kda", 1)),
        }
    }


def _compute_strengths_weaknesses(df: pd.DataFrame, mmr_band: str) -> tuple[list, list]:
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

    baseline_query = f"""
    SELECT avg_gpm, avg_xpm, avg_kda, avg_kills, avg_deaths, avg_assists,
           avg_last_hits, avg_hero_damage, avg_tower_damage
    FROM ml_kaggle_baselines WHERE mmr_band = '{mmr_band}'
    """
    baselines = pd.read_sql(baseline_query, engine)

    strengths = []
    weaknesses = []

    if baselines.empty:
        return strengths, weaknesses

    avg_b = baselines.mean(numeric_only=True)

    def safe_col_mean(col, default=0):
        return df[col].fillna(0).mean() if col in df.columns else default

    kda_val = ((df["kills"].fillna(0) + df["assists"].fillna(0)) / df["deaths"].fillna(0).clip(lower=1)).mean()

    player_scores = {
        "gpm": safe_col_mean("gold_per_min") / max(avg_b.get("avg_gpm", 1), 1),
        "xpm": safe_col_mean("xp_per_min") / max(avg_b.get("avg_xpm", 1), 1),
        "kda": kda_val / max(avg_b.get("avg_kda", 1), 1),
        "last_hits": safe_col_mean("last_hits") / max(avg_b.get("avg_last_hits", 1), 1),
        "hero_damage": safe_col_mean("hero_damage") / max(avg_b.get("avg_hero_damage", 1), 1),
        "tower_damage": safe_col_mean("tower_damage") / max(avg_b.get("avg_tower_damage", 1), 1),
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


def analyze_player_from_account(account_id: int, player_profile_id: int = None, db: Session = None) -> dict:
    """
    Analyze a player based on their data in player_matches table (from OpenDota).
    This is separate from Kaggle data in ml_raw_players.
    """
    query = f"""
    SELECT
        match_id, hero_id, lane_role,
        kills, deaths, assists,
        gold_per_min, xp_per_min,
        last_hits, denies,
        hero_damage, tower_damage,
        duration, player_slot, radiant_win, start_time
    FROM player_matches
    WHERE account_id = {account_id}
    ORDER BY start_time DESC NULLS LAST
    LIMIT 200
    """

    df = pd.read_sql(query, engine)

    if df.empty:
        analysis_id = f"analysis_{uuid.uuid4().hex[:12]}"
        return _minimal_analysis(analysis_id, player_profile_id)

    # Compute win
    df["win"] = df.apply(
        lambda r: (r["radiant_win"] if r["player_slot"] is not None and r["player_slot"] < 128
                   else (not r["radiant_win"] if r["radiant_win"] is not None else False)),
        axis=1,
    ).astype(int)

    # KDA
    df["kda"] = (df["kills"].fillna(0) + df["assists"].fillna(0)) / df["deaths"].fillna(0).clip(lower=1)
    df["duration_minutes"] = df["duration"].fillna(0) / 60.0

    # Get rank from player_accounts if available
    rank_query = f"SELECT rank_tier FROM player_accounts WHERE account_id = {account_id}"
    try:
        rank_df = pd.read_sql(rank_query, engine)
        rank_tier = rank_df["rank_tier"].iloc[0] if not rank_df.empty else 0
    except Exception:
        rank_tier = 0

    mmr_band = rank_tier_to_mmr_band(rank_tier or 0)
    estimated_mmr = _estimate_mmr_from_stats(df, mmr_band)

    # Summary
    summary = {
        "estimated_rank_tier": mmr_band,
        "estimated_mmr": estimated_mmr,
        "games_analyzed": len(df),
        "winrate": round(df["win"].mean(), 3),
        "gpm_avg": round(df["gold_per_min"].fillna(0).mean(), 1),
        "xpm_avg": round(df["xp_per_min"].fillna(0).mean(), 1),
        "kda_avg": round(df["kda"].mean(), 2),
        "avg_kills": round(df["kills"].fillna(0).mean(), 1),
        "avg_deaths": round(df["deaths"].fillna(0).mean(), 1),
        "avg_assists": round(df["assists"].fillna(0).mean(), 1),
        "avg_duration_min": round(df["duration_minutes"].mean(), 1),
    }

    # Trends by time periods (group by batches of 20 games)
    df_sorted = df.sort_values("start_time", ascending=True).reset_index(drop=True)
    batch_size = max(len(df_sorted) // 5, 1)
    trends_data = []
    for i in range(0, len(df_sorted), batch_size):
        batch = df_sorted.iloc[i:i + batch_size]
        if len(batch) == 0:
            continue
        trends_data.append({
            "batch": f"Матчи {i+1}-{min(i+batch_size, len(df_sorted))}",
            "gpm": round(batch["gold_per_min"].fillna(0).mean(), 1),
            "xpm": round(batch["xp_per_min"].fillna(0).mean(), 1),
            "winrate": round(batch["win"].mean(), 3),
            "kda": round(batch["kda"].mean(), 2),
        })

    trends = {
        "gpm_over_time": [{"ts": t["batch"], "gpm": t["gpm"]} for t in trends_data],
        "xpm_over_time": [{"ts": t["batch"], "xpm": t["xpm"]} for t in trends_data],
        "winrate_over_time": [{"ts": t["batch"], "winrate": t["winrate"]} for t in trends_data],
        "kda_over_time": [{"ts": t["batch"], "kda": t["kda"]} for t in trends_data],
    }

    # Roles distribution
    roles_dist = df["lane_role"].dropna().value_counts(normalize=True).to_dict()
    roles_data = {
        "actual_roles_distribution": {f"POS{int(k)}": round(v, 3) for k, v in roles_dist.items() if pd.notna(k)},
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
    dur_mean = df["duration_minutes"].mean()
    features = {
        "lane_cs_per_min": round(df["last_hits"].fillna(0).mean() / max(dur_mean, 1), 2),
        "hero_damage_per_min": round(df["hero_damage"].fillna(0).mean() / max(dur_mean, 1), 0),
        "tower_damage_per_game": round(df["tower_damage"].fillna(0).mean(), 0),
        "avg_gpm": round(df["gold_per_min"].fillna(0).mean(), 1),
        "avg_xpm": round(df["xp_per_min"].fillna(0).mean(), 1),
        "avg_kda": round(df["kda"].mean(), 2),
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


def _minimal_analysis(analysis_id: str, player_profile_id: int = None) -> dict:
    """Return a minimal analysis for players with no data."""
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
        },
        "trends": {},
        "roles": {"actual_roles_distribution": {}},
        "heroes": {"top_heroes": []},
        "comparisons": {"vs_same_tier": {}},
        "features": {},
        "weaknesses_ranked": [],
        "strengths_ranked": [],
    }
