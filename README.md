# Mwangaza School Manager

*Mwangaza* is Swahili for light, like the gold arc rising behind the book in the logo.

A school management system for a Kenyan school running PP1 to Grade 9 under the
Competency Based Curriculum. One system, three portals:

- **School office (admin):** admissions and applications, staff, classes, attendance,
  assessment, report cards, fees and receipts, expenses, timetable, homework, notices,
  calendar, messages and class group chats, transport, library and settings.
- **Teacher:** class register, assessment entry, report card remarks, homework,
  timetable, notices, parent messages and a group chat for your class.
- **Parent:** each child's progress report, attendance, fee statement with M-Pesa
  Pay Bill steps, homework, timetable, notices, messages to the school, and your
  child's class group.

There is also a public school home page with an online admission form.

| Part     | Technology                                              | Folder      |
| -------- | ------------------------------------------------------- | ----------- |
| Backend  | Python, Flask, SQLite, JWT logins                       | `backend/`  |
| Frontend | HTML, CSS and JavaScript modules (no build step needed) | `frontend/` |

## Quick start

You need **Python 3.10 or newer**. Nothing else: the database is SQLite, which
comes with Python, and the frontend needs no Node.js.

### Windows, the short way

Double-click `start.bat` (or run it from CMD or PowerShell). The first run
creates a Python environment, installs the packages, loads a demo school and
starts the server. Then open <http://localhost:5000>.

### By hand (CMD or PowerShell)

```
cd backend
py -3 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python manage.py seed
python run.py
```

If PowerShell refuses to run the activate script, use CMD instead, or skip
activation and call `.venv\Scripts\python.exe` directly in place of `python`.

On macOS or Linux run `./start.sh`, or use the same steps with
`python3 -m venv .venv` and `source .venv/bin/activate`.

### In VS Code

1. Open this folder (**File > Open Folder**) and install the recommended extensions when asked.
2. **Terminal > Run Task** and run tasks 1, 2 and 3 in order, or
3. after task 1 and 2, press **F5** to start the server under the debugger, so breakpoints in the Python code work.

## Demo accounts

`python manage.py seed` loads a made-up school, Kombaka Mentorship School, with
44 learners, 16 staff and a term of records.

| Portal        | Sign in with                                   | Password     |
| ------------- | ---------------------------------------------- | ------------ |
| School office | `admin`                                        | `admin123`   |
| Teacher       | `0700555901` (Peter Omondi, Grade 9)           | `teacher123` |
| Parent        | `0700555001` (Alice Ndanu, three children)     | `parent123`  |

Every teacher signs in with the phone number on their staff record, and every
parent with the guardian phone number on the learner record. The system creates
these accounts automatically when the office adds a teacher or admits a learner.
The office can reset a password from the staff form or the learner's record, and
anyone can change their own from the menu.

## Project structure

```
kengele-school-manager/
├── start.bat / start.sh        one-step setup and run
├── backend/
│   ├── run.py                  starts the server
│   ├── manage.py               database commands: seed, init, admin
│   ├── requirements.txt
│   ├── .env.example            settings (copy to .env)
│   ├── app/
│   │   ├── __init__.py         creates the Flask app, serves the frontend
│   │   ├── config.py           reads settings from .env
│   │   ├── schema.sql          every database table
│   │   ├── db.py               database connection
│   │   ├── security.py         password hashing, login tokens, route guards
│   │   ├── permissions.py      who may see and change what
│   │   ├── accounts.py         creates teacher and parent logins
│   │   ├── errors.py
│   │   ├── repositories/       reading and writing records
│   │   │   ├── table.py        generic mapper: JSON document <-> table row
│   │   │   ├── registers.py    attendance, assessment, timetable, messages
│   │   │   └── __init__.py     the list of collections and their fields
│   │   └── routes/
│   │       ├── auth.py         /api/auth/...   sign in, passwords
│   │       ├── public.py       /api/public     home page, applications
│   │       ├── groups.py       /api/groups     class group chats and their join links
│   │       └── data.py         /api/<collection>  the school records
│   ├── seed/seed_data.json     the demo school
│   ├── tests/test_api.py       automated API tests
│   └── data/                   the SQLite database file is created here
├── frontend/
│   ├── index.html
│   ├── css/                    base, components, layout, home, signin
│   └── js/
│       ├── main.js             entry point
│       ├── core/               shared code
│       │   ├── config.js       API address, refresh interval
│       │   ├── api.js          calls the backend
│       │   ├── store.js        records held in memory, save/delete
│       │   ├── state.js        who is signed in, what the screen shows
│       │   ├── school.js       grading, fees and attendance rules
│       │   ├── render.js       menus per role, page shell, navigation
│       │   ├── registry.js     where views and actions register
│       │   └── ui.js, widgets.js, util.js, icons.js
│       └── views/              one file per screen (learners.js, fees.js ...)
└── docs/
    ├── API.md                  every endpoint, with examples
    └── DEVELOPING.md           how the code works and how to extend it
```

## Useful commands

Run these from the `backend` folder with the environment activated.

| Command                                 | What it does                                   |
| --------------------------------------- | ---------------------------------------------- |
| `python run.py`                         | Start the server at <http://localhost:5000>    |
| `python manage.py seed --reset`         | Wipe the database and reload the demo school   |
| `python manage.py init`                 | Create an empty database with one admin login  |
| `python manage.py admin <name> <pass>`  | Create an admin or change an admin password    |
| `python -m unittest -v`                 | Run the API tests                              |

To open the database, install the "SQLite Viewer" extension and click
`backend/data/kengele.db`.

## Before using it in a real school

This is a working system for development and demonstration. Before real learner
data goes in:

1. Set a long random `SECRET_KEY` in `backend/.env`, and set `SHOW_DEMO_ACCOUNTS=0`.
2. Change the admin password and the default teacher and parent passwords.
3. Run it behind HTTPS with a production server (for example `waitress` on Windows
   or `gunicorn` on Linux) instead of `python run.py`.
4. Back up `backend/data/kengele.db` regularly. For many users at once, move to
   PostgreSQL or MySQL.
5. Check the learning areas, grade cut-offs, term dates and fee structure in
   Settings against your school and the current Ministry of Education guidance.

Known limits: M-Pesa payments are typed in by the office (there is no Daraja
integration yet), there is no SMS sending, screens refresh every 30 seconds
rather than instantly, and one phone number can hold only one account, so a
teacher who is also a parent needs two numbers.

## Ideas for what to build next

- M-Pesa Daraja C2B so Pay Bill payments post themselves
- SMS or WhatsApp notices to parents
- Learner photos and document uploads
- PDF report cards and class mark sheets
- Opener, mid-term and end-term assessments instead of one result per term
- A log of who changed what
