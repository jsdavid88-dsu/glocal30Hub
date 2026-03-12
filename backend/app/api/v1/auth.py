from datetime import datetime, timedelta, timezone
from typing import Annotated

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import ALGORITHM, get_current_user
from app.models.user import User, UserStatus
from app.schemas.user import UserResponse

router = APIRouter()

# ---------------------------------------------------------------------------
# Google OAuth via Authlib
# ---------------------------------------------------------------------------
oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

ACCESS_TOKEN_EXPIRE_MINUTES = settings.SESSION_MAX_AGE // 60  # match session lifetime


def _create_access_token(user: User) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/login")
async def login(request: Request):
    """Redirect to Google OAuth consent screen."""
    redirect_uri = settings.GOOGLE_REDIRECT_URI
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/callback")
async def callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Google OAuth callback, create/update user, return JWT."""
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"OAuth error: {exc}",
        )

    userinfo = token.get("userinfo")
    if userinfo is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not retrieve user info from Google",
        )

    google_sub: str = userinfo["sub"]
    email: str = userinfo["email"]
    name: str = userinfo.get("name", email.split("@")[0])
    picture: str | None = userinfo.get("picture")

    # Upsert user
    result = await db.execute(select(User).where(User.google_subject == google_sub))
    user = result.scalar_one_or_none()

    if user is None:
        # Also check by email for pre-registered users
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if user is None:
        user = User(
            email=email,
            name=name,
            google_subject=google_sub,
            profile_image_url=picture,
            status=UserStatus.pending,
        )
        db.add(user)
    else:
        user.google_subject = google_sub
        user.name = name
        if picture:
            user.profile_image_url = picture

    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)

    access_token = _create_access_token(user)

    # Redirect to frontend with token
    frontend_url = f"{settings.FRONTEND_URL}/auth/callback?token={access_token}"
    return RedirectResponse(url=frontend_url)


@router.get("/me", response_model=UserResponse)
async def me(current_user: Annotated[User, Depends(get_current_user)]):
    """Return current authenticated user info."""
    return current_user


@router.post("/logout")
async def logout():
    """Logout — client should discard the JWT token.

    Since JWTs are stateless, server-side invalidation would require a
    blocklist (not implemented in Phase 1). The client is responsible for
    removing the stored token.
    """
    return {"message": "Logged out successfully. Please discard your token."}
