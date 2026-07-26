#!/usr/bin/env bash
# Build the PyInstaller-bundled kettle sidecar and copy it into resources/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KETTLE_SRC="${KETTLE_SRC:-${SETSWEEP_SRC:-$ROOT/../kettle-core}}"

if [[ ! -d "$KETTLE_SRC" ]]; then
  echo "error: kettle-core source not found at $KETTLE_SRC" >&2
  echo "Set KETTLE_SRC to the kettle-core repo and retry." >&2
  exit 1
fi

# Fail the release gate before creating a venv, installing packages, or replacing
# resources. The override is accepted only for an explicitly local build.
CORE_PROVENANCE="$("$ROOT/scripts/check-core-source.sh" "$KETTLE_SRC")"
IFS=$'\t' read -r KETTLE_COMMIT KETTLE_DIRTY KETTLE_SRC <<< "$CORE_PROVENANCE"

if [[ -n "${KETTLE_VENV:-}" ]]; then
  VENV="$KETTLE_VENV"
elif [[ -n "${SETSWEEP_VENV:-}" && -x "$SETSWEEP_VENV/bin/python" ]]; then
  VENV="$SETSWEEP_VENV"
elif [[ -x "${HOME}/.kettle-venv/bin/python" ]]; then
  VENV="${HOME}/.kettle-venv"
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

echo "[build-sidecar] kettle source: $KETTLE_SRC"
echo "[build-sidecar] venv: $VENV"

KETTLE_VER="$(PYTHONPATH="$KETTLE_SRC" "$PYTHON" -c \
  "import kettle_contract as c; print(c.core_version())")"
API_VERSION="$(PYTHONPATH="$KETTLE_SRC" "$PYTHON" -c \
  "import kettle_contract as c; print(c.API_VERSION)")"
DESK_SCHEMA_VERSION="$(PYTHONPATH="$KETTLE_SRC" "$PYTHON" -c \
  "import kettle_contract as c; print(c.DESK_SCHEMA_VERSION)")"
SHELL_VER="$(node -p "require('$ROOT/package.json').version")"
PYTHON_VER="$("$PYTHON" -c "import platform; print(platform.python_version())")"
KETTLE_INDEX_SHA256="$("$PYTHON" -c \
  "import hashlib, pathlib, sys; print(hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest())" \
  "$KETTLE_SRC/static/index.html")"

if [[ -z "$KETTLE_VER" || "$KETTLE_VER" == "unknown" ]]; then
  echo "error: kettle-core did not report a release version" >&2
  exit 1
fi

"$PYTHON" -m pip install -q -e "$KETTLE_SRC"
"$PYTHON" -m pip install -q pyinstaller

export KETTLE_SRC
cd "$ROOT"
"$PYTHON" -m PyInstaller --noconfirm --clean kettle-sidecar.spec

# Catch a concurrent source edit or a build tool that dirtied core. Release
# provenance must describe the same clean revision PyInstaller just consumed.
CORE_PROVENANCE_AFTER="$("$ROOT/scripts/check-core-source.sh" "$KETTLE_SRC")"
IFS=$'\t' read -r COMMIT_AFTER DIRTY_AFTER SOURCE_AFTER <<< "$CORE_PROVENANCE_AFTER"
if [[ "$COMMIT_AFTER" != "$KETTLE_COMMIT" \
    || "$DIRTY_AFTER" != "$KETTLE_DIRTY" \
    || "$SOURCE_AFTER" != "$KETTLE_SRC" ]]; then
  echo "error: kettle-core provenance changed during the sidecar build" >&2
  exit 1
fi

mkdir -p "$ROOT/resources"
rm -rf "$ROOT/resources/kettle-sidecar"
cp -R "$ROOT/dist/kettle-sidecar" "$ROOT/resources/kettle-sidecar"

BUILT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

export API_VERSION BUILT DESK_SCHEMA_VERSION PYTHON_VER ROOT KETTLE_COMMIT
export KETTLE_DIRTY KETTLE_INDEX_SHA256 KETTLE_SRC KETTLE_VER SHELL_VER
"$PYTHON" - <<'PY'
import json
import os
from pathlib import Path

dirty = os.environ["KETTLE_DIRTY"]
payload = {
    "shell": os.environ["SHELL_VER"],
    "kettle": os.environ["KETTLE_VER"],
    "apiVersion": int(os.environ["API_VERSION"]),
    "deskSchemaVersion": int(os.environ["DESK_SCHEMA_VERSION"]),
    "built": os.environ["BUILT"],
    "python": os.environ["PYTHON_VER"],
    "kettleCommit": os.environ["KETTLE_COMMIT"],
    "kettleDirty": None if dirty == "unknown" else dirty == "true",
    "kettleIndexSha256": os.environ["KETTLE_INDEX_SHA256"],
}

(Path(os.environ["ROOT"]) / "resources" / "version.json").write_text(
    f"{json.dumps(payload, indent=2)}\n"
)
PY

echo "[build-sidecar] → resources/kettle-sidecar/ (kettle $KETTLE_VER, shell $SHELL_VER)"
