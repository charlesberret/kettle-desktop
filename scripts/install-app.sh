#!/usr/bin/env bash
# Copy the packaged Setsweep.app into ~/Applications for Spotlight / Raycast / Dock.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/out/Setsweep-darwin-arm64/Setsweep.app"
DEST="${SETSWEEP_APP_DEST:-$HOME/Applications/Setsweep.app}"

if [[ ! -d "$SRC" ]]; then
  echo "error: packaged app not found at $SRC" >&2
  echo "Run: npm run package" >&2
  exit 1
fi

if [[ -d "$DEST" ]]; then
  echo "[install-app] removing $DEST"
  rm -rf "$DEST"
fi

echo "[install-app] copying → $DEST"
mkdir -p "$(dirname "$DEST")"
ditto "$SRC" "$DEST"

# Gatekeeper: unsigned builds need one explicit open (or strip quarantine after copy).
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

VER="$DEST/Contents/Resources/version.json"
if [[ -f "$VER" ]]; then
  echo "[install-app] $(cat "$VER")"
fi
echo "[install-app] done — launch Setsweep from ~/Applications or Spotlight"
