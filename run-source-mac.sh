#!/usr/bin/env bash
# run-source-mac.sh — Run grok-video-api from source (macOS)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check for .env and load it
if [ -f ".env" ]; then
  # Safe .env loader: handles spaces in values, skips comments and blanks
  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    declare -x "$line"
  done < .env
fi

# Ensure deps are installed
if [ ! -d "node_modules" ]; then
  echo "[grok-video-api] Installing dependencies..."
  npm install
fi

# Run from source via tsx
echo "[grok-video-api] Starting from source..."
npx tsx src/cli.ts "$@"
