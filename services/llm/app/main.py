import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models import engine, Base, LlmRequest, LlmResponse  # noqa: F401
from app.internal_auth import require_internal_token
from app.routers.chat import router as chat_router
from app.routers.chat import llm_mode

# /docs is hidden by default — LLM is internal-only behind core, so the
# schema endpoint has no legitimate caller. Flip ENABLE_API_DOCS=true to
# bring it back on staging when debugging.
_DOCS_ENABLED = os.getenv("ENABLE_API_DOCS", "false").lower() in ("true", "1", "yes")
app = FastAPI(
    title="Dota2 Coach - LLM Service",
    version="1.0.0",
    docs_url="/docs" if _DOCS_ENABLED else None,
    redoc_url="/redoc" if _DOCS_ENABLED else None,
    openapi_url="/openapi.json" if _DOCS_ENABLED else None,
)

cors_origins = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router, dependencies=[Depends(require_internal_token)])


@app.middleware("http")
async def security_headers_middleware(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    return response


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok", "service": "llm", "mode": llm_mode()}
