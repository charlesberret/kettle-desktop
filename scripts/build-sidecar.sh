#!/usr/bin/env bash
# Build the PyInstaller-bundled setsweep sidecar and copy it into resources/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETSWEEP_SRC="${SETSWEEP_SRC:-$HOME/Repos/setsweep-core}"

if [[ ! -d "$SETSWEEP_SRC" ]]; then
  echo "error: setsweep-core source not found at $SETSWEEP_SRC" >&2
  echo "Set SETSWEEP_SRC to the setsweep-core repo and retry." >&2
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
PYTHON_VER="$("$PYTHON" -c "import platform; print(platform.python_version())")"

SETSWEEP_COMMIT="unknown"
SETSWEEP_DIRTY="unknown"
if git -C "$SETSWEEP_SRC" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  SETSWEEP_COMMIT="$(git -C "$SETSWEEP_SRC" rev-parse --short=12 HEAD)"
  if [[ -n "$(git -C "$SETSWEEP_SRC" status --porcelain)" ]]; then
    SETSWEEP_DIRTY="true"
  else
    SETSWEEP_DIRTY="false"
  fi
fi

export BUILT PYTHON_VER ROOT SETSWEEP_COMMIT SETSWEEP_DIRTY SETSWEEP_SRC SETSWEEP_VER SHELL_VER
"$PYTHON" - <<'PY'
import json
import os
from pathlib import Path

dirty = os.environ["SETSWEEP_DIRTY"]
payload = {
    "shell": os.environ["SHELL_VER"],
    "setsweep": os.environ["SETSWEEP_VER"],
    "built": os.environ["BUILT"],
    "python": os.environ["PYTHON_VER"],
    "setsweepSource": os.environ["SETSWEEP_SRC"],
    "setsweepCommit": os.environ["SETSWEEP_COMMIT"],
    "setsweepDirty": None if dirty == "unknown" else dirty == "true",
}

(Path(os.environ["ROOT"]) / "resources" / "version.json").write_text(
    f"{json.dumps(payload, indent=2)}\n"
)
PY

echo "[build-sidecar] → resources/setsweep-sidecar/ (setsweep $SETSWEEP_VER, shell $SHELL_VER)"
