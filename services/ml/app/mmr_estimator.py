"""
MMR Estimator: Trains a simple model to predict MMR from player stats.
Falls back to heuristic if no model is available.
"""

import logging
import os

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.database import engine

logger = logging.getLogger(__name__)

MODEL_PATH = "/tmp/mmr_model.joblib"


def train_mmr_model() -> dict:
    """Train a gradient boosting model on Kaggle data to predict rank_tier / MMR."""
    query = """
    SELECT
        p.gold_per_min, p.xp_per_min,
        p.kills, p.deaths, p.assists,
        p.last_hits, p.denies,
        p.hero_damage, p.tower_damage,
        p.net_worth, p.level,
        p.actions_per_min,
        p.rank_tier
    FROM ml_raw_players p
    WHERE p.rank_tier IS NOT NULL
      AND p.rank_tier > 0
      AND p.gold_per_min IS NOT NULL
      AND p.kills IS NOT NULL
    LIMIT 500000
    """

    df = pd.read_sql(query, engine)
    if len(df) < 100:
        return {"status": "insufficient_data", "samples": len(df)}

    df["kda"] = (df["kills"] + df["assists"]) / df["deaths"].clip(lower=1)
    df = df.dropna(subset=["gold_per_min", "xp_per_min", "kda"])

    features = ["gold_per_min", "xp_per_min", "kda", "last_hits", "denies",
                "hero_damage", "tower_damage", "net_worth", "level", "actions_per_min"]

    X = df[features].fillna(0).values
    y = df["rank_tier"].values

    try:
        from sklearn.ensemble import GradientBoostingRegressor
        import joblib

        model = GradientBoostingRegressor(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            random_state=42,
        )
        model.fit(X, y)
        joblib.dump(model, MODEL_PATH)

        # Simple evaluation
        train_score = model.score(X, y)
        return {"status": "trained", "samples": len(df), "r2_score": round(train_score, 4)}

    except Exception as e:
        logger.error(f"Model training failed: {e}")
        return {"status": "error", "error": str(e)}


def predict_mmr(stats: dict) -> int:
    """Predict MMR for a set of stats. Falls back to heuristic."""
    if os.path.exists(MODEL_PATH):
        try:
            import joblib
            model = joblib.load(MODEL_PATH)

            features = [
                stats.get("gold_per_min", 400),
                stats.get("xp_per_min", 500),
                stats.get("kda", 3.0),
                stats.get("last_hits", 150),
                stats.get("denies", 10),
                stats.get("hero_damage", 15000),
                stats.get("tower_damage", 3000),
                stats.get("net_worth", 15000),
                stats.get("level", 20),
                stats.get("actions_per_min", 100),
            ]

            rank_tier = model.predict([features])[0]
            # Convert rank_tier to approximate MMR
            medal = int(rank_tier) // 10
            mmr = medal * 1000 + 500
            return max(1000, min(9000, mmr))

        except Exception as e:
            logger.warning(f"Model prediction failed, using heuristic: {e}")

    # Heuristic fallback
    gpm = stats.get("gold_per_min", 400)
    xpm = stats.get("xp_per_min", 500)
    kda = stats.get("kda", 3.0)
    winrate = stats.get("winrate", 0.5)

    gpm_score = np.clip((gpm - 300) / 400, 0, 1)
    xpm_score = np.clip((xpm - 300) / 400, 0, 1)
    kda_score = np.clip((kda - 1) / 7, 0, 1)
    wr_score = np.clip((winrate - 0.3) / 0.4, 0, 1)

    composite = 0.3 * gpm_score + 0.2 * xpm_score + 0.3 * kda_score + 0.2 * wr_score
    return int(1000 + composite * 8000)
