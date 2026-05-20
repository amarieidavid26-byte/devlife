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

echo "[setup] pyodide (Python in browser pentru butonul Run)..."
bash scripts/setup-pyodide.sh

if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "[setup] am creat .env din .env.example — completeaza CLAUDE_API_KEY (si flag-urile locale)."
fi

echo "[setup] gata. ruleaza ./scripts/dev.sh"
