"""Google Calendar API service module.

Handles creating/updating/deleting events in user's Google Calendar
using their stored refresh_token.
"""
import asyncio
from datetime import datetime
from typing import Any

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.config import settings
from app.core.encryption import decrypt_value

SCOPES = ["https://www.googleapis.com/auth/calendar"]


def _get_calendar_service(encrypted_token: str):
    """Build Google Calendar API service from encrypted refresh_token."""
    refresh_token = decrypt_value(encrypted_token)
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        token_uri="https://oauth2.googleapis.com/token",
    )
    return build("calendar", "v3", credentials=creds)


def hub_event_to_gcal(event) -> dict[str, Any]:
    """Convert Hub Event model to Google Calendar event dict."""
    gcal_event: dict[str, Any] = {
        "summary": event.title,
        "description": event.description or "",
    }

    if event.all_day:
        gcal_event["start"] = {"date": event.start_at.strftime("%Y-%m-%d")}
        gcal_event["end"] = {"date": event.end_at.strftime("%Y-%m-%d")}
    else:
        gcal_event["start"] = {
            "dateTime": event.start_at.isoformat(),
            "timeZone": "Asia/Seoul",
        }
        gcal_event["end"] = {
            "dateTime": event.end_at.isoformat(),
            "timeZone": "Asia/Seoul",
        }

    gcal_event["extendedProperties"] = {
        "private": {
            "hub_event_id": str(event.id),
            "hub_event_type": event.event_type.value if event.event_type else "",
        }
    }

    return gcal_event


def gcal_to_hub_dict(gcal_event: dict) -> dict[str, Any]:
    """Convert Google Calendar event dict to Hub event creation dict."""
    start = gcal_event.get("start", {})
    end = gcal_event.get("end", {})

    all_day = "date" in start
    if all_day:
        start_at = datetime.strptime(start["date"], "%Y-%m-%d")
        end_at = datetime.strptime(end["date"], "%Y-%m-%d")
    else:
        start_at = datetime.fromisoformat(start.get("dateTime", ""))
        end_at = datetime.fromisoformat(end.get("dateTime", ""))

    return {
        "title": gcal_event.get("summary", "(제목 없음)"),
        "description": gcal_event.get("description", ""),
        "start_at": start_at,
        "end_at": end_at,
        "all_day": all_day,
        "google_event_id": gcal_event["id"],
        "source": "google_calendar",
    }


async def create_gcal_event(refresh_token: str, event) -> str | None:
    """Create Hub event in Google Calendar. Returns google_event_id."""
    try:
        service = _get_calendar_service(refresh_token)
        gcal_event = hub_event_to_gcal(event)
        result = await asyncio.to_thread(
            service.events().insert(calendarId="primary", body=gcal_event).execute
        )
        return result.get("id")
    except HttpError:
        return None


async def update_gcal_event(
    refresh_token: str, google_event_id: str, event
) -> bool:
    """Update event in Google Calendar."""
    try:
        service = _get_calendar_service(refresh_token)
        gcal_event = hub_event_to_gcal(event)
        await asyncio.to_thread(
            service.events().update(
                calendarId="primary", eventId=google_event_id, body=gcal_event
            ).execute
        )
        return True
    except HttpError:
        return False


async def delete_gcal_event(refresh_token: str, google_event_id: str) -> bool:
    """Delete event from Google Calendar."""
    try:
        service = _get_calendar_service(refresh_token)
        await asyncio.to_thread(
            service.events().delete(
                calendarId="primary", eventId=google_event_id
            ).execute
        )
        return True
    except HttpError:
        return False


async def list_gcal_events(
    refresh_token: str,
    time_min: datetime | None = None,
    time_max: datetime | None = None,
    max_results: int = 100,
) -> list[dict]:
    """List events from user's Google Calendar."""
    try:
        service = _get_calendar_service(refresh_token)
        params: dict[str, Any] = {
            "calendarId": "primary",
            "maxResults": max_results,
            "singleEvents": True,
            "orderBy": "startTime",
        }
        if time_min:
            params["timeMin"] = time_min.isoformat() + "Z"
        if time_max:
            params["timeMax"] = time_max.isoformat() + "Z"

        result = await asyncio.to_thread(
            service.events().list(**params).execute
        )
        return result.get("items", [])
    except HttpError:
        return []
