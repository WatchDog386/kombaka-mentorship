"""Application settings, read from environment variables (see .env.example)."""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent

load_dotenv(BACKEND_DIR / ".env")


def _path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else BACKEND_DIR / path


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-secret-change-me-before-real-use")
    DATABASE = _path(os.getenv("DATABASE", "data/kengele.db"))
    UPLOAD_DIR = _path(os.getenv("UPLOAD_DIR", "data/uploads"))
    MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "20"))
    TOKEN_HOURS = int(os.getenv("TOKEN_HOURS", "12"))
    TEACHER_DEFAULT_PASSWORD = os.getenv("TEACHER_DEFAULT_PASSWORD", "teacher123")
    PARENT_DEFAULT_PASSWORD = os.getenv("PARENT_DEFAULT_PASSWORD", "parent123")
    SHOW_DEMO_ACCOUNTS = os.getenv("SHOW_DEMO_ACCOUNTS", "0") == "1"
    CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
    FRONTEND_DIR = PROJECT_DIR / "frontend"
    PORT = int(os.getenv("PORT", "5000"))
