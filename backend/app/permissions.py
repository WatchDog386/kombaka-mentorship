"""Who may see and change what.

Three roles:
  admin    the school office: everything.
  teacher  registers, assessment, remarks, homework, own-class notices, messages sent to them.
  parent   read-only view of their own children, plus messages to the school.

`visible_data` filters what a user receives. `guard_put`, `guard_patch` and
`guard_delete` check a change before it is saved and return the document
that should actually be stored.
"""
from datetime import datetime

import secrets

from .errors import ApiError, Forbidden, NotFound
from .repositories import MERGED, TABLES, load_all, messages
from .security import normalise_login

ADMIN_ONLY_NOTE = "Only the school office can change this."


def now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")


def _is_teaching(staff: dict) -> bool:
    return "teacher" in (staff.get("role") or "").lower()


# ───────────────────────── reading ─────────────────────────

def _hide_group_token(threads: list[dict]) -> list[dict]:
    """Only the people who run a group get its invite link, so parents never receive one
    to pass on. The group itself is unaffected."""
    return [{**t, "joinToken": ""} for t in threads]


def visible_data(db, user: dict) -> dict[str, list[dict]]:
    data = load_all(db)
    role = user["role"]
    if role == "admin":
        return data

    if role == "teacher":
        me = user["id"]
        my_classes = {c["id"] for c in data["classes"] if c["teacherId"] == me}
        for learner in data["learners"]:
            learner.pop("bf", None)                       # fee details are the office's business
        data["staff"] = [{k: s[k] for k in ("id", "staffNo", "name", "role", "areas", "phone", "status")} for s in data["staff"]]
        data["notices"] = [n for n in data["notices"] if n["audience"] in ("All", "Teachers") or n["audience"] in my_classes or n["by"] == user["name"]]
        data["resources"] = [r for r in data["resources"] if r["classId"] in my_classes]
        mine = [t for t in data["messages"] if t["to"] == me]
        data["messages"] = [t for t in mine if t.get("kind") != "class"] + [
            t for t in data["messages"] if t.get("kind") == "class" and t.get("classId") in my_classes
        ]
        for name in ("payments", "expenses", "applications", "books"):
            data[name] = []
        return data

    # parent
    phone = user["id"]
    kids = [l for l in data["learners"] if normalise_login(l["guardianPhone"]) == phone and l["status"] == "Active"]
    kid_ids = {k["id"] for k in kids}
    class_ids = {k["classId"] for k in kids}
    class_teachers = {c["teacherId"] for c in data["classes"] if c["id"] in class_ids}

    data["learners"] = kids
    data["staff"] = [
        {"id": s["id"], "name": s["name"], "role": s["role"], "status": s["status"], "phone": s["phone"] if s["id"] in class_teachers else ""}
        for s in data["staff"] if _is_teaching(s)
    ]
    data["payments"] = [p for p in data["payments"] if p["learnerId"] in kid_ids]
    data["notices"] = [n for n in data["notices"] if n["audience"] in ("All", "Parents") or n["audience"] in class_ids]
    data["resources"] = [r for r in data["resources"] if r["classId"] in class_ids]
    data["homework"] = [h for h in data["homework"] if h["classId"] in class_ids]
    data["timetables"] = [t for t in data["timetables"] if t["id"] in class_ids]
    data["remarks"] = [r for r in data["remarks"] if r["learnerId"] in kid_ids]
    data["messages"] = [t for t in data["messages"] if normalise_login(t["parentPhone"]) == phone] + [
        t for t in data["messages"] if t.get("kind") == "class" and t.get("classId") in class_ids
    ]
    data["messages"] = _hide_group_token(data["messages"])
    data["attendance"] = [
        {**doc, "days": {date: {lid: m for lid, m in marks.items() if lid in kid_ids} for date, marks in doc["days"].items()}}
        for doc in data["attendance"] if doc["classId"] in class_ids
    ]
    data["assessments"] = [
        {**doc, "scores": {area: {lid: v for lid, v in scores.items() if lid in kid_ids} for area, scores in doc["scores"].items()}}
        for doc in data["assessments"] if doc["classId"] in class_ids
    ]
    for name in ("expenses", "applications", "books"):
        data[name] = []
    return data


