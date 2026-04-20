import json
import logging
import asyncio

from pywebpush import webpush, WebPushException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)


async def send_push_to_user(
    db: AsyncSession,
    user_id,
    title: str,
    body: str,
    url: str = "/",
    push_type: str = "notification",
):
    """Send web push to all subscriptions of a user. Best-effort."""
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        logger.debug("VAPID keys not configured, skipping push")
        return

    result = await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == user_id)
    )
    subscriptions = result.scalars().all()

    payload = json.dumps({
        "title": title,
        "body": body,
        "url": url,
        "type": push_type,
    })

    for sub in subscriptions:
        try:
            await asyncio.to_thread(
                webpush,
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_SUBJECT},
            )
        except WebPushException as e:
            logger.warning(f"Push failed for user {user_id}: {e}")
            if "410" in str(e) or "404" in str(e):
                await db.delete(sub)
                await db.commit()
        except Exception as e:
            logger.warning(f"Push error for user {user_id}: {e}")


async def send_push_to_users(
    db: AsyncSession,
    user_ids: list,
    title: str,
    body: str,
    url: str = "/",
    push_type: str = "notification",
):
    """Send push to multiple users."""
    for uid in user_ids:
        await send_push_to_user(db, uid, title, body, url, push_type)
