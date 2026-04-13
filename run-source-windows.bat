@echo off
REM run-source-windows.bat — Run grok-video-api from source (Windows)

cd /d "%~dp0"

REM Load .env if present
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    if not "%%a"=="" if not "%%a:~0,1%"=="#" set "%%a=%%b"
  )
)

REM Install deps if missing
if not exist "node_modules" (
  echo [grok-video-api] Installing dependencies...
  npm install
)

echo [grok-video-api] Starting from source...
npx tsx src\cli.ts %*
