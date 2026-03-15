"""File upload endpoints for attachments (images + PDFs)."""

import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.attachment import Attachment, AttachmentOwnerType
from app.models.user import User

router = APIRouter()

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
}


def _validate_content_type(content_type: str | None) -> str:
    """Validate and return the content type, or raise 400."""
    if content_type is None or content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"허용되지 않는 파일 형식입니다. 허용: jpg, png, gif, webp, pdf",
        )
    return content_type


@router.post("/")
async def upload_file(
    file: UploadFile = File(...),
    block_id: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file (image or PDF). Max 10 MB."""
    content_type = _validate_content_type(file.content_type)

    # Read file contents and check size
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"파일 크기가 10MB를 초과합니다. ({len(data) / (1024*1024):.1f}MB)",
        )

    # Generate UUID filename with original extension
    original_name = file.filename or "unnamed"
    ext = Path(original_name).suffix.lower() or ""
    stored_filename = f"{uuid.uuid4().hex}{ext}"

    # Ensure upload directory exists
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    file_path = UPLOAD_DIR / stored_filename

    # Write file to disk
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(data)

    # Determine owner
    owner_type = AttachmentOwnerType.daily_block
    owner_id = uuid.UUID(block_id) if block_id else uuid.uuid4()  # placeholder if no block yet

    # Create DB record
    attachment = Attachment(
        owner_type=owner_type,
        owner_id=owner_id,
        file_type=content_type,
        file_url=f"/api/v1/uploads/{stored_filename}",
        file_name=original_name,
        file_size_bytes=len(data),
        storage_kind="local",
        preview_status="ready" if content_type.startswith("image/") else None,
        created_by=current_user.id,
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)

    return {
        "id": str(attachment.id),
        "filename": stored_filename,
        "original_name": original_name,
        "content_type": content_type,
        "size": len(data),
        "url": attachment.file_url,
        "created_at": attachment.created_at.isoformat() if attachment.created_at else None,
    }


@router.get("/{filename}")
async def serve_file(filename: str):
    """Serve an uploaded file by its stored filename."""
    file_path = UPLOAD_DIR / filename

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="파일을 찾을 수 없습니다.",
        )

    # Prevent path traversal
    try:
        file_path.resolve().relative_to(UPLOAD_DIR.resolve())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="잘못된 파일 경로입니다.",
        )

    return FileResponse(file_path)
