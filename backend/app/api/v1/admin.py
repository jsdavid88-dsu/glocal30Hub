import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import require_role
from app.models.audit import AuditLog
from app.models.project import Project, ProjectMember
from app.models.tag import Tag
from app.models.user import AdvisorRelation, User, UserRole, UserStatus
from app.schemas.admin import (
    AdminAdvisorAssign,
    AdminProjectCreate,
    AdminProjectUpdate,
    AdminTagCreate,
    AdminTagUpdate,
    AdminUserRoleUpdate,
    AdminUserStatusUpdate,
)
from app.schemas.user import UserSummaryResponse

router = APIRouter()

# Admin dependency: admin only (professors no longer have admin panel access)
admin_dep = require_role(UserRole.admin)


# ═══════════════════════════════════════════════════════════════
#  사용자 관리
# ═══════════════════════════════════════════════════════════════


@router.get("/users")
async def admin_list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(admin_dep),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    q: str | None = None,
    role: UserRole | None = None,
    user_status: UserStatus | None = None,
):
    """List all users with details for admin management."""
    query = select(User)

    if role is not None:
        query = query.where(User.role == role)
    if user_status is not None:
        query = query.where(User.status == user_status)
    if q:
        query = query.where(User.name.ilike(f"%{q}%") | User.email.ilike(f"%{q}%"))

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit).order_by(User.created_at.desc())
    result = await db.execute(query)
    users = result.scalars().all()

    # Fetch advisor relations for all users
    user_ids = [u.id for u in users]
    advisor_query = (
        select(AdvisorRelation)
        .options(selectinload(AdvisorRelation.professor), selectinload(AdvisorRelation.student))
        .where(
            (AdvisorRelation.professor_id.in_(user_ids))
            | (AdvisorRelation.student_id.in_(user_ids))
        )
    )
    advisor_result = await db.execute(advisor_query)
    relations = advisor_result.scalars().all()

    # Build advisor map: student_id -> list of professor names
    advisor_map: dict[uuid.UUID, list[dict]] = {}
    for rel in relations:
        if rel.student_id not in advisor_map:
            advisor_map[rel.student_id] = []
        advisor_map[rel.student_id].append({
            "relation_id": str(rel.id),
            "professor_id": str(rel.professor_id),
            "professor_name": rel.professor.name if rel.professor else None,
        })

    data = []
    for u in users:
        user_dict = {
            "id": str(u.id),
            "email": u.email,
            "name": u.name,
            "role": u.role.value,
            "status": u.status.value,
            "profile_image_url": u.profile_image_url,
            "major_field": u.major_field,
            "company": u.company,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "advisors": advisor_map.get(u.id, []),
        }
        data.append(user_dict)

    return {"data": data, "meta": {"page": page, "limit": limit, "total": total}}


@router.patch("/users/{user_id}/role")
async def admin_update_user_role(
    user_id: uuid.UUID,
    body: AdminUserRoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(admin_dep),
):
    """Change a user's role."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    old_role = user.role.value
    user.role = body.role

    # Audit log
    audit = AuditLog(
        actor_id=current_user.id,
        action_type="role_change",
        target_type="user",
        target_id=user_id,
        payload={
            "user_id": str(user_id),
            "old_role": old_role,
            "new_role": body.role.value,
        },
    )
    db.add(audit)

    await db.commit()
    await db.refresh(user)
    return {"id": str(user.id), "name": user.name, "role": user.role.value}


@router.patch("/users/{user_id}/status")
async def admin_update_user_status(
    user_id: uuid.UUID,
    body: AdminUserStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(admin_dep),
):
    """Change a user's status."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.status = body.status
    await db.commit()
    await db.refresh(user)
    return {"id": str(user.id), "name": user.name, "status": user.status.value}


