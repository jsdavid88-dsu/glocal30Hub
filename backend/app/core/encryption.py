"""Fernet-based encryption helpers for sensitive data (e.g. refresh tokens)."""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _get_fernet() -> Fernet:
    key = settings.ENCRYPTION_KEY
    if not key:
        # Derive a deterministic key from SECRET_KEY as fallback
        digest = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
        key = base64.urlsafe_b64encode(digest).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_value(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        # If decryption fails, the value might be stored as plaintext (migration)
        return ciphertext
