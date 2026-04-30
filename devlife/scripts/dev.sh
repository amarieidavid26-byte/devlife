#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

if [ ! -f "venv/bin/activate" ]; then
    echo "[dev] nu exista venv, ruleaza ./scripts/setup.sh mai intai"
    exit 1
fi
source venv/bin/activate

echo "[dev] pornesc frontend..."
cd frontend && npm run dev &
FRONTEND_PID=$!
cd ..

cleanup() {
    echo "[dev] opresc frontend..."
    kill $FRONTEND_PID 2>/dev/null
}
trap cleanup EXIT

echo "[dev] pornesc backend pe http://localhost:8000"
uvicorn server:app --reload --host 0.0.0.0 --port 8000
