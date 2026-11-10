@echo off
rem Theatre: starts the local server and opens the DM panel.
cd /d "%~dp0"
if not exist campaigns.json (
  echo No campaigns.json yet: copy campaigns.example.json to campaigns.json and fill in your vault. See README.md.
  pause
  exit /b
)
start "Theatre server (close to stop)" python server.py
timeout /t 2 /nobreak >nul
start "" "http://localhost:8765/control"
