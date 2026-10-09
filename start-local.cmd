@echo off
rem PrintCopilot on this machine: database, API and website. Nothing here touches production.
rem Double-click to start. To stop:  start-local.cmd stop
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0local.ps1" %*
echo.
pause
