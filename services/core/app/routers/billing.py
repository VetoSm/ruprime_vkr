import os
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.billing_utils import active_subscription_for_user
from app.config import settings
from app.database import get_db
from app.dependencies import CurrentUser, get_current_user, log_action, require_role
from app.models import CoreUser, Payment, UserSubscription
from app.schemas import (
    ConfirmPaymentRequest,
    ConfirmPaymentResponse,
    CreatePaymentRequest,
    CreatePaymentResponse,
    SubscriptionResponse,
)

router = APIRouter(prefix="/billing", tags=["billing"])

PRO_PRICE_RUB = 499.0
PRO_PERIOD_DAYS = 30
YOOKASSA_API_URL = "https://api.yookassa.ru/v3/payments"
PAYMENT_DESCRIPTION = "ИИ тренер на месяц по Dota2"


def _subscription_response(db: Session, core_user_id: int) -> SubscriptionResponse:
    sub = active_subscription_for_user(db, core_user_id)
    if not sub:
        return SubscriptionResponse(plan="free", status="inactive", active=False, requests_limit_daily=1)
    return SubscriptionResponse(
        plan=sub.plan,
        status=sub.status,
        active=True,
        current_period_end=sub.current_period_end,
        requests_limit_daily=None,
    )


def _safe_return_path(return_path: str | None) -> str:
    path = (return_path or "/settings?tab=subscription").strip()
    if not path.startswith("/") or path.startswith("//"):
        return "/settings?tab=subscription"
    return path[:500]


def _public_app_url() -> str:
    return os.getenv("PUBLIC_APP_URL") or os.getenv("FRONTEND_URL") or "http://localhost:3000"


def _yookassa_credentials() -> tuple[str, str]:
    shop_id = os.getenv("YOOKASSA_SHOP_ID", "").strip()
    secret_key = os.getenv("YOOKASSA_SECRET_KEY", "").strip()
    if not shop_id or not secret_key:
        raise HTTPException(status_code=503, detail="YooKassa credentials are not configured")
    return shop_id, secret_key


def _with_payment_params(return_path: str, payment_id: int) -> str:
    separator = "&" if "?" in return_path else "?"
    return f"{return_path}{separator}{urlencode({'payment': 'return', 'payment_id': payment_id})}"


async def _fetch_yookassa_payment(provider_payment_id: str) -> dict:
    shop_id, secret_key = _yookassa_credentials()
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{YOOKASSA_API_URL}/{provider_payment_id}",
            auth=httpx.BasicAuth(shop_id, secret_key),
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"YooKassa returned HTTP {resp.status_code}")
    return resp.json()


def _activate_pro(db: Session, payment: Payment) -> UserSubscription:
    now = datetime.now(timezone.utc)
    period_end = now + timedelta(days=PRO_PERIOD_DAYS)
    sub = db.query(UserSubscription).filter(UserSubscription.core_user_id == payment.core_user_id).first()
    if not sub:
        sub = UserSubscription(core_user_id=payment.core_user_id)
        db.add(sub)
        db.flush()
    sub.plan = "pro"
    sub.status = "active"
    sub.current_period_start = now
    sub.current_period_end = period_end
    sub.last_payment_id = payment.id
    payment.activated_at = payment.activated_at or now
    return sub


