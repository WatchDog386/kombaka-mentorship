"""Passwords, login tokens and the decorators that protect routes."""
import datetime as dt
import functools
import time

import jwt
from flask import current_app, g, request
from werkzeug.security import check_password_hash, generate_password_hash

from .db import get_db
from .errors import ApiError, Forbidden


def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    return check_password_hash(password_hash, password)


def normalise_login(value: str) -> str:
    """Usernames are lower-cased. Phone numbers become 07XXXXXXXX."""
    value = (value or "").strip().lower()
    digits = "".join(ch for ch in value if ch.isdigit())
    if digits and len(digits) >= 9 and not any(ch.isalpha() for ch in value):
        if digits.startswith("254"):
            digits = "0" + digits[3:]
        elif len(digits) == 9:
            digits = "0" + digits
        return digits
    return value


def make_token(user_id: int) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + dt.timedelta(hours=current_app.config["TOKEN_HOURS"])}
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm="HS256")


def _user_from_request() -> dict | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    try:
        payload = jwt.decode(header[7:], current_app.config["SECRET_KEY"], algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    row = get_db().execute("SELECT * FROM users WHERE id = ?", (payload.get("sub"),)).fetchone()
    return describe_user(get_db(), row) if row else None


def describe_user(db, row) -> dict:
    """The signed-in person as the rest of the app sees them.

    `id` is what the frontend calls the session id: the staff id for a
    teacher, the guardian phone number for a parent, 'office' for an admin.
    """
    user = {"userId": row["id"], "role": row["role"], "login": row["login"], "name": row["name"], "staffId": row["staff_id"] or "",
            # The picture itself is fetched on its own (GET /api/auth/photo); this only says which one is current.
            "photoAt": row["photo_at"] or "", "since": (row["created_at"] or "")[:10]}
    if row["role"] == "admin":
        user.update(id="office", name="School office")
    elif row["role"] == "teacher":
        staff = db.execute("SELECT name FROM staff WHERE id = ?", (row["staff_id"],)).fetchone()
        user.update(id=row["staff_id"], name=staff["name"] if staff else row["name"])
    else:
        user.update(id=row["login"])
    return user


def login_required(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        user = _user_from_request()
        if user is None:
            raise ApiError("Sign in to continue.", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapped


def admin_required(view):
    @functools.wraps(view)
    @login_required
    def wrapped(*args, **kwargs):
        if g.user["role"] != "admin":
            raise Forbidden("Only the school office can do that.")
        return view(*args, **kwargs)

    return wrapped


# A very small brake on password guessing: after 8 wrong tries for one
# login name, that name is locked for five minutes. Kept in memory.
_failures: dict[str, list[float]] = {}
MAX_TRIES, LOCK_SECONDS = 8, 300


def check_not_locked(login: str) -> None:
    recent = [t for t in _failures.get(login, []) if time.time() - t < LOCK_SECONDS]
    _failures[login] = recent
    if len(recent) >= MAX_TRIES:
        raise ApiError("Too many wrong passwords. Try again in five minutes.", 429)


def record_failure(login: str) -> None:
    _failures.setdefault(login, []).append(time.time())


def clear_failures(login: str) -> None:
    _failures.pop(login, None)
