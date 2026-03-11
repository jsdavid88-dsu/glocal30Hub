from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db

router = APIRouter()


@router.get("/")
async def list_users(db: AsyncSession = Depends(get_db)):
    """사용자 목록 조회"""
    return {"data": [], "meta": {"page": 1, "limit": 20, "total": 0}}


@router.get("/{user_id}")
async def get_user(user_id: str, db: AsyncSession = Depends(get_db)):
    """사용자 상세 조회"""
    return {"message": "not yet implemented"}
