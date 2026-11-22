-- Mwangaza School Manager: database schema (SQLite).
-- Run through `python manage.py init` or `python manage.py seed`.

PRAGMA foreign_keys = ON;

-- One row holding the school profile and its settings.
CREATE TABLE IF NOT EXISTS school (
  id          TEXT PRIMARY KEY CHECK (id = 'school'),
  name        TEXT NOT NULL DEFAULT '',
  motto       TEXT NOT NULL DEFAULT '',
  about       TEXT NOT NULL DEFAULT '',
  address     TEXT NOT NULL DEFAULT '',
  county      TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  paybill     TEXT NOT NULL DEFAULT '',
  year        INTEGER,
  term        INTEGER,
  next_opens  TEXT NOT NULL DEFAULT '',
  terms       TEXT,   -- JSON: {"1": {"s": "2026-01-05", "e": "2026-04-02"}, ...}
  bands       TEXT,   -- JSON: lowest mark for each grade {"ee1": 95, "ee2": 90, ..., "be2": 1}
  areas       TEXT,   -- JSON: learning areas per level
  fees        TEXT    -- JSON: fee structure per level
);

CREATE TABLE IF NOT EXISTS staff (
  id        TEXT PRIMARY KEY,
  staff_no  TEXT NOT NULL DEFAULT '',
  name      TEXT NOT NULL,
  role      TEXT NOT NULL DEFAULT '',
  gender    TEXT NOT NULL DEFAULT '',
  areas     TEXT NOT NULL DEFAULT '',
  tsc       TEXT NOT NULL DEFAULT '',
  phone     TEXT NOT NULL DEFAULT '',
  email     TEXT NOT NULL DEFAULT '',
  status    TEXT NOT NULL DEFAULT 'Active',
  joined    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS classes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  level       TEXT NOT NULL CHECK (level IN ('pp', 'lower', 'upper', 'junior')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  teacher_id  TEXT REFERENCES staff(id) ON DELETE SET NULL,
  room        TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS routes (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  vehicle  TEXT NOT NULL DEFAULT '',
  driver   TEXT NOT NULL DEFAULT '',
  fee      REAL NOT NULL DEFAULT 0,
  pickup   TEXT NOT NULL DEFAULT '',
  stops    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS learners (
  id                 TEXT PRIMARY KEY,
  adm_no             TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  gender             TEXT NOT NULL DEFAULT '',
  dob                TEXT NOT NULL DEFAULT '',
  class_id           TEXT REFERENCES classes(id) ON DELETE RESTRICT,
  upi                TEXT NOT NULL DEFAULT '',
  guardian_name      TEXT NOT NULL DEFAULT '',
  guardian_phone     TEXT NOT NULL DEFAULT '',
  guardian_relation  TEXT NOT NULL DEFAULT '',
  route_id           TEXT REFERENCES routes(id) ON DELETE SET NULL,
  lunch              INTEGER NOT NULL DEFAULT 1,
  medical            TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'Active',
  joined             TEXT NOT NULL DEFAULT '',
  bf                 REAL NOT NULL DEFAULT 0      -- fee balance brought forward
);
CREATE INDEX IF NOT EXISTS idx_learners_class ON learners(class_id);
CREATE INDEX IF NOT EXISTS idx_learners_guardian ON learners(guardian_phone);

CREATE TABLE IF NOT EXISTS payments (
  id           TEXT PRIMARY KEY,
  receipt_no   TEXT NOT NULL UNIQUE,
  learner_id   TEXT NOT NULL REFERENCES learners(id) ON DELETE RESTRICT,
  amount       REAL NOT NULL CHECK (amount > 0),
  method       TEXT NOT NULL DEFAULT '',
  ref          TEXT NOT NULL DEFAULT '',
  date         TEXT NOT NULL,
  term         INTEGER NOT NULL,
  year         INTEGER NOT NULL,
  note         TEXT NOT NULL DEFAULT '',
  recorded_by  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_payments_learner ON payments(learner_id);

CREATE TABLE IF NOT EXISTS expenses (
  id        TEXT PRIMARY KEY,
  date      TEXT NOT NULL,
  category  TEXT NOT NULL DEFAULT '',
  payee     TEXT NOT NULL DEFAULT '',
  amount    REAL NOT NULL DEFAULT 0,
  method    TEXT NOT NULL DEFAULT '',
  ref       TEXT NOT NULL DEFAULT '',
  note      TEXT NOT NULL DEFAULT '',
  term      INTEGER,
  year      INTEGER
);

CREATE TABLE IF NOT EXISTS notices (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  audience   TEXT NOT NULL DEFAULT 'All',  -- 'All', 'Parents', 'Teachers' or a class id
  date       TEXT NOT NULL DEFAULT '',
  posted_by  TEXT NOT NULL DEFAULT '',
  pinned     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id        TEXT PRIMARY KEY,
  date      TEXT NOT NULL,
  end_date  TEXT NOT NULL DEFAULT '',
  title     TEXT NOT NULL,
  type      TEXT NOT NULL DEFAULT '',
  note      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS homework (
  id        TEXT PRIMARY KEY,
  class_id  TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  area      TEXT NOT NULL DEFAULT '',
  title     TEXT NOT NULL,
  details   TEXT NOT NULL DEFAULT '',
  due       TEXT NOT NULL DEFAULT '',
  date      TEXT NOT NULL DEFAULT '',
  set_by    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS books (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  author    TEXT NOT NULL DEFAULT '',
  category  TEXT NOT NULL DEFAULT '',
  copies    INTEGER NOT NULL DEFAULT 1,
  shelf     TEXT NOT NULL DEFAULT '',
  loans     TEXT    -- JSON list: [{"learnerId": "L1001", "date": "2026-10-02"}]
);

-- Teaching material: modules, notes, past papers and worksheets, filed under a class and a
-- learning area. The bytes live on disk under data/uploads; this row is the label on the
-- envelope. `stored_name` is generated by the server and is the only name ever used to read
-- the file back, so whatever a browser sends cannot steer a path.
CREATE TABLE IF NOT EXISTS resources (
  id          TEXT PRIMARY KEY,
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  area        TEXT NOT NULL DEFAULT '',
  title       TEXT NOT NULL,
  file_name   TEXT NOT NULL DEFAULT '',   -- the name it had on the uploader's computer
  stored_name TEXT NOT NULL DEFAULT '',   -- what it is called on disk
  kind        TEXT NOT NULL DEFAULT '',   -- a short type label: pdf, word, sheet, image, text
  size        INTEGER NOT NULL DEFAULT 0,
  by          TEXT NOT NULL DEFAULT '',
  date        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_resources_class ON resources(class_id);

CREATE TABLE IF NOT EXISTS applications (
  id        TEXT PRIMARY KEY,
  child     TEXT NOT NULL,
  class_id  TEXT NOT NULL DEFAULT '',
  parent    TEXT NOT NULL DEFAULT '',
  phone     TEXT NOT NULL DEFAULT '',
  message   TEXT NOT NULL DEFAULT '',
  status    TEXT NOT NULL DEFAULT 'New',
  date      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS remarks (
  id          TEXT PRIMARY KEY,           -- "<learner id>_<year>_T<term>"
  learner_id  TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  year        INTEGER NOT NULL,
  term        INTEGER NOT NULL,
  teacher     TEXT NOT NULL DEFAULT '',
  head        TEXT NOT NULL DEFAULT ''
);

-- One row per learner per school day.
CREATE TABLE IF NOT EXISTS attendance_marks (
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  year        INTEGER NOT NULL,
  term        INTEGER NOT NULL,
  date        TEXT NOT NULL,
  learner_id  TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('P', 'L', 'A')),  -- present, late, absent
  PRIMARY KEY (class_id, date, learner_id)
);

-- One row per learner per learning area per term.
-- score holds marks out of 100, or a rubric level (EE, ME, AE, BE) for pre-primary.
CREATE TABLE IF NOT EXISTS assessment_scores (
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  year        INTEGER NOT NULL,
  term        INTEGER NOT NULL,
  area_key    TEXT NOT NULL,
  learner_id  TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  score       TEXT NOT NULL,
  PRIMARY KEY (class_id, year, term, area_key, learner_id)
);

CREATE TABLE IF NOT EXISTS timetable_slots (
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  day         TEXT NOT NULL CHECK (day IN ('Mon', 'Tue', 'Wed', 'Thu', 'Fri')),
  period      INTEGER NOT NULL,
  area        TEXT NOT NULL,
  teacher_id  TEXT REFERENCES staff(id) ON DELETE SET NULL,
  PRIMARY KEY (class_id, day, period)
);

-- Parent and school conversations.
-- `kind` is 'direct' (one parent and one member of staff) or 'class' (a group for a whole
-- class). A class group has no single parent phone, so that column is left empty and the
-- people in it are listed in thread_members. `join_token` is the unguessable half of the
-- invite link; empty means the link has been switched off.
CREATE TABLE IF NOT EXISTS threads (
  id            TEXT PRIMARY KEY,
  learner_id    TEXT REFERENCES learners(id) ON DELETE CASCADE,
  parent_phone  TEXT NOT NULL,
  parent_name   TEXT NOT NULL DEFAULT '',
  to_staff      TEXT NOT NULL,             -- a staff id, or 'office'
  subject       TEXT NOT NULL DEFAULT '',
  updated       TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'direct',
  class_id      TEXT,
  join_token    TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS thread_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id  TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  who        TEXT NOT NULL CHECK (who IN ('parent', 'staff')),
  name       TEXT NOT NULL DEFAULT '',
  text       TEXT NOT NULL,
  at         TEXT NOT NULL
);

-- Who is in a class group. `login` is the same value the person signs in with, so a group
-- can be checked against the person in front of it.
CREATE TABLE IF NOT EXISTS thread_members (
  thread_id  TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  login      TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'parent' CHECK (role IN ('parent', 'staff')),
  joined     TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (thread_id, login)
);
CREATE INDEX IF NOT EXISTS idx_thread_members_login ON thread_members(login);

-- Login accounts. Admins sign in with a username, teachers with their staff
-- phone number, parents with the guardian phone number on the learner record.
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  role           TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'parent')),
  login          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL DEFAULT '',
  password_hash  TEXT NOT NULL,
  staff_id       TEXT REFERENCES staff(id) ON DELETE CASCADE,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  photo          TEXT NOT NULL DEFAULT '',  -- the profile picture, a small JPEG as a data: URL
  photo_at       TEXT NOT NULL DEFAULT ''   -- when it last changed, so a browser knows to fetch it again
);
