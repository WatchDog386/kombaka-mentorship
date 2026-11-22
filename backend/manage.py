"""Database commands.

    python manage.py seed           load the demo school (keeps existing data if any)
    python manage.py seed --reset   wipe the database and load the demo school
    python manage.py init           create an empty database with one admin account
    python manage.py admin <username> <password>   create an admin or change its password
"""
import json
import sys
from pathlib import Path

from app import create_app
from app.accounts import create_admin, sync_accounts
from app.config import Config
from app.db import connect, init_schema
from app.repositories import MERGED, TABLES, messages

SEED_FILE = Path(__file__).parent / "seed" / "seed_data.json"
# Insert order matters: a learner needs their class, a class needs its teacher.
ORDER = ["config", "staff", "classes", "routes", "learners", "payments", "expenses", "notices", "events", "homework", "books", "applications", "remarks"]


def seed(reset: bool) -> None:
    if reset and Config.DATABASE.exists():
        Config.DATABASE.unlink()
    app = create_app()
    with app.app_context():
        db = connect(Config.DATABASE)
        init_schema(db)
        if db.execute("SELECT COUNT(*) FROM learners").fetchone()[0]:
            print("The database already has learners. Use --reset to start again.")
            return
        data = json.loads(SEED_FILE.read_text(encoding="utf-8"))
        for name in ORDER:
            for doc_id, doc in data.get(name, {}).items():
                TABLES[name].put(db, doc_id, doc)
        for name, repo in MERGED.items():
            for doc_id, doc in data.get(name, {}).items():
                repo.patch(db, doc_id, doc)
        for doc_id, doc in data.get("messages", {}).items():
            messages.create(db, doc_id, doc, doc["msgs"][0])
            for msg in doc["msgs"][1:]:
                messages.add_message(db, doc_id, msg)
        create_admin(db, "admin", "admin123")
        sync_accounts(db)
        db.commit()
        users = db.execute("SELECT role, COUNT(*) AS n FROM users GROUP BY role").fetchall()
        print("Demo school loaded:", ", ".join(f"{u['n']} {u['role']} accounts" for u in users))
        print("Sign in as admin / admin123. Teachers use their phone number with teacher123, parents with parent123.")


def init() -> None:
    app = create_app()
    with app.app_context():
        db = connect(Config.DATABASE)
        init_schema(db)
        create_admin(db, "admin", "admin123")
        db.commit()
        print("Empty database ready. Sign in as admin / admin123 and change the password.")


def admin(username: str, password: str) -> None:
    app = create_app()
    with app.app_context():
        db = connect(Config.DATABASE)
        create_admin(db, username, password)
        db.commit()
        print(f"Admin account '{username}' saved.")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["seed"]:
        seed(reset="--reset" in args)
    elif args[:1] == ["init"]:
        init()
    elif args[:1] == ["admin"] and len(args) == 3:
        admin(args[1], args[2])
    else:
        print(__doc__)
