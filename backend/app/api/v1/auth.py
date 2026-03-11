from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db

router = APIRouter()


@router.get("/login")
async def login():
    """Google OAuth 로그인 시작 — Phase 1에서 구현"""
    return {"message": "Google OAuth login - not yet implemented"}


@router.get("/callback")
async def callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Google OAuth 콜백 — Phase 1에서 구현"""
    return {"message": "OAuth callback - not yet implemented"}


@router.get("/me")
async def me():
    """현재 로그인 사용자 정보 — Phase 1에서 구현"""
    return {"message": "Current user - not yet implemented"}


@router.post("/logout")
async def logout():
    """로그아웃 — Phase 1에서 구현"""
    return {"message": "Logout - not yet implemented"}
