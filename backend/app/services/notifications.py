import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification, NotificationType


async def create_notification(
    db: AsyncSession,
    user_id: uuid.UUID,
    notification_type: str,
    title: str,
    body: str | None = None,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
) -> None:
    """Create a Notification record in the DB.

    This only calls db.add() — the caller is responsible for committing
    the session (or the notification will be committed together with
    whatever else the caller flushes).
    """
    notification = Notification(
        user_id=user_id,
        notification_type=NotificationType(notification_type),
        title=title,
        body=body,
        target_type=target_type,
        target_id=target_id,
    )
    db.add(notification)
