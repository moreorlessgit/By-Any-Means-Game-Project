@echo off
REM ============================================================
REM  By Any Means - one-click dev launcher
REM  Starts the backend in its own window. Use VSCode's "Go Live"
REM  to serve the frontend on port 5500.
REM ============================================================

setlocal
set "PROJECT_ROOT=%~dp0"

echo.
echo === By Any Means launcher ===
echo Project: %PROJECT_ROOT%
echo.

REM --- Backend (Node + Prisma) in its own terminal window --------
echo Starting backend on http://localhost:3001 ...
start "BAM Backend" cmd /k "cd /d ""%PROJECT_ROOT%server"" && npm run dev"

echo.
echo === Next steps ===
echo   1. In VSCode, click "Go Live" in the status bar
echo      (or right-click index.html ^> "Open with Live Server").
echo   2. Browser opens to http://127.0.0.1:5500/index.html
echo   3. Log in and play.
echo.
echo To stop: close the "BAM Backend" window (or Ctrl+C in it) and
echo click "Port: 5500" in the VSCode status bar to stop Live Server.
echo Postgres can keep running.
echo.
echo This window can be closed.
pause
endlocal
