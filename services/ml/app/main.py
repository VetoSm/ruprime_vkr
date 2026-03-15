import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import engine, Base
from app.models import (  # noqa: F401
    MlRawMatch, MlRawPlayer, MlRawTeam, MlRawPicksBans,
    MlConstantHero, MlConstantItem, MlConstantAbility,
    MlKaggleBaseline, MlPlayerAnalysis,
    PlayerAccount, PlayerMatch,
)
from app.routers.admin import router as admin_router
from app.routers.analysis import router as analysis_router
from app.routers.matching import router as matching_router
from app.routers.data_view import router as data_view_router

app = FastAPI(title="Dota2 Coach - ML Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin_router)
app.include_router(analysis_router)
app.include_router(matching_router)
app.include_router(data_view_router)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)

    # Mount images if available
    images_path = os.path.join(os.getenv("KAGGLE_DATA_PATH", "/data/archive-2"), "Images")
    if os.path.isdir(images_path):
        app.mount("/ml/images", StaticFiles(directory=images_path), name="images")


@app.get("/health")
def health():
    return {"status": "ok", "service": "ml"}
