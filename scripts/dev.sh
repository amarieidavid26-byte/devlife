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
# --host: loopback, ca in config.HOST. Cu 0.0.0.0 terminalul, scrierile pe disc si LSP-ul
# erau expuse in tot LAN-ul: /api/session da tokenul oricui il cere direct (CORS opreste
# doar browserele, nu curl), iar verificarea de Origin lasa sa treaca clientii fara Origin
"$PY" -m uvicorn server:app --reload --reload-include "*.py" --host 127.0.0.1 --port 8000