# ───────────────────────── teaching material ─────────────────────────

def _teacher_owns(db, user: dict, class_id: str) -> bool:
    return user["role"] == "teacher" and (TABLES["classes"].get(db, class_id) or {}).get("teacherId") == user["id"]


def _parent_owns(db, user: dict, class_id: str) -> bool:
    if user["role"] != "parent":
        return False
    phone = normalise_login(user["id"])
    return any(
        normalise_login(l["guardianPhone"]) == phone
        for l in TABLES["learners"].all(db, "class_id = ? AND status = 'Active'", (class_id,))
    )


def may_read_resource(db, user: dict, class_id: str) -> bool:
    """Staff read every class's material; a parent reads their own children's classes."""
    return user["role"] == "admin" or _teacher_owns(db, user, class_id) or _parent_owns(db, user, class_id)


def may_write_resource(db, user: dict, class_id: str) -> bool:
    """Uploading and removing is for the school office and the class teacher."""
    return user["role"] == "admin" or _teacher_owns(db, user, class_id)


# ───────────────────────── class groups ─────────────────────────

def _group_teacher(db, group: dict) -> str:
    return (TABLES["classes"].get(db, group.get("classId") or "") or {}).get("teacherId", "")


def _in_group(db, group: dict, user: dict) -> bool:
    """Who may read and post in a class group: the school office, the class teacher, and the
    guardians of the learners in that class. Membership is by class, not by invitation, so a
    parent admitted later can join the link and land in the right place."""
    if user["role"] == "admin":
        return True
    if user["role"] == "teacher":
        return _group_teacher(db, group) == user["id"]
    guardians = {
        normalise_login(l["guardianPhone"])
        for l in TABLES["learners"].all(db, "class_id = ? AND status = 'Active'", (group.get("classId") or "",))
    }
    return normalise_login(user["id"]) in guardians


def _sync_group_members(db, group: dict) -> list[dict]:
    """Every guardian of every learner in the class is a member, plus the class teacher and
    the school office. Members already there are kept, so nobody is dropped."""
    cid = group.get("classId") or ""
    wanted: dict[str, dict] = {}
    for l in TABLES["learners"].all(db, "class_id = ? AND status = 'Active'", (cid,)):
        phone = normalise_login(l["guardianPhone"])
        if phone and phone not in wanted:
            wanted[phone] = {"login": phone, "name": l["guardianName"], "role": "parent"}
    teacher = _group_teacher(db, group)
    if teacher:
        wanted[teacher] = {"login": teacher, "name": (TABLES["staff"].get(db, teacher) or {}).get("name", ""), "role": "staff"}
    wanted["office"] = {"login": "office", "name": "School office", "role": "staff"}
    joined = now_iso()
    for m in wanted.values():
        messages.add_member(db, group["id"], {**m, "joined": joined})
    return messages.members(db, group["id"])


def open_class_group(db, user: dict, class_id: str) -> dict:
    """Find or open the group for a class. The class teacher and the school office may do this."""
    cls = TABLES["classes"].get(db, class_id)
    if not cls:
        raise NotFound("There is no class with that id.")
    if user["role"] != "admin" and not (user["role"] == "teacher" and cls["teacherId"] == user["id"]):
        raise Forbidden("Only the school office or the class teacher can open a group for this class.")
    existing = db.execute("SELECT * FROM threads WHERE kind = 'class' AND class_id = ?", (class_id,)).fetchone()
    if existing:
        group = messages.get(db, existing["id"])
        _sync_group_members(db, group)
        db.commit()
        return messages.get(db, group["id"])
    token = secrets.token_urlsafe(18)
    group = messages.create_group(db, f"g_{secrets.token_hex(6)}", {
        "learnerId": None, "parentPhone": "", "parentName": "", "to": cls["teacherId"] or "office",
        "subject": f"{cls['name']} parents", "classId": class_id, "joinToken": token, "updated": now_iso(),
    })
    _sync_group_members(db, group)
    db.commit()
    return messages.get(db, group["id"])


# ───────────────────────── writing ─────────────────────────

