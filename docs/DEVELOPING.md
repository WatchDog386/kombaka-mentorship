# Developing Mwangaza

## How a request flows

```
Browser (frontend/js)                      Server (backend/app)
─────────────────────                      ────────────────────
click "Save register"
  └─ views/attendance.js  A.saveAtt()
       └─ core/store.js   mergeDoc()  ──PATCH /api/attendance/<id>──▶ routes/data.py
            updates the screen at once                                  ├─ security.py     who is this? (token)
                                                                         ├─ permissions.py  may they do it?
                                                                         └─ repositories/   write the rows
            replaces its copy with the  ◀──────── saved record ─────────┘
            server's answer and redraws
```

The frontend keeps a copy of the records in memory (`core/store.js`). Views
never call the server themselves: they read with `all('learners')` and
`get('learners', id)`, and change things with `save()`, `mergeDoc()` and
`removeDoc()`. Every 30 seconds, and when the window regains focus, the store
fetches fresh records so two people working at once see each other's changes.

The server never trusts the browser. What a user receives is filtered in
`permissions.visible_data`, and every change passes a guard in the same file.

## Frontend

There is no framework and no build step. The browser loads `js/main.js` as a
JavaScript module and that imports the rest. Edit a file, refresh the page.

**Views.** Each screen is a function that returns HTML as a string and
registers itself: `V.learners = () => '...html...'`. `core/render.js` calls the
current view and puts the result on the page (`paint()`).

**Actions.** A button says what it does with `data-act`:

```html
<button data-act="learnerView" data-id="L1001">Open</button>
```

One click listener in `main.js` looks the name up in `A` and calls it with the
element's `data-` values: `A.learnerView({id: 'L1001'})`. Inputs work the same
way with `data-in` (while typing) and `data-ch` (on change).

**Forms.** `openForm({title, fields, values, onSave})` in `core/ui.js` builds a
modal form from a list of fields. `onSave` receives the values; return a string
to show an error, or `false` to keep the form open.

**Always escape.** Anything that came from a user goes through `esc()` before
it is put into HTML.

### Add a new screen: an example

Say you want a "Clubs" screen for the office.

1. Backend: add a table to `app/schema.sql`

   ```sql
   CREATE TABLE IF NOT EXISTS clubs (
     id      TEXT PRIMARY KEY,
     name    TEXT NOT NULL,
     patron  TEXT NOT NULL DEFAULT '',
     day     TEXT NOT NULL DEFAULT ''
   );
   ```

2. Backend: describe it in `app/repositories/__init__.py`

   ```python
   "clubs": Table("clubs", [F("name"), F("patron"), F("day")], order_by="name"),
   ```

   and add `"clubs"` to the `COLLECTIONS` list. Admins can now read and write
   it. If teachers or parents should see it, nothing more is needed; if they
   should not, empty it for them in `permissions.visible_data`.

3. Frontend: add `'clubs'` to `COLS` in `js/core/store.js`.

4. Frontend: create `js/views/clubs.js`

   ```js
   import { A, V } from '../core/registry.js';
   import { all, get, save } from '../core/store.js';
   import { empty, openForm, table, toast } from '../core/ui.js';
   import { esc, newId } from '../core/util.js';

   V.clubs = () => {
     const rows = all('clubs');
     const tools = `<div class="tools"><span class="grow"></span><button class="btn primary" data-act="clubForm">Add a club</button></div>`;
     if (!rows.length) return tools + empty('No clubs yet', 'Add the first club.');
     return tools + table(['Club', 'Patron', 'Day', ''], rows.map((c) =>
       `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.patron)}</td><td>${esc(c.day)}</td>
        <td class="act"><button class="btn sm" data-act="clubForm" data-id="${esc(c.id)}">Edit</button></td></tr>`));
   };

   function clubForm(c) {
     openForm({
       title: c ? 'Edit club' : 'Add a club',
       values: c || {},
       fields: [{ k: 'name', l: 'Club name', req: true }, { k: 'patron', l: 'Patron' }, { k: 'day', l: 'Meeting day' }],
       onSave: async (v) => {
         if (!(await save('clubs', { ...(c || {}), ...v, id: c ? c.id : newId('k') }))) return false;
         toast('Club saved');
       },
     });
   }

   Object.assign(A, { clubForm: (d) => clubForm(d.id ? get('clubs', d.id) : null) });
   ```

5. Frontend: import it in `js/main.js` (`import './views/clubs.js';`) and add
   `['clubs', 'Clubs']` to the admin menu in `NAV` in `js/core/render.js`.

6. Restart the server. New tables in `schema.sql` are created automatically at
   start. Existing tables are never altered, so to add a column to a table that
   already exists, either run an `ALTER TABLE` in a SQLite tool or reset with
   `python manage.py seed --reset`.

## Backend

- `routes/data.py` is one generic set of endpoints for all collections. Rules
  that belong to one collection (receipt numbers, phone clean-up) are in
  `_prepare`.
- `repositories/table.py` maps a JSON document to a table row. Each `F(...)`
  names the JSON field, the column and the kind: `text`, `int`, `num`, `bool`,
  `json`, or `ref` (an optional link to another row, stored as NULL when empty).
- Attendance, assessment and timetables are stored one row per mark
  (`attendance_marks`, `assessment_scores`, `timetable_slots`) so they are easy
  to query, and `repositories/registers.py` turns them into the one-document-
  per-class shape the frontend uses.
- `accounts.sync_accounts` runs after any staff or learner change and makes
  sure the right logins exist.

Useful queries to try in a SQLite tool:

```sql
-- Fee collected per class this term
SELECT c.name, SUM(p.amount) AS collected
FROM payments p JOIN learners l ON l.id = p.learner_id JOIN classes c ON c.id = l.class_id
WHERE p.year = 2026 AND p.term = 3 GROUP BY c.id ORDER BY c.sort_order;

-- Learners absent three or more days
SELECT l.name, COUNT(*) AS days_absent
FROM attendance_marks a JOIN learners l ON l.id = a.learner_id
WHERE a.status = 'A' GROUP BY l.id HAVING COUNT(*) >= 3;
```

## Tests

`python -m unittest -v` from `backend/` runs `tests/test_api.py` against a
temporary database. The tests cover sign-in, what each role can see, and what
each role is refused. Add a test whenever you add a permission rule.

## Serving the frontend separately

Flask serves the frontend, so one address does everything. If you prefer VS
Code Live Server for the frontend, set `API_BASE = 'http://localhost:5000'` in
`frontend/js/core/config.js` and make sure the Live Server address is listed in
`CORS_ORIGINS` in `backend/.env`.
