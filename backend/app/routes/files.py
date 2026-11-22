"""Teaching material: uploading a file, giving it back, and taking it away.

The bytes live on disk under UPLOAD_DIR and the row in the `resources` table is the label on
the envelope. The name a file is stored under is always generated here, never taken from the
uploader, so nothing a browser sends can point the server at a path of its choosing.

Reading and writing are checked in permissions.py: staff see every class, a parent sees only
the classes their children are in, and only staff may upload or delete.
"""
import mimetypes
import re
import secrets
from pathlib import Path

from flask import Blueprint, current_app, g, jsonify, request, send_file

from ..db import get_db
from ..errors import ApiError, Forbidden, NotFound
from ..permissions import may_read_resource, may_write_resource
from ..repositories import TABLES
from ..security import login_required

bp = Blueprint("files", __name__, url_prefix="/api/files")

# What a school actually uploads, shown as a short label on the file card.
KINDS = {
    "pdf": ("application/pdf", "PDF"),
    "word": ("application/msword", "Word"),
    "doc": ("application/msword", "Word"),
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Word"),
    "xls": ("application/vnd.ms-excel", "Sheet"),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Sheet"),
    "ppt": ("application/vnd.ms-powerpoint", "Slides"),
    "pptx": ("application/vnd.openxmlformats-officedocument.presentationml.presentation", "Slides"),
    "odt": ("application/vnd.oasis.opendocument.text", "Document"),
    "ods": ("application/vnd.oasis.opendocument.spreadsheet", "Sheet"),
    "txt": ("text/plain", "Text"),
    "png": ("image/png", "Image"),
    "jpg": ("image/jpeg", "Image"),
    "jpeg": ("image/jpeg", "Image"),
    "webp": ("image/webp", "Image"),
}

# Kept short and safe so it can be shown on the card and used as a file extension.
UNSAFE = re.compile(r"[^A-Za-z0-9._ -]+")


def upload_dir() -> Path:
    path = Path(current_app.config["UPLOAD_DIR"])
    path.mkdir(parents=True, exist_ok=True)
    return path


def kind_of(name: str, mime: str) -> tuple[str, str]:
    """A short label and the content type to serve it back with."""
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext in KINDS:
        return ext, KINDS[ext][0]
    if mime.startswith("image/"):
        return "image", mime
    if mime.startswith("text/"):
        return "txt", "text/plain"
    guessed = mimetypes.guess_type(name)[0]
    return "file", guessed or "application/octet-stream"


def label_of(kind: str) -> str:
    return KINDS.get(kind, ("", "File"))[1]


def clean_title(title: str, file_name: str) -> str:
    text = " ".join(UNSAFE.sub(" ", title or "").split())
    if text:
        return text[:150]
    return file_name[:150]


@bp.get("")
@login_required
def list_files():
    db, user = get_db(), g.user
    out = [
        {**r, "label": label_of(r.get("kind", ""))}
        for r in TABLES["resources"].all(db)
        if may_read_resource(db, user, r["classId"])
    ]
    return jsonify(out)


@bp.post("")
@login_required
def upload():
    """Receive one file. The form carries classId, area and an optional title."""
    db, user = get_db(), g.user
    sent = request.files.get("file")
    if sent is None or not sent.filename:
        raise ApiError("Choose a file to upload.")
    class_id = str(request.form.get("classId") or "")
    if not TABLES["classes"].get(db, class_id):
        raise ApiError("Choose the class this material is for.")
    if not may_write_resource(db, user, class_id):
        raise Forbidden("You can only add material to your own class.")

    file_name = UNSAFE.sub("_", Path(sent.filename).name).strip() or "file"
    limit = int(current_app.config["MAX_UPLOAD_MB"]) * 1024 * 1024
    stored = f"{secrets.token_hex(12)}"
    target = upload_dir() / stored
    sent.save(target)
    size = target.stat().st_size
    if size > limit:
        target.unlink(missing_ok=True)
        raise ApiError(f"That file is {size // 1048576} MB. The limit is {current_app.config['MAX_UPLOAD_MB']} MB.", 413)

    kind, mime = kind_of(file_name, sent.mimetype or "")
    doc = {
        "classId": class_id,
        "area": str(request.form.get("area") or "").strip()[:80],
        "title": clean_title(request.form.get("title"), file_name),
        "fileName": file_name[:200],
        "storedName": stored,
        "kind": kind,
        "size": size,
        "by": user["name"],
        "date": str(request.form.get("date") or "") or _today(),
    }
    doc_id = "r_" + secrets.token_hex(6)
    TABLES["resources"].put(db, doc_id, doc)
    db.commit()
    return jsonify(TABLES["resources"].get(db, doc_id) | {"label": label_of(kind)}), 201


@bp.get("/<doc_id>")
@login_required
def download(doc_id):
    """Hand the file back, under the name it had when it was uploaded."""
    db, user = get_db(), g.user
    row = TABLES["resources"].get(db, doc_id)
    if row is None or not may_read_resource(db, user, row["classId"]):
        raise NotFound("There is no file with that id.")
    path = upload_dir() / row["storedName"]
    if not path.is_file():
        raise NotFound("That file is no longer on the server.")
    _, mime = kind_of(row["fileName"], "")
    return send_file(path, mimetype=mime, as_attachment=True, download_name=row["fileName"])


@bp.delete("/<doc_id>")
@login_required
def remove(doc_id):
    db, user = get_db(), g.user
    row = TABLES["resources"].get(db, doc_id)
    if row is None:
        return jsonify(ok=True)
    if not may_write_resource(db, user, row["classId"]):
        raise Forbidden("You can only remove material from your own class.")
    (upload_dir() / row["storedName"]).unlink(missing_ok=True)
    TABLES["resources"].delete(db, doc_id)
    db.commit()
    return jsonify(ok=True)


def _today() -> str:
    from datetime import date

    return date.today().isoformat()