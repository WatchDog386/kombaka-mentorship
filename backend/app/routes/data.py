"""The school records: one small REST interface for every collection.

    GET    /api/bootstrap            everything the signed-in user may see
    GET    /api/<collection>         one collection (filtered the same way)
    PUT    /api/<collection>/<id>    create or replace a record
    PATCH  /api/<collection>/<id>    merge marks into a register, result sheet or timetable
    DELETE /api/<collection>/<id>    delete a record
"""
import re
import sqlite3
from datetime import date

from flask import Blueprint, g, jsonify, request

from ..accounts import sync_accounts
from ..db import get_db
from ..errors import ApiError, NotFound
from ..permissions import guard_delete, guard_patch, guard_put, save_message, visible_data
from ..repositories import COLLECTIONS, MERGED, TABLES, messages
from ..security import login_required, normalise_login

bp = Blueprint("data", __name__, url_prefix="/api")

ID_PATTERN = re.compile(r"^[A-Za-z0-9_.:@+~-]{1,80}$")


def _check(collection: str, doc_id: str | None = None) -> None:
    if collection not in COLLECTIONS:
        raise NotFound(f"There is no collection called {collection}.")
    if doc_id is not None and not ID_PATTERN.match(doc_id):
        raise ApiError("That id has characters that are not allowed.")


def _body() -> dict:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError("Send a JSON object.")
    return body


def _friendly(error: sqlite3.IntegrityError, collection: str) -> ApiError:
    text = str(error)
    if "learners.adm_no" in text:
        return ApiError("That admission number is already in use.", 409)
    if "payments.receipt_no" in text:
        return ApiError("That receipt number is already in use.", 409)
    if "FOREIGN KEY" in text:
        hints = {
            "learners": "This learner has payments on record, or the class does not exist. To keep history, set the status to Left instead of deleting.",
            "classes": "Move the learners in this class to another class first.",
            "payments": "Choose a learner who is on record.",
        }
        return ApiError(hints.get(collection, "This record is linked to other records."), 409)
    if "CHECK" in text or "NOT NULL" in text:
        return ApiError("Some required details are missing or not valid.")
    return ApiError("The record could not be saved.", 409)


@bp.get("/bootstrap")
@login_required
def bootstrap():
    return jsonify(user=g.user, data=visible_data(get_db(), g.user))


@bp.get("/<collection>")
@login_required
def list_collection(collection):
    _check(collection)
    return jsonify(visible_data(get_db(), g.user)[collection])


@bp.put("/<collection>/<doc_id>")
@login_required
def put_document(collection, doc_id):
    _check(collection, doc_id)
    db, user, doc = get_db(), g.user, _body()
    try:
        if collection == "messages":
            saved = save_message(db, user, doc_id, doc)
        else:
            table = TABLES.get(collection)
            existing = table.get(db, doc_id) if table else None
            doc = guard_put(db, user, collection, doc_id, doc, existing)
            doc = _prepare(db, user, collection, doc, existing)
            saved = table.put(db, doc_id, doc)
            if collection in ("staff", "learners", "applications"):
                sync_accounts(db)
        db.commit()
    except sqlite3.IntegrityError as error:
        db.rollback()
        raise _friendly(error, collection)
    return jsonify(saved)


def _prepare(db, user: dict, collection: str, doc: dict, existing: dict | None) -> dict:
    """Rules that belong to one collection, applied just before saving."""
    if collection == "config":
        return doc
    if collection == "learners":
        doc["guardianPhone"] = normalise_login(str(doc.get("guardianPhone") or ""))
        if not str(doc.get("name") or "").strip() or not str(doc.get("admNo") or "").strip():
            raise ApiError("A learner needs a name and an admission number.")
    if collection == "staff":
        doc["phone"] = normalise_login(str(doc.get("phone") or ""))
    if collection == "payments":
        try:
            amount = float(doc.get("amount") or 0)
        except (TypeError, ValueError):
            amount = 0
        if amount <= 0:
            raise ApiError("Enter an amount above zero.")
        if existing is None:
            # The server issues receipt numbers so two cashiers never get the same one.
            year = int(doc.get("year") or date.today().year)
            prefix = f"R{str(year)[2:]}-"
            last = db.execute("SELECT MAX(CAST(substr(receipt_no, 5) AS INTEGER)) FROM payments WHERE receipt_no LIKE ?", (prefix + "%",)).fetchone()[0] or 0
            doc["receiptNo"] = f"{prefix}{last + 1:04d}"
            doc["by"] = user["name"]
        else:
            doc["receiptNo"], doc["by"] = existing["receiptNo"], existing["by"]
    return doc


@bp.patch("/<collection>/<doc_id>")
@login_required
def patch_document(collection, doc_id):
    _check(collection, doc_id)
    guard_patch(g.user, collection)
    db = get_db()
    try:
        saved = MERGED[collection].patch(db, doc_id, _body().get("patch") or {})
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        raise ApiError("That class or learner is not on record.", 409)
    return jsonify(saved)


@bp.delete("/<collection>/<doc_id>")
@login_required
def delete_document(collection, doc_id):
    _check(collection, doc_id)
    db = get_db()
    repo = TABLES.get(collection) or MERGED.get(collection) or messages
    existing = repo.get(db, doc_id)
    if existing is None:
        return jsonify(ok=True)
    guard_delete(g.user, collection, existing)
    try:
        repo.delete(db, doc_id)
        if collection in ("staff", "learners", "applications"):
            sync_accounts(db)
        db.commit()
    except sqlite3.IntegrityError as error:
        db.rollback()
        raise _friendly(error, collection)
    return jsonify(ok=True)
