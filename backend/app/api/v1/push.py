from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.schemas.push_subscription import PushSubscriptionCreate

router = APIRouter()


@router.post("/subscribe", status_code=status.HTTP_201_CREATED)
async def subscribe(
    body: PushSubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Register a push subscription. Idempotent — returns existing if duplicate."""
    # Check for existing subscription with same endpoint
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == current_user.id,
            PushSubscription.endpoint == body.endpoint,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return {"status": "already_subscribed", "id": str(existing.id)}

    sub = PushSubscription(
        user_id=current_user.id,
        endpoint=body.endpoint,
        p256dh=body.p256dh,
        auth=body.auth,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)

    return {"status": "subscribed", "id": str(sub.id)}


@router.delete("/subscribe", status_code=status.HTTP_200_OK)
async def unsubscribe(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove all push subscriptions for the current user."""
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.user_id == current_user.id,
        )
    )
    await db.commit()
    return {"status": "unsubscribed"}


@router.get("/vapid-key")
async def get_vapid_key(
    current_user: User = Depends(get_current_user),
):
    """Return the VAPID public key for push subscription. 503 if not configured."""
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="VAPID keys not configured",
        )
    return {"publicKey": settings.VAPID_PUBLIC_KEY}
