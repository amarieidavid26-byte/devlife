#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

PY="python3"
if [ -x "venv/bin/python" ]; then
    PY="venv/bin/python"
fi

"$PY" -m pip install pytest pytest-asyncio pytest-cov httpx slowapi -q

mkdir -p evidence/tests

"$PY" -m pytest tests/ \
    --junitxml=evidence/tests/junit.xml \
    --cov=server --cov=runtime --cov=loops --cov=ws_game \
    --cov=biometric_engine --cov=keystroke_dynamics --cov=ghost_brain \
    --cov=content_analyzer --cov=fallback_responses \
    --cov=terminal_pty --cov=context_history --cov=security \
    --cov=apply_fix --cov=persistence \
    --cov-report=html:evidence/tests/coverage \
    --cov-report=term-missing \
    -v

echo ""
echo "rezultate in evidence/tests/"
