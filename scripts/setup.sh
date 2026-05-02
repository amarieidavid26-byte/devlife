#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

echo "[setup] python venv..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt -q

echo "[setup] frontend deps..."
cd frontend && npm install --silent && cd ..

echo "[setup] gata. ruleaza ./scripts/dev.sh"