async def _reconcile_pending_payments(
    db: Session,
    core_user_id: int | None = None,
    limit: int = 20,
) -> int:
    query = db.query(Payment).filter(
        Payment.provider == "yookassa",
        Payment.provider_payment_id.isnot(None),
        Payment.status.in_(["pending", "waiting_for_capture"]),
    )
    if core_user_id is not None:
        query = query.filter(Payment.core_user_id == core_user_id)

    activated = 0
    for payment in query.order_by(Payment.created_at.desc()).limit(limit).all():
        try:
            data = await _fetch_yookassa_payment(payment.provider_payment_id)
        except HTTPException:
            continue

        payment.status = data.get("status") or payment.status
        payment.provider_payload = data
        if payment.status == "succeeded":
            _activate_pro(db, payment)
            activated += 1
        elif payment.status == "canceled":
            payment.activated_at = None

    if activated:
        db.flush()
    return activated


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_subscription(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    await _reconcile_pending_payments(db, core_user_id=current_user.user_id, limit=5)
    db.commit()
    return _subscription_response(db, current_user.user_id)


@router.post("/yookassa/create-payment", response_model=CreatePaymentResponse)
async def create_yookassa_payment(
    body: CreatePaymentRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    shop_id, secret_key = _yookassa_credentials()
    return_path = _safe_return_path(body.return_path)
    idempotence_key = uuid.uuid4().hex
    payment = Payment(
        core_user_id=current_user.user_id,
        idempotence_key=idempotence_key,
        amount=PRO_PRICE_RUB,
        currency="RUB",
        status="created",
        description=PAYMENT_DESCRIPTION,
        return_path=return_path,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    confirmation_return_path = _with_payment_params(return_path, payment.id)
    return_url = f"{_public_app_url().rstrip('/')}{confirmation_return_path}"
    payload = {
        "amount": {"value": f"{PRO_PRICE_RUB:.2f}", "currency": "RUB"},
        "capture": True,
        "confirmation": {"type": "redirect", "return_url": return_url},
        "description": PAYMENT_DESCRIPTION,
        "metadata": {"core_user_id": str(current_user.user_id), "payment_id": str(payment.id)},
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            YOOKASSA_API_URL,
            auth=httpx.BasicAuth(shop_id, secret_key),
            headers={"Idempotence-Key": idempotence_key, "Content-Type": "application/json"},
            json=payload,
        )
    if resp.status_code >= 400:
        payment.status = "create_failed"
        payment.provider_payload = {"status_code": resp.status_code, "body": resp.text[:2000]}
        db.commit()
        raise HTTPException(status_code=502, detail=f"YooKassa returned HTTP {resp.status_code}")

    data = resp.json()
    payment.provider_payment_id = data.get("id")
    payment.status = data.get("status") or "pending"
    payment.confirmation_url = (data.get("confirmation") or {}).get("confirmation_url")
    payment.provider_payload = data
    db.commit()

    if not payment.confirmation_url:
        raise HTTPException(status_code=502, detail="YooKassa did not return confirmation URL")

    log_action(
        db,
        current_user.user_id,
        current_user.role,
        "BILLING_PAYMENT_CREATED",
        "PAYMENT",
        payment.id,
        metadata={"provider": "yookassa", "amount": PRO_PRICE_RUB},
    )

    return CreatePaymentResponse(
        payment_id=payment.id,
        provider_payment_id=payment.provider_payment_id,
        confirmation_url=payment.confirmation_url,
        status=payment.status,
    )


@router.post("/yookassa/confirm", response_model=ConfirmPaymentResponse)
async def confirm_yookassa_payment(
    body: ConfirmPaymentRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payment = db.query(Payment).filter(
        Payment.id == body.payment_id,
        Payment.core_user_id == current_user.user_id,
        Payment.provider == "yookassa",
    ).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if not payment.provider_payment_id:
        raise HTTPException(status_code=400, detail="Payment was not created in YooKassa")

    data = await _fetch_yookassa_payment(payment.provider_payment_id)
    payment.status = data.get("status") or payment.status
    payment.provider_payload = data

    message = "Оплата ещё не завершена."
    if payment.status == "succeeded":
        _activate_pro(db, payment)
        message = "Оплата прошла успешно. Подписка Pro активна на 30 дней."
        log_action(
            db,
            current_user.user_id,
            current_user.role,
            "BILLING_PAYMENT_SUCCEEDED",
            "PAYMENT",
            payment.id,
            metadata={"provider": "yookassa", "amount": payment.amount},
        )
    elif payment.status == "canceled":
        message = "Оплата отменена."

    db.commit()
    return ConfirmPaymentResponse(
        payment_id=payment.id,
        status=payment.status,
        subscription=_subscription_response(db, current_user.user_id),
        message=message,
    )


@router.get("/technical-summary")
async def billing_technical_summary(
    request: Request,
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    await _reconcile_pending_payments(db, limit=50)
    db.commit()
    total_payments = db.query(func.count(Payment.id)).filter(Payment.status == "succeeded").scalar() or 0
    total_amount = db.query(func.coalesce(func.sum(Payment.amount), 0.0)).filter(Payment.status == "succeeded").scalar() or 0.0
    active_subscriptions = db.query(func.count(UserSubscription.id)).filter(
        UserSubscription.plan == "pro",
        UserSubscription.status == "active",
        UserSubscription.current_period_end > datetime.now(timezone.utc),
    ).scalar() or 0
    core_users = {u.id: u for u in db.query(CoreUser).all()}
    auth_map: dict[int, dict] = {}
    token = request.headers.get("Authorization", "")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{settings.AUTH_SERVICE_URL}/auth/admin/users-lite",
                headers={"Authorization": token},
            )
        if resp.status_code == 200:
            auth_map = {int(u["id"]): u for u in resp.json().get("items", []) if u.get("id") is not None}
    except Exception:
        auth_map = {}

    subscriptions = {
        s.core_user_id: s
        for s in db.query(UserSubscription).all()
    }
    personas = {
        row.core_user_id: row.personaname
        for row in db.execute(text("""
            select pp.core_user_id, pa.personaname
            from player_profiles pp
            left join player_accounts pa on pa.account_id::text = pp.dota_account_id
            where pa.personaname is not null
        """)).fetchall()
    }
    payment_rows = db.query(Payment).order_by(Payment.created_at.desc()).limit(50).all()
    payments = []
    for payment in payment_rows:
        core_user = core_users.get(payment.core_user_id)
        auth_user = auth_map.get(core_user.auth_user_id) if core_user else None
        sub = subscriptions.get(payment.core_user_id)
        payments.append({
            "id": payment.id,
            "core_user_id": payment.core_user_id,
            "auth_user_id": core_user.auth_user_id if core_user else None,
            "login": auth_user.get("login") if auth_user else None,
            "email": auth_user.get("email") if auth_user else None,
            "steam_persona": personas.get(payment.core_user_id),
            "amount": payment.amount,
            "currency": payment.currency,
            "status": payment.status,
            "description": payment.description,
            "created_at": payment.created_at.isoformat() if payment.created_at else None,
            "activated_at": payment.activated_at.isoformat() if payment.activated_at else None,
            "subscription_until": sub.current_period_end.isoformat() if sub and sub.current_period_end else None,
        })
    return {
        "provider": "yookassa",
        "succeeded_payments": int(total_payments),
        "succeeded_amount_rub": float(total_amount),
        "active_subscriptions": int(active_subscriptions),
        "payments": payments,
    }
