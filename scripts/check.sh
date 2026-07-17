#!/usr/bin/env bash
# ruleaza toate verificarile intr-o singura comanda: teste, lint, paritate i18n, build
set -e
cd "$(dirname "$0")/.."

PY="python3"
if [ -x "venv/bin/python" ]; then
    PY="venv/bin/python"
fi

echo "[check] 1/4 pytest..."
"$PY" -m pytest tests/ -q

echo "[check] 2/4 ruff..."
"$PY" -m ruff check . --quiet
echo "ruff ok"

echo "[check] 3/4 paritate i18n en/ro..."
"$PY" - <<'EOF'
import json
with open("frontend/src/i18n/en.json") as f: en = json.load(f)
with open("frontend/src/i18n/ro.json") as f: ro = json.load(f)

def keys(d, prefix=""):
    out = set()
    for k, v in d.items():
        path = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out |= keys(v, path)
        else:
            out.add(path)
    return out

en_keys, ro_keys = keys(en), keys(ro)
missing_ro = en_keys - ro_keys
missing_en = ro_keys - en_keys
if missing_ro or missing_en:
    for k in sorted(missing_ro): print(f"  lipseste din ro: {k}")
    for k in sorted(missing_en): print(f"  lipseste din en: {k}")
    raise SystemExit(1)
print(f"i18n ok: {len(en_keys)} chei, paritate completa")
EOF

echo "[check] 4/5 teste BLE (node)..."
if command -v node >/dev/null 2>&1; then
    node frontend/test/ble-autoreconnect.test.mjs
else
    echo "  node lipseste -- sar peste testele BLE"
fi

echo "[check] 5/5 vite build..."
(cd frontend && npx vite build --logLevel error)

echo ""
echo "[check] totul verde ✓"
