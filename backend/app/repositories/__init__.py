"""Every collection the API serves, by the name the frontend uses for it."""
from .registers import Assessments, Attendance, Messages, Timetables
from .table import F, Table

TABLES: dict[str, Table] = {
    "config": Table("school", [
        F("name"), F("motto"), F("about"), F("address"), F("county"), F("phone"), F("email"), F("paybill"),
        F("year", kind="int"), F("term", kind="int"), F("nextOpens", "next_opens"),
        F("terms", kind="json"), F("bands", kind="json"), F("areas", kind="json"), F("fees", kind="json"),
    ]),
    "staff": Table("staff", [
        F("staffNo", "staff_no"), F("name"), F("role"), F("gender"), F("areas"), F("tsc"),
        F("phone"), F("email"), F("status"), F("joined"),
    ], order_by="staff_no"),
    "classes": Table("classes", [
        F("name"), F("level"), F("order", "sort_order", "int"), F("teacherId", "teacher_id", "ref"), F("room"),
    ], order_by="sort_order"),
    "routes": Table("routes", [
        F("name"), F("vehicle"), F("driver"), F("fee", kind="num"), F("pickup"), F("stops"),
    ], order_by="name"),
    "learners": Table("learners", [
        F("admNo", "adm_no"), F("name"), F("gender"), F("dob"), F("classId", "class_id", "ref"), F("upi"),
        F("guardianName", "guardian_name"), F("guardianPhone", "guardian_phone"), F("guardianRelation", "guardian_relation"),
        F("routeId", "route_id", "ref"), F("lunch", kind="bool"), F("medical"), F("status"), F("joined"), F("bf", kind="num"),
    ], order_by="adm_no"),
    "payments": Table("payments", [
        F("receiptNo", "receipt_no"), F("learnerId", "learner_id"), F("amount", kind="num"), F("method"), F("ref"),
        F("date"), F("term", kind="int"), F("year", kind="int"), F("note"), F("by", "recorded_by"),
    ], order_by="date"),
    "expenses": Table("expenses", [
        F("date"), F("category"), F("payee"), F("amount", kind="num"), F("method"), F("ref"), F("note"),
        F("term", kind="int"), F("year", kind="int"),
    ], order_by="date"),
    "notices": Table("notices", [
        F("title"), F("body"), F("audience"), F("date"), F("by", "posted_by"), F("pinned", kind="bool"),
    ], order_by="date DESC"),
    "events": Table("events", [
        F("date"), F("endDate", "end_date"), F("title"), F("type"), F("note"),
    ], order_by="date"),
    "homework": Table("homework", [
        F("classId", "class_id"), F("area"), F("title"), F("details"), F("due"), F("date"), F("by", "set_by"),
    ], order_by="due DESC"),
    "books": Table("books", [
        F("title"), F("author"), F("category"), F("copies", kind="int"), F("shelf"), F("loans", kind="json"),
    ], order_by="title"),
    "resources": Table("resources", [
        F("classId", "class_id"), F("area"), F("title"), F("fileName", "file_name"), F("storedName", "stored_name"),
        F("kind"), F("size", kind="int"), F("by"), F("date"),
    ], order_by="date DESC, title"),
    "applications": Table("applications", [
        F("child"), F("classId", "class_id"), F("parent"), F("phone"), F("message"), F("status"), F("date"),
    ], order_by="date DESC"),
    "remarks": Table("remarks", [
        F("learnerId", "learner_id"), F("year", kind="int"), F("term", kind="int"), F("teacher"), F("head"),
    ]),
}

attendance = Attendance()
assessments = Assessments()
timetables = Timetables()
messages = Messages()

# Collections saved with PATCH (many small marks merged into one document).
MERGED = {"attendance": attendance, "assessments": assessments, "timetables": timetables}

# Every collection name, in the order the frontend loads them.
COLLECTIONS = [
    "config", "classes", "staff", "learners", "payments", "expenses", "notices", "events", "homework",
    "messages", "timetables", "routes", "books", "resources", "attendance", "assessments", "remarks", "applications",
]


def load_all(db) -> dict[str, list[dict]]:
    data = {name: table.all(db) for name, table in TABLES.items()}
    data.update({name: repo.all(db) for name, repo in MERGED.items()})
    data["messages"] = messages.all(db)
    return data
