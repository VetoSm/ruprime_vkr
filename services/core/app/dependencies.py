"""JWT authentication dependency for Core service."""

import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import CoreUser


class CurrentUser:
    def __init__(self, user_id: int, auth_user_id: int, role: str, core_user: CoreUser):
        self.user_id = core_user.id
        self.auth_user_id = auth_user_id
        self.role = role
        self.core_user = core_user


def get_current_user(request: Request, db: Session = Depends(get_db)) -> CurrentUser:
    """Extract and verify JWT, find or create core_user."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    auth_user_id = int(payload.get("sub", 0))
    role = payload.get("role", "PLAYER")

    # Find or create core_user
    core_user = db.query(CoreUser).filter(CoreUser.auth_user_id == auth_user_id).first()
    if not core_user:
        core_user = CoreUser(auth_user_id=auth_user_id)
        db.add(core_user)
        db.commit()
        db.refresh(core_user)

    return CurrentUser(
        user_id=core_user.id,
        auth_user_id=auth_user_id,
        role=role,
        core_user=core_user,
    )


def require_role(*roles: str):
    """Dependency factory that checks role."""
    def checker(current_user: CurrentUser = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail=f"Role {current_user.role} not allowed. Required: {roles}")
        return current_user
    return checker


def log_action(db: Session, core_user_id: int, role: str, action_type: str,
               entity_type: str = None, entity_id: int = None, metadata: dict = None,
               ip_address: str = None, user_agent: str = None):
    """Log an action to core_action_logs."""
    try:
        from app.models import CoreActionLog
        log = CoreActionLog(
            core_user_id=core_user_id,
            role=role,
            action_type=action_type,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata_json=metadata,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()
