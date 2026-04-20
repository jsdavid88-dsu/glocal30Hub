from fastapi import APIRouter

from app.api.v1 import auth, users, projects, tasks, tags, comments, daily, events, weekly_notes, uploads, attendance, notifications, admin, sota, reports, gcal, announcements

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(tasks.router, tags=["tasks"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(tags.router, prefix="/tags", tags=["tags"])
api_router.include_router(comments.router, tags=["comments"])
api_router.include_router(daily.router, prefix="/daily-logs", tags=["daily"])
api_router.include_router(daily.block_router, prefix="/daily-blocks", tags=["daily"])
api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(weekly_notes.router, prefix="/weekly-notes", tags=["weekly-notes"])
api_router.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
api_router.include_router(attendance.router, prefix="/attendance", tags=["attendance"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(sota.router, prefix="/sota", tags=["sota"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(gcal.router)
api_router.include_router(announcements.router, prefix="/announcements", tags=["announcements"])
