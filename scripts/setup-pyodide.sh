#!/usr/bin/env bash
# descarca pyodide pentru rularea Python in browser, in frontend/public/lib/pyodide/
set -e
cd "$(dirname "$0")/.."

PYODIDE_VERSION="0.26.4"
TARGET_DIR="frontend/public/lib/pyodide"
TARBALL="pyodide-${PYODIDE_VERSION}.tar.bz2"
URL="https://github.com/pyodide/pyodide/releases/download/${PYODIDE_VERSION}/${TARBALL}"

if [ -f "${TARGET_DIR}/pyodide.js" ]; then
    echo "[setup-pyodide] deja instalat la ${TARGET_DIR}, sar peste"
    exit 0
fi

mkdir -p "$(dirname "${TARGET_DIR}")"
TMP=$(mktemp -d)
trap 'rm -rf "${TMP}"' EXIT

echo "[setup-pyodide] descarc ${URL} (~284MB)..."
curl -fL --progress-bar -o "${TMP}/${TARBALL}" "${URL}"

echo "[setup-pyodide] dezarhivez..."
tar -xjf "${TMP}/${TARBALL}" -C "${TMP}"

mkdir -p "${TARGET_DIR}"
mv "${TMP}/pyodide/"* "${TARGET_DIR}/"

echo "[setup-pyodide] gata. Fisiere principale:"
ls -1 "${TARGET_DIR}/" | grep -E '\.(js|wasm|data)$' | head -8
