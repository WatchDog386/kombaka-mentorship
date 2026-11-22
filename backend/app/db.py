"""SQLite connection handling. One connection per request, stored on flask.g."""
import re
import sqlite3
from pathlib import Path

from flask import current_app, g

SCHEMA_FILE = Path(__file__).with_name("schema.sql")

# Words that open a table constraint rather than a column definition.
CONSTRAINTS = {"PRIMARY", "UNIQUE", "CHECK", "FOREIGN", "CONSTRAINT"}


def connect(path) -> sqlite3.Connection:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect(current_app.config["DATABASE"])
    return g.db


def close_db(_error=None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def _declared_columns(script: str) -> dict[str, list[str]]:
    """The columns each CREATE TABLE in the schema file declares."""
    tables: dict[str, list[str]] = {}
    for name, body in re.findall(r"CREATE TABLE IF NOT EXISTS (\w+) \((.*?)\n\);", script, re.S):
        columns = []
        for line in body.splitlines():
            definition = line.split("--")[0].strip().rstrip(",").strip()
            if definition and definition.split()[0].upper() not in CONSTRAINTS:
                columns.append(definition.split()[0])
        tables[name] = columns
    return tables


def add_missing_columns(conn: sqlite3.Connection) -> None:
    """Add columns the schema file has but an older database file does not.

    CREATE TABLE IF NOT EXISTS leaves a table that already exists untouched, so a
    database created before a column was added never picks that column up and every
    read of it fails. Adding the column keeps such a database usable; the old rows
    simply read as empty.
    """
    for table, columns in _declared_columns(SCHEMA_FILE.read_text(encoding="utf-8")).items():
        live = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
        if not live:
            continue
        for column in columns:
            if column not in live:
                conn.execute(f'ALTER TABLE {table} ADD COLUMN "{column}" TEXT')


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_FILE.read_text(encoding="utf-8"))
    add_missing_columns(conn)
    conn.commit()
