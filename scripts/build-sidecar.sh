#!/usr/bin/env bash
# Build the PyInstaller-bundled setsweep sidecar and copy it into resources/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETSWEEP_SRC="${SETSWEEP_SRC:-$HOME/Seafile/Code/active/setsweep}"
SETSWEEP_VENV="${SETSWEEP_VENV:-$HOME/.setsweep-venv}"

if [[ ! -d "$SETSWEEP_SRC" ]]; then
  echo "error: setsweep source not found at $SETSWEEP_SRC" >&2
  echo "Set SETSWEEP_SRC to the setsweep repo and retry." >&2
  exit 1
fi

if [[ ! -x "$SETSWEEP_VENV/bin/python" ]]; then
  echo "error: venv not found at $SETSWEEP_VENV" >&2
  echo "Create one with: python3 -m venv $SETSWEEP_VENV && $SETSWEEP_VENV/bin/pip install -e $SETSWEEP_SRC" >&2
  exit 1
fi

echo "[build-sidecar] setsweep source: $SETSWEEP_SRC"
echo "[build-sidecar] venv: $SETSWEEP_VENV"

"$SETSWEEP_VENV/bin/pip" install -q -e "$SETSWEEP_SRC"
"$SETSWEEP_VENV/bin/pip" install -q pyinstaller

export SETSWEEP_SRC
cd "$ROOT"
"$SETSWEEP_VENV/bin/pyinstaller" --noconfirm --clean setsweep-sidecar.spec

mkdir -p "$ROOT/resources"
rm -rf "$ROOT/resources/setsweep-sidecar"
cp -R "$ROOT/dist/setsweep-sidecar" "$ROOT/resources/setsweep-sidecar"

SETSWEEP_VER="$("$SETSWEEP_VENV/bin/python" -c "import importlib.metadata as m; print(m.version('setsweep'))")"
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
