@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Please run the setup commands from README.md first.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m backend.app
pause
