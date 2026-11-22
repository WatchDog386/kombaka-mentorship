"""Keeps login accounts in step with staff and learner records.

- Every teaching staff member gets a teacher account (login = staff phone).
- Every guardian of an active learner gets a parent account (login = guardian phone).
- A family that created its own account keeps it while its admission application is
  New or Contacted; once the child is admitted it is an ordinary guardian account.
- Accounts whose staff member, learners or open application are gone are removed.

New accounts start with the default passwords in the settings (.env).
"""
from flask import current_app

from .security import hash_password, normalise_login


def is_teaching(role: str) -> bool:
    return "teacher" in (role or "").lower()


def sync_accounts(db, teacher_password: str | None = None, parent_password: str | None = None) -> None:
    teacher_password = teacher_password or current_app.config["TEACHER_DEFAULT_PASSWORD"]
    parent_password = parent_password or current_app.config["PARENT_DEFAULT_PASSWORD"]
    taken = {r["login"]: r for r in db.execute("SELECT * FROM users")}

    # Teachers
    wanted_staff = set()
    for s in db.execute("SELECT id, name, role, phone, status FROM staff"):
        login = normalise_login(s["phone"])
        if not is_teaching(s["role"]) or s["status"] == "Left" or not login:
            continue
        wanted_staff.add(s["id"])
        current = db.execute("SELECT * FROM users WHERE role = 'teacher' AND staff_id = ?", (s["id"],)).fetchone()
        if current:
            if current["login"] != login and login not in taken:
                db.execute("UPDATE users SET login = ?, name = ? WHERE id = ?", (login, s["name"], current["id"]))
            elif current["name"] != s["name"]:
                db.execute("UPDATE users SET name = ? WHERE id = ?", (s["name"], current["id"]))
        elif login not in taken:
            db.execute("INSERT INTO users (role, login, name, password_hash, staff_id) VALUES ('teacher', ?, ?, ?, ?)", (login, s["name"], hash_password(teacher_password), s["id"]))
            taken[login] = True
    for u in db.execute("SELECT id, staff_id FROM users WHERE role = 'teacher'").fetchall():
        if u["staff_id"] not in wanted_staff:
            db.execute("DELETE FROM users WHERE id = ?", (u["id"],))

    # Parents
    taken = {r["login"] for r in db.execute("SELECT login FROM users")}
    guardians: dict[str, str] = {}
    for l in db.execute("SELECT guardian_name, guardian_phone FROM learners WHERE status = 'Active'"):
        login = normalise_login(l["guardian_phone"])
        if login:
            guardians.setdefault(login, l["guardian_name"])
    for login, name in guardians.items():
        current = db.execute("SELECT * FROM users WHERE role = 'parent' AND login = ?", (login,)).fetchone()
        if current:
            if current["name"] != name:
                db.execute("UPDATE users SET name = ? WHERE id = ?", (name, current["id"]))
        elif login not in taken:
            db.execute("INSERT INTO users (role, login, name, password_hash) VALUES ('parent', ?, ?, ?)", (login, name, hash_password(parent_password)))
    # A family that created an account keeps it while their application is open.
    applicants = {r["phone"] for r in db.execute("SELECT phone FROM applications WHERE status IN ('New', 'Contacted')")}
    for u in db.execute("SELECT id, login FROM users WHERE role = 'parent'").fetchall():
        if u["login"] not in guardians and u["login"] not in applicants:
            db.execute("DELETE FROM users WHERE id = ?", (u["id"],))


def create_admin(db, username: str, password: str) -> None:
    login = normalise_login(username)
    db.execute(
        "INSERT INTO users (role, login, name, password_hash) VALUES ('admin', ?, 'School office', ?) "
        "ON CONFLICT(login) DO UPDATE SET password_hash = excluded.password_hash, role = 'admin'",
        (login, hash_password(password)),
    )
