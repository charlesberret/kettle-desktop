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

# A build venv of our own, never the developer's. This script installs kettle
# NON-editable (a bundler cannot follow an editable finder hook — PyInstaller
# reported every `kettle.*` hidden import as "not found" and shipped a broken
# sidecar), so pointing it at ~/.kettle-venv would replace the working editable
# install in the venv the developer uses all day.
VENV="${KETTLE_VENV:-$ROOT/.build-venv}"
if [[ "$VENV" == "${HOME}/.kettle-venv" || "$VENV" == "${HOME}/.setsweep-venv" ]]; then
  echo "error: refusing to build in $VENV — this install is not editable and would" >&2
  echo "replace your working checkout install. Unset KETTLE_VENV." >&2
  exit 1
fi

if [[ ! -x "$VENV/bin/python" ]]; then
  echo "[build-sidecar] creating build venv at $VENV"
  python3 -m venv "$VENV"
fi

PYTHON="$VENV/bin/python"

echo "[build-sidecar] kettle source: $KETTLE_SRC"
echo "[build-sidecar] venv: $VENV"

# Read the contract from the installed package, not from a PYTHONPATH pointed at the
# repo root: the flat modules moved into kettle/. Non-editable on purpose (see the
# venv note above) — this is also what makes the bundle match the wheel.
"$PYTHON" -m pip install -q -U pip
"$PYTHON" -m pip install -q "$KETTLE_SRC"
KETTLE_VER="$("$PYTHON" -c \
  "from kettle import kettle_contract as c; print(c.core_version())")"
API_VERSION="$("$PYTHON" -c \
  "from kettle import kettle_contract as c; print(c.API_VERSION)")"
DESK_SCHEMA_VERSION="$("$PYTHON" -c \
  "from kettle import kettle_contract as c; print(c.DESK_SCHEMA_VERSION)")"
SHELL_VER="$(node -p "require('$ROOT/package.json').version")"
PYTHON_VER="$("$PYTHON" -c "import platform; print(platform.python_version())")"
KETTLE_INDEX_SHA256="$("$PYTHON" -c \
  "import hashlib, pathlib, sys; print(hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest())" \
  "$KETTLE_SRC/kettle/static/index.html")"

if [[ -z "$KETTLE_VER" || "$KETTLE_VER" == "unknown" ]]; then
  echo "error: kettle-core did not report a release version" >&2
  exit 1
fi

"$PYTHON" -m pip install -q pyinstaller

# The packaging recipe lives in kettle-core (packaging/kettle.spec) so the bundle
# cannot drift from the package it bundles — this shell's own copy did exactly that,
# pointing at kettle_contract.py and static/index.html at the repo root long after
# they moved into kettle/. onedir because a sidecar starts on every app launch.
export KETTLE_SRC KETTLE_BUNDLE=onedir KETTLE_BUNDLE_NAME=kettle-sidecar
cd "$ROOT"
"$PYTHON" -m PyInstaller --noconfirm --clean "$KETTLE_SRC/packaging/kettle.spec"

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
