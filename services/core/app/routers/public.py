from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import CoreActionLog
from app.rate_limit import check_rate_limit

router = APIRouter(prefix="/public", tags=["public"])


class ClientEventBody(BaseModel):
    event_type: str
    path: str | None = None
    metadata: dict | None = None


@router.post("/client-event")
def client_event(body: ClientEventBody, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    allowed, retry_after = check_rate_limit("client_event_ip", client_ip, max_requests=200, window_seconds=60)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many events",
            headers={"Retry-After": str(retry_after)},
        )

    db: Session = SessionLocal()
    try:
        event = CoreActionLog(
            core_user_id=None,
            role="PUBLIC",
            action_type=body.event_type[:100],
            entity_type="FRONTEND",
            metadata_json={
                "path": body.path,
                "metadata": body.metadata or {},
            },
            ip_address=client_ip,
            user_agent=request.headers.get("User-Agent"),
        )
        db.add(event)
        db.commit()
    finally:
        db.close()

    return {"status": "ok"}
