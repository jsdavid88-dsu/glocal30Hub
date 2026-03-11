from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db

router = APIRouter()


@router.get("/")
async def list_projects(db: AsyncSession = Depends(get_db)):
    """프로젝트 목록 조회"""
    return {"data": [], "meta": {"page": 1, "limit": 20, "total": 0}}


@router.get("/{project_id}")
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    """프로젝트 상세 조회"""
    return {"message": "not yet implemented"}
