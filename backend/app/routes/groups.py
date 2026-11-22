"""Class group chats: opening one for a class, its invite link, and joining by that link.

A group is a thread with `kind = 'class'` (see schema.sql). Membership is worked out from the
class, not from who was invited: the guardians of the learners in the class, the class teacher
and the school office. The invite link only decides *which* group a person lands in, so it
carries an unguessable token and still needs a signed-in account.
"""
import secrets

from flask import Blueprint, g, jsonify, request

from ..db import get_db
from ..errors import ApiError, Forbidden, NotFound
from ..permissions import _in_group, open_class_group
from ..repositories import messages
from ..security import login_required

bp = Blueprint("groups", __name__, url_prefix="/api/groups")


def _link(group: dict) -> str:
    return f"/?join={group['joinToken']}" if group.get("joinToken") else ""


def _view(db, group: dict, user: dict) -> dict:
    """A group as the person asking sees it: without the invite link unless they run it."""
    doc = dict(group)
    if not (user["role"] == "admin" or (user["role"] == "teacher" and group["to"] == user["id"])):
        doc["joinToken"] = ""
    return doc


@bp.get("")
@login_required
def list_groups():
    """Every class group this person is in."""
    db, user = get_db(), g.user
    out = []
    for t in messages.all(db, "kind = 'class'"):
        if _in_group(db, t, user):
            out.append(_view(db, t, user))
    return jsonify(out)


@bp.post("")
@login_required
def create_group():
    """Open the group for a class, or hand back the one that already exists."""
    body = request.get_json(silent=True) or {}
    group = open_class_group(get_db(), g.user, str(body.get("classId") or ""))
    return jsonify(_view(get_db(), group, g.user)), 201


@bp.post("/link")
@login_required
def group_link():
    """The invite link for a class, and a fresh token when asked for one."""
    body = request.get_json(silent=True) or {}
    db, user = get_db(), g.user
    group = open_class_group(db, user, str(body.get("classId") or ""))
    if body.get("renew") or not group["joinToken"]:
        messages.set_token(db, group["id"], secrets.token_urlsafe(18))
        db.commit()
        group = messages.get(db, group["id"])
    return jsonify(link=_link(group), threadId=group["id"], classId=group["classId"], subject=group["subject"])


@bp.post("/link/off")
@login_required
def revoke_link():
    """Stop the invite link working. The group and its messages are kept."""
    body = request.get_json(silent=True) or {}
    db, user = get_db(), g.user
    group = open_class_group(db, user, str(body.get("classId") or ""))
    messages.set_token(db, group["id"], "")
    db.commit()
    return jsonify(link="", threadId=group["id"])


@bp.post("/join")
@login_required
def join_group():
    """Follow an invite link. The token says which group; the signed-in account decides whether
    this person may be in it, so the link alone gets nobody in."""
    body = request.get_json(silent=True) or {}
    db, user = get_db(), g.user
    group = messages.by_token(db, str(body.get("token") or "").strip())
    if group is None:
        raise NotFound("That group link is not valid, or it has been switched off.")
    if not _in_group(db, group, user):
        raise Forbidden("This group is for the parents of one class. Ask the class teacher for your child's class group.")
    return jsonify(threadId=group["id"], classId=group["classId"], subject=group["subject"])