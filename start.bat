@echo off
rem Sets up and starts Mwangaza School Manager on Windows.
rem Double-click this file, or run it from CMD or PowerShell.
cd /d "%~dp0backend"

if not exist .venv (
  echo Creating the Python environment...
  py -3 -m venv .venv 2>nul || python -m venv .venv
)
if not exist .venv\Scripts\python.exe (
  echo Python 3.10 or newer is needed. Install it from https://www.python.org/downloads/ and tick "Add Python to PATH".
  pause
  exit /b 1
)

echo Installing packages...
.venv\Scripts\python.exe -m pip install -q -r requirements.txt
if errorlevel 1 (
  echo Could not install the packages. Check your internet connection.
  pause
  exit /b 1
)

if not exist .env copy .env.example .env >nul
if not exist data\kengele.db .venv\Scripts\python.exe manage.py seed

.venv\Scripts\python.exe run.py
pause
