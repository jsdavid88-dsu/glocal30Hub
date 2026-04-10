from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    APP_NAME: str = "glocal30hub"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://hub:hub@db:5432/hub"

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/callback"

    # Session
    SECRET_KEY: str = "change-me-in-production"
    SESSION_MAX_AGE: int = 86400 * 7  # 7 days

    # Encryption key for sensitive data (Fernet, base64-encoded 32-byte key)
    ENCRYPTION_KEY: str = ""

    # Google Calendar
    GOOGLE_CALENDAR_ENABLED: bool = True

    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
