"""Collections that are stored one row per mark but served as one document.

The frontend works with one document per class per term, for example

    attendance  {"id": "c_g4_2026_T3", "classId": "c_g4", "year": 2026, "term": 3,
                 "days": {"2026-10-05": {"L1013": "P", "L1014": "A"}}}

In the database every mark is its own row, which keeps reporting with SQL easy.
These classes translate between the two shapes.
"""
from ..errors import ApiError

DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri")
RUBRIC = ("EE", "ME", "AE", "BE")


def split_term_id(doc_id: str) -> tuple[str, int, int]:
    """'c_g4_2026_T3' -> ('c_g4', 2026, 3)"""
    try:
        class_id, year, term = doc_id.rsplit("_", 2)
        return class_id, int(year), int(term.lstrip("T"))
    except ValueError:
        raise ApiError("The id must look like <classId>_<year>_T<term>.")


def term_id(class_id: str, year: int, term: int) -> str:
    return f"{class_id}_{year}_T{term}"


class Attendance:
    def all(self, db) -> list[dict]:
        docs: dict[str, dict] = {}
        for r in db.execute("SELECT * FROM attendance_marks ORDER BY date"):
            key = term_id(r["class_id"], r["year"], r["term"])
            doc = docs.setdefault(key, {"id": key, "classId": r["class_id"], "year": r["year"], "term": r["term"], "days": {}})
            doc["days"].setdefault(r["date"], {})[r["learner_id"]] = r["status"]
        return list(docs.values())

    def get(self, db, doc_id: str) -> dict | None:
        return next((d for d in self.all(db) if d["id"] == doc_id), None)

    def patch(self, db, doc_id: str, patch: dict) -> dict:
        class_id, year, term = split_term_id(doc_id)
        for date, marks in (patch.get("days") or {}).items():
            for learner_id, status in (marks or {}).items():
                if status in ("P", "L", "A"):
                    db.execute(
                        "INSERT INTO attendance_marks (class_id, year, term, date, learner_id, status) VALUES (?,?,?,?,?,?) "
                        "ON CONFLICT(class_id, date, learner_id) DO UPDATE SET status = excluded.status, year = excluded.year, term = excluded.term",
                        (class_id, year, term, date, learner_id, status),
                    )
                elif status is None:
                    db.execute("DELETE FROM attendance_marks WHERE class_id = ? AND date = ? AND learner_id = ?", (class_id, date, learner_id))
                else:
                    raise ApiError("A register mark must be P, L or A.")
        return self.get(db, doc_id) or {"id": doc_id, "classId": class_id, "year": year, "term": term, "days": {}}

    def delete(self, db, doc_id: str) -> None:
        class_id, year, term = split_term_id(doc_id)
        db.execute("DELETE FROM attendance_marks WHERE class_id = ? AND year = ? AND term = ?", (class_id, year, term))


class Assessments:
    @staticmethod
    def _value(score: str):
        return score if score in RUBRIC else (int(float(score)) if float(score).is_integer() else float(score))

    def all(self, db) -> list[dict]:
        docs: dict[str, dict] = {}
        for r in db.execute("SELECT * FROM assessment_scores"):
            key = term_id(r["class_id"], r["year"], r["term"])
            doc = docs.setdefault(key, {"id": key, "classId": r["class_id"], "year": r["year"], "term": r["term"], "scores": {}})
            doc["scores"].setdefault(r["area_key"], {})[r["learner_id"]] = self._value(r["score"])
        return list(docs.values())

    def get(self, db, doc_id: str) -> dict | None:
        return next((d for d in self.all(db) if d["id"] == doc_id), None)

    def patch(self, db, doc_id: str, patch: dict) -> dict:
        class_id, year, term = split_term_id(doc_id)
        for area_key, scores in (patch.get("scores") or {}).items():
            for learner_id, score in (scores or {}).items():
                key = (class_id, year, term, area_key, learner_id)
                if score is None or score == "":
                    db.execute("DELETE FROM assessment_scores WHERE class_id = ? AND year = ? AND term = ? AND area_key = ? AND learner_id = ?", key)
                    continue
                if score not in RUBRIC:
                    try:
                        number = float(score)
                    except (TypeError, ValueError):
                        raise ApiError("A result must be marks out of 100 or one of EE, ME, AE, BE.")
                    if not 0 <= number <= 100:
                        raise ApiError("Marks must be between 0 and 100.")
                db.execute(
                    "INSERT INTO assessment_scores (class_id, year, term, area_key, learner_id, score) VALUES (?,?,?,?,?,?) "
                    "ON CONFLICT(class_id, year, term, area_key, learner_id) DO UPDATE SET score = excluded.score",
                    key + (str(score),),
                )
        return self.get(db, doc_id) or {"id": doc_id, "classId": class_id, "year": year, "term": term, "scores": {}}

    def delete(self, db, doc_id: str) -> None:
        class_id, year, term = split_term_id(doc_id)
        db.execute("DELETE FROM assessment_scores WHERE class_id = ? AND year = ? AND term = ?", (class_id, year, term))


