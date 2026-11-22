"""Sign in, create an account, who am I, change password, reset someone's password, profile picture."""
import base64
import binascii
from datetime import datetime, timezone

from flask import Blueprint, current_app, g, jsonify, request

from ..db import get_db
from ..errors import ApiError, NotFound
from ..security import (
    admin_required, check_not_locked, clear_failures, describe_user, hash_password,
    login_required, make_token, normalise_login, record_failure, verify_password,
)
from .public import check_rate, note_sent, read_application, save_application

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.post("/login")
def login():
    body = request.get_json(silent=True) or {}
    login_name = normalise_login(str(body.get("login") or ""))
    password = str(body.get("password") or "")
    if not login_name or not password:
        raise ApiError("Enter your phone number or username, and your password.")
    check_not_locked(login_name)
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE login = ?", (login_name,)).fetchone()
    if row is None or not verify_password(row["password_hash"], password):
        record_failure(login_name)
        raise ApiError("That phone number or password is not correct.", 401)
    clear_failures(login_name)
    return jsonify(token=make_token(row["id"]), user=describe_user(db, row))


@bp.post("/register")
def register():
    """A family creates a parent account and applies for their child in one step.
    The account stays while the application is open (see accounts.sync_accounts) and
    becomes an ordinary guardian account once the child is admitted."""
    recent = check_rate()
    body = request.get_json(silent=True) or {}
    app = read_application(body)
    password = str(body.get("password") or "")
    if len(password) < 6:
        raise ApiError("Choose a password with at least 6 characters.")
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE login = ?", (app["phone"],)).fetchone():
        raise ApiError("An account already exists for this phone number. Sign in instead.", 409)
    save_application(db, app)
    cur = db.execute(
        "INSERT INTO users (role, login, name, password_hash) VALUES ('parent', ?, ?, ?)",
        (app["phone"], app["parent"], hash_password(password)),
    )
    db.commit()
    note_sent(recent)
    row = db.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(token=make_token(row["id"]), user=describe_user(db, row)), 201


@bp.get("/me")
@login_required
def me():
    return jsonify(user=g.user)


@bp.post("/password")
@login_required
def change_password():
    body = request.get_json(silent=True) or {}
    current, new = str(body.get("current") or ""), str(body.get("new") or "")
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id = ?", (g.user["userId"],)).fetchone()
    if not verify_password(row["password_hash"], current):
        raise ApiError("Your current password is not correct.")
    if len(new) < 6:
        raise ApiError("Choose a new password with at least 6 characters.")
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(new), row["id"]))
    db.commit()
    return jsonify(ok=True)


@bp.post("/reset")
@admin_required
def reset_password():
    """The office sets a teacher's or parent's password back to the default."""
    login_name = normalise_login(str((request.get_json(silent=True) or {}).get("login") or ""))
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE login = ? AND role != 'admin'", (login_name,)).fetchone()
    if row is None:
        raise NotFound("There is no teacher or parent account with that phone number.")
    key = "TEACHER_DEFAULT_PASSWORD" if row["role"] == "teacher" else "PARENT_DEFAULT_PASSWORD"
    password = current_app.config[key]
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(password), row["id"]))
    db.commit()
    return jsonify(ok=True, login=row["login"], password=password)


# The profile picture. The browser crops and shrinks it to a small square JPEG before sending it,
# so it is kept on the account row as a data: URL rather than as a file. Anything that is not a
# real JPEG, PNG or WebP image, or is larger than a picture that size needs to be, is refused.
PHOTO_TYPES = {"image/jpeg": b"\xff\xd8\xff", "image/png": b"\x89PNG\r\n\x1a\n", "image/webp": b"RIFF"}
PHOTO_MAX_BYTES = 400 * 1024


def _checked_photo(value) -> str:
    text = str(value or "")
    head, _, data = text.partition(",")
    kind = head[len("data:"):-len(";base64")] if head.startswith("data:") and head.endswith(";base64") else ""
    if kind not in PHOTO_TYPES:
        raise ApiError("Choose a JPEG, PNG or WebP picture.")
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        raise ApiError("That picture could not be read. Try another one.")
    if not raw.startswith(PHOTO_TYPES[kind]) or (kind == "image/webp" and raw[8:12] != b"WEBP"):
        raise ApiError("That picture could not be read. Try another one.")
    if len(raw) > PHOTO_MAX_BYTES:
        raise ApiError("That picture is too large. Try a smaller one.")
    return text


@bp.get("/photo")
@login_required
def get_photo():
    row = get_db().execute("SELECT photo, photo_at FROM users WHERE id = ?", (g.user["userId"],)).fetchone()
    return jsonify(photo=row["photo"] or "", photoAt=row["photo_at"] or "")


@bp.put("/photo")
@login_required
def set_photo():
    photo = _checked_photo((request.get_json(silent=True) or {}).get("photo"))
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    db = get_db()
    db.execute("UPDATE users SET photo = ?, photo_at = ? WHERE id = ?", (photo, stamp, g.user["userId"]))
    db.commit()
    return jsonify(photoAt=stamp)


@bp.delete("/photo")
@login_required
def remove_photo():
    db = get_db()
    db.execute("UPDATE users SET photo = '', photo_at = '' WHERE id = ?", (g.user["userId"],))
    db.commit()
    return jsonify(photoAt="")
