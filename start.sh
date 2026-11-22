#!/usr/bin/env bash
# Sets up and starts Mwangaza School Manager on macOS or Linux:  ./start.sh
set -e
cd "$(dirname "$0")/backend"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/python -m pip install -q -r requirements.txt
[ -f .env ] || cp .env.example .env
[ -f data/kengele.db ] || .venv/bin/python manage.py seed
.venv/bin/python run.py