class Timetables:
    """One document per class: {"id": classId, "classId": ..., "grid": {"Mon": {"1": {"a": area, "t": teacherId}}}}"""

    def all(self, db) -> list[dict]:
        docs: dict[str, dict] = {}
        for r in db.execute("SELECT * FROM timetable_slots"):
            doc = docs.setdefault(r["class_id"], {"id": r["class_id"], "classId": r["class_id"], "grid": {}})
            doc["grid"].setdefault(r["day"], {})[str(r["period"])] = {"a": r["area"], "t": r["teacher_id"] or ""}
        return list(docs.values())

    def get(self, db, doc_id: str) -> dict | None:
        return next((d for d in self.all(db) if d["id"] == doc_id), None)

    def patch(self, db, doc_id: str, patch: dict) -> dict:
        for day, periods in (patch.get("grid") or {}).items():
            if day not in DAYS:
                raise ApiError("The day must be one of Mon, Tue, Wed, Thu, Fri.")
            for period, cell in (periods or {}).items():
                area = (cell or {}).get("a") or ""
                if not area:
                    db.execute("DELETE FROM timetable_slots WHERE class_id = ? AND day = ? AND period = ?", (doc_id, day, int(period)))
                    continue
                db.execute(
                    "INSERT INTO timetable_slots (class_id, day, period, area, teacher_id) VALUES (?,?,?,?,?) "
                    "ON CONFLICT(class_id, day, period) DO UPDATE SET area = excluded.area, teacher_id = excluded.teacher_id",
                    (doc_id, day, int(period), area, (cell or {}).get("t") or None),
                )
        return self.get(db, doc_id) or {"id": doc_id, "classId": doc_id, "grid": {}}

    def delete(self, db, doc_id: str) -> None:
        db.execute("DELETE FROM timetable_slots WHERE class_id = ?", (doc_id,))


class Messages:
    """Conversations between a parent and the school, with their messages."""

    def _doc(self, db, row) -> dict:
        msgs = [
            {"who": m["who"], "name": m["name"], "text": m["text"], "at": m["at"]}
            for m in db.execute("SELECT * FROM thread_messages WHERE thread_id = ? ORDER BY id", (row["id"],))
        ]
        members = [
            {"login": m["login"], "name": m["name"], "role": m["role"]}
            for m in db.execute("SELECT * FROM thread_members WHERE thread_id = ? ORDER BY joined, name", (row["id"],))
        ]
        keys = row.keys()
        return {
            "id": row["id"], "learnerId": row["learner_id"] or "", "parentPhone": row["parent_phone"],
            "parentName": row["parent_name"], "to": row["to_staff"], "subject": row["subject"],
            "msgs": msgs, "updated": row["updated"],
            "kind": row["kind"] if "kind" in keys else "direct",
            "classId": (row["class_id"] if "class_id" in keys else "") or "",
            "joinToken": (row["join_token"] if "join_token" in keys else "") or "",
            "members": members,
        }

    def all(self, db, where: str = "", params: tuple = ()) -> list[dict]:
        sql = f"SELECT * FROM threads {('WHERE ' + where) if where else ''} ORDER BY updated DESC"
        return [self._doc(db, r) for r in db.execute(sql, params)]

    def get(self, db, doc_id: str) -> dict | None:
        row = db.execute("SELECT * FROM threads WHERE id = ?", (doc_id,)).fetchone()
        return self._doc(db, row) if row else None

    def by_token(self, db, token: str) -> dict | None:
        if not token:
            return None
        row = db.execute("SELECT * FROM threads WHERE join_token = ? AND kind = 'class'", (token,)).fetchone()
        return self._doc(db, row) if row else None

    def create(self, db, doc_id: str, thread: dict, first: dict | None) -> dict:
        db.execute(
            "INSERT INTO threads (id, learner_id, parent_phone, parent_name, to_staff, subject, updated, kind, class_id, join_token) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (doc_id, thread["learnerId"], thread["parentPhone"], thread["parentName"], thread["to"], thread["subject"],
             thread.get("updated") or (first or {}).get("at", ""), thread.get("kind", "direct"), thread.get("classId", ""), thread.get("joinToken", "")),
        )
        if first:
            self.add_message(db, doc_id, first)
        return self.get(db, doc_id)

    def create_group(self, db, doc_id: str, group: dict) -> dict:
        """A class group starts empty; the office or class teacher posts the first message."""
        return self.create(db, doc_id, {**group, "kind": "class"}, {})

    def set_token(self, db, doc_id: str, token: str) -> None:
        db.execute("UPDATE threads SET join_token = ? WHERE id = ?", (token, doc_id))

    def add_member(self, db, doc_id: str, member: dict) -> None:
        db.execute(
            "INSERT OR IGNORE INTO thread_members (thread_id, login, name, role, joined) VALUES (?,?,?,?,?)",
            (doc_id, member["login"], member["name"], member.get("role", "parent"), member.get("joined", "")),
        )

    def members(self, db, doc_id: str) -> list[dict]:
        return [
            {"login": m["login"], "name": m["name"], "role": m["role"]}
            for m in db.execute("SELECT * FROM thread_members WHERE thread_id = ? ORDER BY joined, name", (doc_id,))
        ]

    def is_member(self, db, doc_id: str, login: str) -> bool:
        return db.execute("SELECT 1 FROM thread_members WHERE thread_id = ? AND login = ?", (doc_id, login)).fetchone() is not None

    def add_message(self, db, doc_id: str, msg: dict) -> dict:
        db.execute("INSERT INTO thread_messages (thread_id, who, name, text, at) VALUES (?,?,?,?,?)", (doc_id, msg["who"], msg["name"], msg["text"], msg["at"]))
        db.execute("UPDATE threads SET updated = ? WHERE id = ?", (msg["at"], doc_id))
        return self.get(db, doc_id)

    def delete(self, db, doc_id: str) -> None:
        db.execute("DELETE FROM threads WHERE id = ?", (doc_id,))
