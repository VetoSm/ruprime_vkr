"""
Import Manager: handles batch CSV import with progress tracking and cancellation.
Uses a global state dict so the SSE endpoint can stream progress.
"""

import os
import threading
import logging
import time
from typing import Optional

import pandas as pd
from app.database import engine
from app.csv_loader import GAME_DATA_FILES, CHUNK_SIZE

logger = logging.getLogger(__name__)

# Global import state
_import_state = {
    "running": False,
    "cancel_requested": False,
    "current_file": "",
    "current_dir": "",
    "progress_pct": 0.0,
    "rows_loaded": 0,
    "total_files": 0,
    "files_done": 0,
    "log": [],
    "error": None,
    "finished": False,
}
_lock = threading.Lock()


def get_state() -> dict:
    with _lock:
        return dict(_import_state)


def request_cancel():
    with _lock:
        _import_state["cancel_requested"] = True


def _update(key: str, value):
    with _lock:
        _import_state[key] = value


def _add_log(msg: str):
    with _lock:
        _import_state["log"].append(msg)
    logger.info(msg)


def _reset():
    with _lock:
        _import_state.update({
            "running": False,
            "cancel_requested": False,
            "current_file": "",
            "current_dir": "",
            "progress_pct": 0.0,
            "rows_loaded": 0,
            "total_files": 0,
            "files_done": 0,
            "log": [],
            "error": None,
            "finished": False,
        })


def run_import(directories: list[str]):
    """Run import in background thread."""
    if _import_state["running"]:
        return False

    _reset()
    _update("running", True)

    thread = threading.Thread(target=_import_worker, args=(directories,), daemon=True)
    thread.start()
    return True


def _import_worker(directories: list[str]):
    """Worker that loads CSVs from multiple directories with progress."""
    try:
        # Count total files
        total_files = 0
        dir_files = []
        for d in directories:
            if not os.path.isdir(d):
                _add_log(f"Директория не найдена: {d}")
                continue
            files = []
            for fname in GAME_DATA_FILES.keys():
                fpath = os.path.join(d, fname)
                if os.path.exists(fpath):
                    files.append((fname, fpath))
                    total_files += 1
            dir_files.append((d, files))

        _update("total_files", total_files)
        if total_files == 0:
            _add_log("Нет файлов для загрузки")
            _update("finished", True)
            _update("running", False)
            return

        files_done = 0
        total_rows = 0

        for dir_path, files in dir_files:
            dir_name = os.path.basename(dir_path)
            _update("current_dir", dir_name)

            for fname, fpath in files:
                # Check cancel
                if _import_state["cancel_requested"]:
                    _add_log("Импорт отменён пользователем")
                    _update("finished", True)
                    _update("running", False)
                    return

                _update("current_file", fname)
                spec = GAME_DATA_FILES[fname]
                table_name = spec["table"]
                col_map = spec["columns"]

                _add_log(f"Загрузка {dir_name}/{fname} → {table_name}...")

                try:
                    file_rows = 0
                    for chunk in pd.read_csv(fpath, chunksize=CHUNK_SIZE, low_memory=False):
                        if _import_state["cancel_requested"]:
                            _add_log("Импорт отменён пользователем")
                            _update("finished", True)
                            _update("running", False)
                            return

                        available_cols = [c for c in col_map.keys() if c in chunk.columns]
                        df = chunk[available_cols].copy()
                        df.rename(columns=col_map, inplace=True)
                        df["source_dir"] = dir_name

                        for col in df.columns:
                            if df[col].dtype == object:
                                df[col] = df[col].where(df[col].notna(), None)

                        df.to_sql(
                            table_name,
                            engine,
                            if_exists="append",
                            index=False,
                            method="multi",
                        )
                        file_rows += len(df)
                        total_rows += len(df)
                        _update("rows_loaded", total_rows)

                    _add_log(f"  ✓ {fname}: {file_rows} строк загружено")

                except Exception as e:
                    _add_log(f"  ✗ Ошибка {fname}: {str(e)}")

                files_done += 1
                _update("files_done", files_done)
                _update("progress_pct", round(files_done / total_files * 100, 1))

        _add_log(f"Импорт завершён! Всего загружено {total_rows} строк из {files_done} файлов.")
        _update("finished", True)
        _update("running", False)

    except Exception as e:
        _update("error", str(e))
        _add_log(f"Критическая ошибка: {str(e)}")
        _update("finished", True)
        _update("running", False)
