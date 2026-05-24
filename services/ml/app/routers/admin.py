import os
import json
import asyncio
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings
from app.csv_loader import load_constants
from app.feature_engine import compute_baselines
from app.mmr_estimator import train_mmr_model
from app.import_manager import run_import, get_state, request_cancel
from app.training_manager import run_training, get_train_state
from app.schemas import (
    LoadKaggleRequest, LoadKaggleResponse,
    LoadConstantsResponse, ComputeBaselinesResponse, MessageResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ml/admin", tags=["ml-admin"])


@router.post("/start-import")
def start_import(body: LoadKaggleRequest):
    """Start batch import from a directory (or 'all' for everything)."""
    data_path = settings.KAGGLE_DATA_PATH

    if body.directory_path == "all":
        dirs = []
        d2024 = os.path.join(data_path, "2024")
        if os.path.isdir(d2024):
            dirs.append(d2024)
        for month in range(1, 13):
            d = os.path.join(data_path, f"2025{month:02d}")
            if os.path.isdir(d):
                dirs.append(d)
    else:
        dirs = [body.directory_path]

    started = run_import(dirs)
    if not started:
        return {"status": "error", "message": "Импорт уже запущен"}
    return {"status": "started", "directories": len(dirs)}


@router.post("/cancel-import")
def cancel_import():
    """Cancel the running import."""
    request_cancel()
    return {"status": "cancel_requested"}


@router.get("/import-progress")
async def import_progress():
    """SSE endpoint for real-time import progress."""
    async def event_stream():
        while True:
            state = get_state()
            yield f"data: {json.dumps(state, ensure_ascii=False)}\n\n"
            if state.get("finished") or (not state.get("running") and state.get("files_done", 0) > 0):
                break
            if not state.get("running") and not state.get("finished"):
                # Not started yet, keep polling briefly
                await asyncio.sleep(0.5)
                state2 = get_state()
                if not state2.get("running"):
                    yield f"data: {json.dumps(state2, ensure_ascii=False)}\n\n"
                    break
            await asyncio.sleep(1)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/import-status")
def import_status():
    """Get current import status (non-SSE)."""
    return get_state()


# --- Legacy endpoints (still useful for simple calls) ---

@router.post("/load-kaggle-data", response_model=LoadKaggleResponse)
def load_kaggle_data(body: LoadKaggleRequest, db: Session = Depends(get_db)):
    """Load game data CSVs from a directory (synchronous, for small dirs)."""
    from app.csv_loader import load_game_data_directory
    directory = body.directory_path
    if not os.path.isdir(directory):
        return LoadKaggleResponse(status="error", files_processed=[{"error": f"Директория не найдена: {directory}"}])
    results = load_game_data_directory(directory)
    return LoadKaggleResponse(status="success", files_processed=results)


@router.post("/load-all-data", response_model=LoadKaggleResponse)
def load_all_data(db: Session = Depends(get_db)):
    """Load all game data synchronously."""
    from app.csv_loader import load_game_data_directory
    data_path = settings.KAGGLE_DATA_PATH
    all_results = []
    dir_2024 = os.path.join(data_path, "2024")
    if os.path.isdir(dir_2024):
        all_results.extend(load_game_data_directory(dir_2024))
    for month in range(1, 13):
        d = os.path.join(data_path, f"2025{month:02d}")
        if os.path.isdir(d):
            all_results.extend(load_game_data_directory(d))
    return LoadKaggleResponse(status="success", files_processed=all_results)


@router.post("/load-constants", response_model=LoadConstantsResponse)
def load_constants_endpoint(db: Session = Depends(get_db)):
    """Load hero, item, and ability constants."""
    result = load_constants(settings.KAGGLE_DATA_PATH)
    return LoadConstantsResponse(status="success", heroes_loaded=result["heroes"], items_loaded=result["items"], abilities_loaded=result["abilities"])


@router.post("/compute-baselines", response_model=ComputeBaselinesResponse)
def compute_baselines_endpoint(db: Session = Depends(get_db)):
    """Compute baseline statistics."""
    count = compute_baselines(db)
    return ComputeBaselinesResponse(status="success", baselines_computed=count)


@router.post("/train-mmr-model", response_model=MessageResponse)
def train_model(db: Session = Depends(get_db)):
    """Train MMR model (synchronous, legacy)."""
    result = train_mmr_model()
    return MessageResponse(message=str(result))


@router.post("/start-training")
def start_training():
    """Start MMR model training with progress tracking."""
    started = run_training()
    if not started:
        return {"status": "error", "message": "Обучение уже запущено"}
    return {"status": "started"}


@router.get("/training-status")
def training_status():
    """Get training progress."""
    return get_train_state()


# ---- Match Collector ----

from app.match_collector import start_collector, stop_collector, get_collector_status, request_match_parse


@router.post("/collector-start")
def collector_start():
    """Запустить фоновый сбор parsed матчей."""
    return start_collector()


@router.post("/collector-stop")
def collector_stop():
    """Остановить фоновый сбор."""
    return stop_collector()


@router.get("/collector-status")
def collector_status():
    """Статус сборщика: сколько собрано, последний запуск, логи."""
    return get_collector_status()


@router.post("/request-parse")
def request_parse(match_ids: list[int]):
    """Запросить парсинг конкретных матчей в OpenDota."""
    return request_match_parse(match_ids)


@router.post("/recompute-baselines")
def recompute_baselines_now(db: Session = Depends(get_db)):
    """Пересчитать baselines прямо сейчас."""
    count = compute_baselines(db)
    return {"status": "success", "baselines_computed": count}
