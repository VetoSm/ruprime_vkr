from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models import engine, Base, LlmRequest, LlmResponse  # noqa: F401
from app.routers.chat import router as chat_router

app = FastAPI(title="Dota2 Coach - LLM Service (Stub)", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok", "service": "llm", "mode": "stub"}
