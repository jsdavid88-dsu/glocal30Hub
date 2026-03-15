import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.tag import Tag, TagScopeType
from app.models.user import User
from app.schemas.tag import TagCreate, TagResponse, TagUpdate

router = APIRouter()


@router.get("/", response_model=list[TagResponse])
async def list_tags(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
    scope_type: TagScopeType | None = None,
    project_id: uuid.UUID | None = None,
):
    """List tags with optional filtering by scope_type and project_id."""
    query = select(Tag)

    if scope_type is not None:
        query = query.where(Tag.scope_type == scope_type)
    if project_id is not None:
        query = query.where(Tag.project_id == project_id)

    query = query.order_by(Tag.name)
    result = await db.execute(query)
    tags = result.scalars().all()
    return tags


@router.post("/", response_model=TagResponse, status_code=201)
async def create_tag(
    body: TagCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Create a new tag."""
    tag = Tag(
        name=body.name,
        color=body.color,
        scope_type=body.scope_type,
        project_id=body.project_id,
    )
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.patch("/{tag_id}", response_model=TagResponse)
async def update_tag(
    tag_id: uuid.UUID,
    body: TagUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Update a tag."""
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(tag, field, value)

    await db.commit()
    await db.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=204)
async def delete_tag(
    tag_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Delete a tag."""
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")

    await db.delete(tag)
    await db.commit()
