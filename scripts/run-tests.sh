#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
fi

pip install pytest pytest-asyncio pytest-cov httpx slowapi -q

mkdir -p evidence/tests

python3 -m pytest tests/ \
    --junitxml=evidence/tests/junit.xml \
    --cov=server --cov=biometric_engine --cov=ghost_brain \
    --cov=content_analyzer --cov=fallback_responses \
    --cov=apply_fix --cov=persistence \
    --cov-report=html:evidence/tests/coverage \
    --cov-report=term-missing \
    -v

echo ""
echo "rezultate in evidence/tests/"
