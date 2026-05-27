from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import UserSubscription


def active_subscription_for_user(db: Session, core_user_id: int | None) -> UserSubscription | None:
    if not core_user_id:
        return None
    now = datetime.now(timezone.utc)
    sub = db.query(UserSubscription).filter(
        UserSubscription.core_user_id == int(core_user_id),
        UserSubscription.plan == "pro",
        UserSubscription.status == "active",
    ).first()
    if not sub or not sub.current_period_end:
        return None
    period_end = sub.current_period_end
    if period_end.tzinfo is None:
        period_end = period_end.replace(tzinfo=timezone.utc)
    return sub if period_end > now else None


def is_pro_active(db: Session, core_user_id: int | None) -> bool:
    return active_subscription_for_user(db, core_user_id) is not None
