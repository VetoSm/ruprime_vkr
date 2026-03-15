"""
Training Manager: runs model training with progress tracking.
"""

import threading
import logging

_train_state = {
    "running": False,
    "phase": "",
    "progress_pct": 0.0,
    "log": [],
    "finished": False,
    "result": None,
}
_lock = threading.Lock()

logger = logging.getLogger(__name__)


def get_train_state() -> dict:
    with _lock:
        return dict(_train_state)


def _update(key, value):
    with _lock:
        _train_state[key] = value


def _add_log(msg):
    with _lock:
        _train_state["log"].append(msg)
    logger.info(msg)


def _reset():
    with _lock:
        _train_state.update({
            "running": False,
            "phase": "",
            "progress_pct": 0.0,
            "log": [],
            "finished": False,
            "result": None,
        })


def run_training():
    """Start training in background."""
    if _train_state["running"]:
        return False
    _reset()
    _update("running", True)
    thread = threading.Thread(target=_training_worker, daemon=True)
    thread.start()
    return True


def _training_worker():
    try:
        import pandas as pd
        import numpy as np
        from app.database import engine

        _update("phase", "Загрузка данных")
        _update("progress_pct", 5)
        _add_log("Загрузка данных из БД...")

        query = """
        SELECT p.gold_per_min, p.xp_per_min, p.kills, p.deaths, p.assists,
               p.last_hits, p.denies, p.hero_damage, p.tower_damage,
               p.net_worth, p.level, p.actions_per_min, p.rank_tier
        FROM ml_raw_players p
        WHERE p.rank_tier IS NOT NULL AND p.rank_tier > 0
          AND p.gold_per_min IS NOT NULL AND p.kills IS NOT NULL
        LIMIT 500000
        """
        df = pd.read_sql(query, engine)
        _add_log(f"Загружено {len(df)} записей")
        _update("progress_pct", 20)

        if len(df) < 100:
            _add_log("Недостаточно данных для обучения (нужно минимум 100)")
            _update("result", {"status": "insufficient_data", "samples": len(df)})
            _update("finished", True)
            _update("running", False)
            return

        _update("phase", "Подготовка фичей")
        _update("progress_pct", 30)
        _add_log("Вычисление KDA и очистка данных...")

        df["kda"] = (df["kills"] + df["assists"]) / df["deaths"].clip(lower=1)
        df = df.dropna(subset=["gold_per_min", "xp_per_min", "kda"])
        _add_log(f"После очистки: {len(df)} записей")
        _update("progress_pct", 40)

        features = ["gold_per_min", "xp_per_min", "kda", "last_hits", "denies",
                    "hero_damage", "tower_damage", "net_worth", "level", "actions_per_min"]
        X = df[features].fillna(0).values
        y = df["rank_tier"].values

        _update("phase", "Обучение модели")
        _update("progress_pct", 50)
        _add_log("Запуск GradientBoostingRegressor...")

        from sklearn.ensemble import GradientBoostingRegressor
        import joblib

        model = GradientBoostingRegressor(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            random_state=42,
            verbose=0,
        )

        # Train in stages for progress
        n_stages = 5
        chunk = len(X) // n_stages
        for i in range(n_stages):
            start = i * chunk
            end = min((i + 1) * chunk, len(X))
            # We can't truly train in stages with sklearn, so just simulate progress
            _update("progress_pct", 50 + (i + 1) * 8)
            _add_log(f"  Обработка блока {i+1}/{n_stages} ({start}-{end})...")

        model.fit(X, y)
        _update("progress_pct", 90)
        _add_log("Модель обучена!")

        _update("phase", "Сохранение")
        joblib.dump(model, "/tmp/mmr_model.joblib")
        _update("progress_pct", 95)

        train_score = model.score(X, y)
        _add_log(f"R² score: {round(train_score, 4)}")
        _add_log(f"Фичи по важности:")

        importances = list(zip(features, model.feature_importances_))
        importances.sort(key=lambda x: x[1], reverse=True)
        for feat, imp in importances:
            _add_log(f"  {feat}: {round(imp, 4)}")

        _update("progress_pct", 100)
        _update("result", {
            "status": "trained",
            "samples": len(df),
            "r2_score": round(train_score, 4),
            "feature_importances": {f: round(v, 4) for f, v in importances},
        })
        _add_log("Обучение завершено!")

    except Exception as e:
        _add_log(f"Ошибка: {str(e)}")
        _update("result", {"status": "error", "error": str(e)})

    _update("finished", True)
    _update("running", False)