@router.post("/users/{user_id}/advisor", status_code=201)
async def admin_assign_advisor(
    user_id: uuid.UUID,
    body: AdminAdvisorAssign,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(admin_dep),
):
    """Assign an advisor (professor) to a student."""
    # Validate student
    result = await db.execute(select(User).where(User.id == user_id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    # Validate professor
    result = await db.execute(select(User).where(User.id == body.professor_id))
    professor = result.scalar_one_or_none()
    if professor is None or professor.role != UserRole.professor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Professor not found or user is not a professor",
        )

    # Check duplicate
    result = await db.execute(
        select(AdvisorRelation).where(
            AdvisorRelation.professor_id == body.professor_id,
            AdvisorRelation.student_id == user_id,
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Advisor relation already exists",
        )

    relation = AdvisorRelation(professor_id=body.professor_id, student_id=user_id)
    db.add(relation)

    # Audit log
    audit = AuditLog(
        actor_id=current_user.id,
        action_type="advisor_change",
        target_type="advisor_relation",
        target_id=None,
        payload={
            "action": "assign",
            "professor_id": str(body.professor_id),
            "student_id": str(user_id),
            "professor_name": professor.name,
            "student_name": student.name,
        },
    )
    db.add(audit)

    await db.commit()
    await db.refresh(relation)

    return {
        "id": str(relation.id),
        "professor_id": str(relation.professor_id),
        "student_id": str(relation.student_id),
        "professor_name": professor.name,
    }


@router.delete("/users/{user_id}/advisor/{advisor_id}", status_code=200)
async def admin_remove_advisor(
    user_id: uuid.UUID,
    advisor_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(admin_dep),
):
    """Remove an advisor relation."""
    result = await db.execute(
        select(AdvisorRelation).where(
            AdvisorRelation.id == advisor_id,
            AdvisorRelation.student_id == user_id,
        )
    )
    relation = result.scalar_one_or_none()
    if relation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Advisor relation not found",
        )

    # Audit log
    audit = AuditLog(
        actor_id=current_user.id,
        action_type="advisor_change",
        target_type="advisor_relation",
        target_id=advisor_id,
        payload={
            "action": "remove",
            "professor_id": str(relation.professor_id),
            "student_id": str(user_id),
        },
    )
    db.add(audit)

    await db.delete(relation)
    await db.commit()
    return {"detail": "Advisor relation removed"}


# ═══════════════════════════════════════════════════════════════
#  프로젝트 관리
# ═══════════════════════════════════════════════════════════════


@router.get("/projects")
async def admin_list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(admin_dep),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    q: str | None = None,
):
    """List all projects with member counts."""
    query = select(Project).options(selectinload(Project.members))

    if q:
        query = query.where(Project.name.ilike(f"%{q}%"))

    count_query = select(func.count()).select_from(
        select(Project.id).where(Project.name.ilike(f"%{q}%")).subquery()
        if q
        else select(Project.id).subquery()
    )
    total = (await db.execute(count_query)).scalar() or 0

    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit).order_by(Project.created_at.desc())
    result = await db.execute(query)
    projects = result.scalars().unique().all()

    data = []
    for p in projects:
        data.append({
            "id": str(p.id),
            "name": p.name,
            "description": p.description,
            "status": p.status.value,
            "start_date": p.start_date.isoformat() if p.start_date else None,
            "end_date": p.end_date.isoformat() if p.end_date else None,
            "member_count": len(p.members) if p.members else 0,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })

    return {"data": data, "meta": {"page": page, "limit": limit, "total": total}}


@router.post("/projects", status_code=201)
async def admin_create_project(
    body: AdminProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(admin_dep),
):
    """Create a new project."""
    project = Project(
        name=body.name,
        description=body.description,
        status=body.status,
        start_date=body.start_date,
        end_date=body.end_date,
        created_by=current_user.id,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    return {
        "id": str(project.id),
        "name": project.name,
        "description": project.description,
        "status": project.status.value if hasattr(project.status, 'value') else project.status,
        "start_date": project.start_date.isoformat() if project.start_date else None,
        "end_date": project.end_date.isoformat() if project.end_date else None,
        "created_at": project.created_at.isoformat() if project.created_at else None,
    }


@router.patch("/projects/{project_id}")
async def admin_update_project(
    project_id: uuid.UUID,
    body: AdminProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(admin_dep),
):
    """Update a project."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)

    await db.commit()
    await db.refresh(project)

    return {
        "id": str(project.id),
        "name": project.name,
        "description": project.description,
        "status": project.status.value if hasattr(project.status, 'value') else project.status,
    }


@router.delete("/projects/{project_id}")
async def admin_delete_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(admin_dep),
):
    """Delete a project."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    await db.delete(project)
    await db.commit()
    return {"detail": "Project deleted"}


# ═══════════════════════════════════════════════════════════════
#  태그 관리
# ═══════════════════════════════════════════════════════════════


@router.get("/tags")
async def admin_list_tags(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(admin_dep),
    q: str | None = None,
):
    """List all tags."""
    query = select(Tag)
    if q:
        query = query.where(Tag.name.ilike(f"%{q}%"))
    query = query.order_by(Tag.created_at.desc())

    result = await db.execute(query)
    tags = result.scalars().all()

    return {
        "data": [
            {
                "id": str(t.id),
                "name": t.name,
                "color": t.color,
                "scope_type": t.scope_type.value,
                "project_id": str(t.project_id) if t.project_id else None,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in tags
        ]
    }


@router.post("/tags", status_code=201)
async def admin_create_tag(
    body: AdminTagCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(admin_dep),
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

    return {
        "id": str(tag.id),
        "name": tag.name,
        "color": tag.color,
        "scope_type": tag.scope_type.value,
        "project_id": str(tag.project_id) if tag.project_id else None,
    }


@router.patch("/tags/{tag_id}")
async def admin_update_tag(
    tag_id: uuid.UUID,
    body: AdminTagUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(admin_dep),
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

    return {
        "id": str(tag.id),
        "name": tag.name,
        "color": tag.color,
        "scope_type": tag.scope_type.value,
    }


@router.delete("/tags/{tag_id}")
async def admin_delete_tag(
    tag_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(admin_dep),
):
    """Delete a tag."""
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")

    await db.delete(tag)
    await db.commit()
    return {"detail": "Tag deleted"}


# ═══════════════════════════════════════════════════════════════
#  감사 로그 (Audit Log)
# ═══════════════════════════════════════════════════════════════


@router.get("/audit-log")
async def admin_list_audit_log(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(admin_dep),
    limit: int = Query(100, ge=1, le=500),
    action_type: str | None = None,
):
    """List recent audit log entries. Only admin/professor can view."""
    query = select(AuditLog)

    if action_type is not None:
        query = query.where(AuditLog.action_type == action_type)

    query = query.order_by(AuditLog.created_at.desc()).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()

    return {
        "data": [
            {
                "id": str(log.id),
                "actor_id": str(log.actor_id) if log.actor_id else None,
                "action_type": log.action_type,
                "target_type": log.target_type,
                "target_id": str(log.target_id) if log.target_id else None,
                "payload": log.payload,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ]
    }
