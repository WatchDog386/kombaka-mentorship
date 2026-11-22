"""What anyone can see or send without signing in: the school home page."""
import re
import time
from datetime import date

from flask import Blueprint, current_app, jsonify, request

from ..db import get_db
from ..errors import ApiError
from ..repositories import TABLES
from ..security import normalise_login

bp = Blueprint("public", __name__, url_prefix="/api/public")

_recent: dict[str, list[float]] = {}   # applications per address, to slow down spam


@bp.get("")
def home():
    db = get_db()
    school = TABLES["config"].get(db, "school")
    today = date.today().isoformat()
    learners = db.execute("SELECT COUNT(*) FROM learners WHERE status = 'Active'").fetchone()[0]
    teachers = db.execute("SELECT COUNT(*) FROM staff WHERE lower(role) LIKE '%teacher%' AND status != 'Left'").fetchone()[0]
    data = {
        "config": [school] if school else [],
        "classes": [{k: c[k] for k in ("id", "name", "level", "order")} for c in TABLES["classes"].all(db)],
        "events": TABLES["events"].all(db, "COALESCE(NULLIF(end_date, ''), date) >= ?", (today,)),
        "notices": TABLES["notices"].all(db, "audience = 'All'")[:3],
    }
    demo = []
    if current_app.config["SHOW_DEMO_ACCOUNTS"]:
        teacher = db.execute(
            "SELECT u.login, u.name FROM users u LEFT JOIN classes c ON c.teacher_id = u.staff_id "
            "WHERE u.role = 'teacher' ORDER BY c.sort_order DESC LIMIT 1"
        ).fetchone()
        parent = db.execute("SELECT login, name FROM users WHERE role = 'parent' ORDER BY id LIMIT 1").fetchone()
        demo.append({"role": "School office", "login": "admin", "password": "admin123"})
        if teacher:
            demo.append({"role": "Teacher, " + teacher["name"], "login": teacher["login"], "password": current_app.config["TEACHER_DEFAULT_PASSWORD"]})
        if parent:
            demo.append({"role": "Parent, " + parent["name"], "login": parent["login"], "password": current_app.config["PARENT_DEFAULT_PASSWORD"]})
    return jsonify(data=data, counts={"learners": learners, "teachers": teachers}, demo=demo)


def check_rate() -> list[float]:
    """Refuse a device that has sent five applications in the last hour."""
    address = request.remote_addr or "unknown"
    recent = [t for t in _recent.get(address, []) if time.time() - t < 3600]
    if len(recent) >= 5:
        raise ApiError("Too many applications from this device. Please call the school office.", 429)
    return recent


def note_sent(recent: list[float]) -> None:
    _recent[request.remote_addr or "unknown"] = recent + [time.time()]


def read_application(body: dict) -> dict:
    """The application in a request body, checked. Raises ApiError when something is missing."""
    child, parent = str(body.get("child") or "").strip(), str(body.get("parent") or "").strip()
    phone = normalise_login(str(body.get("phone") or ""))
    if not child or not parent or not re.fullmatch(r"0\d{9}", phone):
        raise ApiError("Enter the child's name, the parent's name and a phone number like 0712 345 678.")
    return {
        "child": child[:120], "parent": parent[:120], "phone": phone,
        "classId": str(body.get("classId") or "")[:80], "message": str(body.get("message") or "")[:1000],
        "status": "New", "date": date.today().isoformat(),
    }


def save_application(db, app: dict) -> None:
    TABLES["applications"].put(db, "a" + format(int(time.time() * 1000), "x"), app)


@bp.post("/applications")
def apply():
    """An admission application without an account. The site now sends families to
    /api/auth/register instead, which creates the account and the application together."""
    recent = check_rate()
    app = read_application(request.get_json(silent=True) or {})
    db = get_db()
    save_application(db, app)
    db.commit()
    note_sent(recent)
    return jsonify(ok=True), 201
