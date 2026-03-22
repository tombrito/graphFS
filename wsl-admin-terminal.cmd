@echo off
setlocal

REM Relaunch elevated when needed (shows UAC prompt).
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

REM Resolve the folder where this .cmd is located and convert to WSL path.
set "WIN_DIR=%~dp0"
set "WIN_DIR=%WIN_DIR:~0,-1%"
for /f "delims=" %%I in ('wsl.exe wslpath -a "%WIN_DIR%"') do set "WSL_DIR=%%I"

if not defined WSL_DIR (
  echo Nao foi possivel converter caminho para WSL: %WIN_DIR%
  pause
  exit /b 1
)

REM Set the Windows console title before starting WSL.
title Orchestrator

REM Open WSL already in the same folder and set the shell/tmux title too.
wsl.exe --cd "%WSL_DIR%" bash -lc "printf '\033]0;Orchestrator\007'; tmux rename-window Orchestrator >/dev/null 2>&1 || true; exec bash -l"
