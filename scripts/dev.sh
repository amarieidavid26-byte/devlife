#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

if [ ! -x "venv/bin/python" ]; then
    echo "[dev] nu exista venv, ruleaza ./scripts/setup.sh mai intai"
    exit 1
fi
# ca in check.sh: venv/bin/python e binar, deci merge oriunde, pe cand scripturile
# din venv/bin (uvicorn) au shebang absolut si mor daca folderul a fost mutat
PY="venv/bin/python"

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
"$PY" -m uvicorn server:app --reload --reload-include "*.py" --host 0.0.0.0 --port 8000
