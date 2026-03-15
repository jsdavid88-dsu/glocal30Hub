import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.notification import NotificationType


class NotificationResponse(BaseModel):
    id: uuid.UUID
    notification_type: NotificationType
    title: str
    body: str | None = None
    target_type: str | None = None
    target_id: uuid.UUID | None = None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationListResponse(BaseModel):
    data: list[NotificationResponse]
    meta: dict
    unread_count: int


class NotificationCreate(BaseModel):
    user_id: uuid.UUID
    notification_type: NotificationType
    title: str = Field(..., max_length=255)
    body: str | None = None
    target_type: str | None = Field(None, max_length=50)
    target_id: uuid.UUID | None = None
