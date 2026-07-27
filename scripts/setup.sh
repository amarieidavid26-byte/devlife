#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

# backend-ul cere Python >= 3.10 (sintaxa de tipuri X | Y); tinta e 3.11 (runtime.txt)
find_python() {
    for cand in python3.12 python3.11 python3.10 python3; do
        if command -v "$cand" >/dev/null 2>&1 \
           && "$cand" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
            echo "$cand"
            return 0
        fi
    done
    return 1
}

echo "[setup] python venv..."
if ! PY="$(find_python)"; then
    echo "[setup] EROARE: nu am gasit Python >= 3.10 (python3 de aici e $(python3 -V 2>&1))."
    echo "[setup] instaleaza Python 3.11 (macOS: brew install python@3.11) si ruleaza din nou."
    exit 1
fi

if [ -d venv ] && ! venv/bin/python -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
    echo "[setup] venv existent, dar facut cu un Python prea vechi; il refac cu $PY..."
    rm -rf venv
fi
if [ ! -d "venv" ]; then
    "$PY" -m venv venv
fi
venv/bin/python -m pip install -r requirements.txt -q

echo "[setup] frontend deps..."
cd frontend && npm install --silent && cd ..

echo "[setup] pyodide (Python in browser pentru butonul Run)..."
bash scripts/setup-pyodide.sh

if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "[setup] am creat .env din .env.example — completeaza CLAUDE_API_KEY (si flag-urile locale)."
fi

echo "[setup] gata. ruleaza ./scripts/dev.sh"
