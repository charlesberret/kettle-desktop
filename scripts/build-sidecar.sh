#!/usr/bin/env bash
# Build the PyInstaller-bundled setsweep sidecar and copy it into resources/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETSWEEP_SRC="${SETSWEEP_SRC:-$HOME/Seafile/Code/active/setsweep}"

if [[ ! -d "$SETSWEEP_SRC" ]]; then
  echo "error: setsweep source not found at $SETSWEEP_SRC" >&2
  echo "Set SETSWEEP_SRC to the setsweep repo and retry." >&2
  exit 1
fi

if [[ -n "${SETSWEEP_VENV:-}" && -x "$SETSWEEP_VENV/bin/python" ]]; then
  VENV="$SETSWEEP_VENV"
elif [[ -x "${HOME}/.setsweep-venv/bin/python" ]]; then
  VENV="${HOME}/.setsweep-venv"
else
  VENV="$ROOT/.build-venv"
fi

if [[ ! -x "$VENV/bin/python" ]]; then
  echo "[build-sidecar] creating venv at $VENV"
  python3 -m venv "$VENV"
fi

PYTHON="$VENV/bin/python"

echo "[build-sidecar] setsweep source: $SETSWEEP_SRC"
echo "[build-sidecar] venv: $VENV"

"$PYTHON" -m pip install -q -e "$SETSWEEP_SRC"
"$PYTHON" -m pip install -q pyinstaller

export SETSWEEP_SRC
cd "$ROOT"
"$PYTHON" -m PyInstaller --noconfirm --clean setsweep-sidecar.spec

mkdir -p "$ROOT/resources"
rm -rf "$ROOT/resources/setsweep-sidecar"
cp -R "$ROOT/dist/setsweep-sidecar" "$ROOT/resources/setsweep-sidecar"

SETSWEEP_VER="$("$PYTHON" -c "import importlib.metadata as m; print(m.version('setsweep'))")"
SHELL_VER="$(node -p "require('$ROOT/package.json').version")"
BUILT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat > "$ROOT/resources/version.json" <<EOF
{
  "shell": "$SHELL_VER",
  "setsweep": "$SETSWEEP_VER",
  "built": "$BUILT"
}
EOF

echo "[build-sidecar] → resources/setsweep-sidecar/ (setsweep $SETSWEEP_VER, shell $SHELL_VER)"
