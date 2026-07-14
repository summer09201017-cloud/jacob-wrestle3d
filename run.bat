@echo off
REM judo3d playtest. English-only, CRLF.
cd /d "%~dp0"
echo Starting Judo 3D ...
if not exist "node_modules" call npm install
call npm run dev -- --open
pause