def guard_put(db, user: dict, collection: str, doc_id: str, doc: dict, existing: dict | None) -> dict:
    """Return the document to store, or raise if this user may not store it."""
    role = user["role"]
    if collection in MERGED:
        raise ApiError(f"Save {collection} with PATCH.", 405)
    if collection == "resources":
        # A row without bytes behind it would download as nothing, so files are only made
        # by POST /api/files, which takes the upload itself.
        raise ApiError("Add teaching material by uploading the file.", 405)
    if role == "admin":
        return doc
    if role == "teacher":
        if collection == "remarks":
            # A teacher writes the class teacher's remarks; the head teacher's stay as they are.
            return {**doc, "head": (existing or {}).get("head", "")}
        if collection == "homework":
            if existing and existing["by"] != user["name"]:
                raise Forbidden("You can only change homework you set.")
            return {**doc, "by": user["name"]}
        if collection == "notices":
            my_classes = {c["id"] for c in TABLES["classes"].all(db) if c["teacherId"] == user["id"]}
            if existing and existing["by"] != user["name"]:
                raise Forbidden("You can only change notices you posted.")
            if doc.get("audience") not in my_classes | {"Teachers"}:
                raise Forbidden("Teachers can post to their own class parents or to teachers.")
            return {**doc, "by": user["name"], "pinned": False}
    raise Forbidden(ADMIN_ONLY_NOTE)


def guard_patch(user: dict, collection: str) -> None:
    if collection not in MERGED:
        raise ApiError(f"{collection} cannot be saved with PATCH.", 405)
    if user["role"] == "admin":
        return
    if user["role"] == "teacher" and collection in ("attendance", "assessments"):
        return
    raise Forbidden(ADMIN_ONLY_NOTE)


def guard_delete(user: dict, collection: str, existing: dict) -> None:
    if user["role"] == "admin":
        return
    if user["role"] == "teacher" and collection in ("homework", "notices") and existing.get("by") == user["name"]:
        return
    raise Forbidden(ADMIN_ONLY_NOTE)


def save_message(db, user: dict, doc_id: str, doc: dict) -> dict:
    """Start a conversation or add one reply. Who wrote it comes from the login, never from the request."""
    msgs = doc.get("msgs") or []
    text = str((msgs[-1] if msgs else {}).get("text") or "").strip()
    if not text:
        raise ApiError("Write a message first.")
    role = user["role"]
    author = {"who": "parent" if role == "parent" else "staff", "name": user["name"], "text": text[:4000], "at": now_iso()}
    existing = messages.get(db, doc_id)

    if existing:
        if existing.get("kind") == "class":
            if not _in_group(db, existing, user):
                raise NotFound()
            if len(msgs) <= len(existing["msgs"]):
                raise ApiError("There is no new message to add.")
            return messages.add_message(db, doc_id, author)
        mine = (
            role == "admin"
            or (role == "teacher" and existing["to"] == user["id"])
            or (role == "parent" and normalise_login(existing["parentPhone"]) == user["id"])
        )
        if not mine:
            raise NotFound()
        if len(msgs) <= len(existing["msgs"]):
            raise ApiError("There is no new message to add.")
        return messages.add_message(db, doc_id, author)

    learner = TABLES["learners"].get(db, str(doc.get("learnerId") or ""))
    if not learner:
        raise ApiError("Choose the learner this message is about.")
    subject = str(doc.get("subject") or "").strip()[:200] or "Message"
    thread = {"learnerId": learner["id"], "subject": subject, "parentPhone": normalise_login(learner["guardianPhone"]), "parentName": learner["guardianName"]}
    if role == "parent":
        if normalise_login(learner["guardianPhone"]) != user["id"]:
            raise Forbidden("You can only write about your own child.")
        class_teacher = (TABLES["classes"].get(db, learner["classId"]) or {}).get("teacherId")
        to = doc.get("to")
        if to not in ("office", class_teacher):
            raise Forbidden("Write to the class teacher or the school office.")
        thread["to"] = to
    elif role == "teacher":
        thread["to"] = user["id"]
    else:
        thread["to"] = "office"
    return messages.create(db, doc_id, thread, author)
