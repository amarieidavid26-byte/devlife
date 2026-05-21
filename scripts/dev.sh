#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

if [ ! -f "venv/bin/activate" ]; then
    echo "[dev] nu exista venv, ruleaza ./scripts/setup.sh mai intai"
    exit 1
fi
source venv/bin/activate

echo "[dev] pornesc frontend..."
# subshell explicit — `cd dir && cmd &` punea cd-ul tot in background,
# deci `cd ..` urmator naviga gresit fata de starea reala a shell-ului parinte
(cd frontend && npm run dev) &
FRONTEND_PID=$!

cleanup() {
    echo "[dev] opresc frontend..."
    kill $FRONTEND_PID 2>/dev/null
}
trap cleanup EXIT

echo "[dev] pornesc backend pe http://localhost:8000"
# --reload-include "*.py": altfel watchfiles vede SQLite update-uind devlife.db si
# intra in bucla infinita de reload (sesiune noua -> modifica db -> reload -> ...)
uvicorn server:app --reload --reload-include "*.py" --host 0.0.0.0 --port 8000
