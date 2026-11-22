"""A small mapper between API documents (camelCase JSON) and SQLite rows.

Each collection the frontend works with is described once as a Table: the
SQL table name and its fields. The Table then knows how to list, fetch,
save and delete documents, so the routes stay short.
"""
import json
from dataclasses import dataclass

from ..errors import ApiError


@dataclass(frozen=True)
class Field:
    api: str            # name in the JSON document, e.g. "guardianPhone"
    column: str         # name in the SQL table, e.g. "guardian_phone"
    kind: str = "text"  # text | int | num | bool | json | ref

    def to_db(self, value):
        try:
            if self.kind == "text":
                return "" if value is None else str(value).strip()
            if self.kind == "ref":          # optional link to another row
                return str(value) if value not in (None, "") else None
            if self.kind == "int":
                return int(value) if value not in (None, "") else None
            if self.kind == "num":
                return float(value) if value not in (None, "") else 0
            if self.kind == "bool":
                return 1 if value else 0
            if self.kind == "json":
                return json.dumps(value) if value is not None else None
        except (TypeError, ValueError):
            raise ApiError(f"'{self.api}' has an invalid value.")
        raise ValueError(f"Unknown field kind {self.kind}")

    def from_db(self, value):
        if self.kind == "ref":
            return value or ""
        if self.kind == "bool":
            return bool(value)
        if self.kind == "json":
            return json.loads(value) if value else None
        if self.kind == "num" and isinstance(value, float) and value.is_integer():
            return int(value)
        return value


def F(api: str, column: str | None = None, kind: str = "text") -> Field:
    return Field(api, column or api, kind)


class Table:
    def __init__(self, name: str, fields: list[Field], order_by: str = "id"):
        self.name = name
        self.fields = fields
        self.order_by = order_by

    def _doc(self, row) -> dict:
        doc = {"id": row["id"]}
        for f in self.fields:
            doc[f.api] = f.from_db(row[f.column])
        return doc

    def all(self, db, where: str = "", params: tuple = ()) -> list[dict]:
        sql = f"SELECT * FROM {self.name} {('WHERE ' + where) if where else ''} ORDER BY {self.order_by}"
        return [self._doc(r) for r in db.execute(sql, params)]

    def get(self, db, doc_id: str) -> dict | None:
        row = db.execute(f"SELECT * FROM {self.name} WHERE id = ?", (doc_id,)).fetchone()
        return self._doc(row) if row else None

    def put(self, db, doc_id: str, doc: dict) -> dict:
        """Create the document, or replace it if the id already exists."""
        columns = ["id"] + [f.column for f in self.fields]
        values = [doc_id] + [f.to_db(doc.get(f.api)) for f in self.fields]
        updates = ", ".join(f"{c} = excluded.{c}" for c in columns[1:])
        db.execute(
            f"INSERT INTO {self.name} ({', '.join(columns)}) VALUES ({', '.join('?' * len(columns))}) "
            f"ON CONFLICT(id) DO UPDATE SET {updates}",
            values,
        )
        return self.get(db, doc_id)

    def delete(self, db, doc_id: str) -> None:
        db.execute(f"DELETE FROM {self.name} WHERE id = ?", (doc_id,))
