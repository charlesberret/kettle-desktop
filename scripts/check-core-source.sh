#!/usr/bin/env bash
# Validate the kettle-core source before any build tool mutates local artifacts.
set -euo pipefail

KETTLE_SRC="${1:-}"
if [[ -z "$KETTLE_SRC" || ! -d "$KETTLE_SRC" ]]; then
  echo "error: kettle-core source not found at ${KETTLE_SRC:-<unset>}" >&2
  exit 1
fi

SOURCE_ROOT="$(cd "$KETTLE_SRC" && pwd -P)"
for required in pyproject.toml kettle_contract.py static/index.html; do
  if [[ ! -f "$SOURCE_ROOT/$required" ]]; then
    echo "error: kettle-core source is missing $required" >&2
    exit 1
  fi
done

KETTLE_COMMIT="unknown"
KETTLE_DIRTY="unknown"
GIT_ROOT=""
if git -C "$SOURCE_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GIT_ROOT="$(git -C "$SOURCE_ROOT" rev-parse --show-toplevel)"
  GIT_ROOT="$(cd "$GIT_ROOT" && pwd -P)"
  if [[ "$GIT_ROOT" == "$SOURCE_ROOT" ]] \
      && git -C "$SOURCE_ROOT" rev-parse --verify HEAD >/dev/null 2>&1; then
    KETTLE_COMMIT="$(git -C "$SOURCE_ROOT" rev-parse --short=12 HEAD)"
    if [[ -n "$(git -C "$SOURCE_ROOT" status --porcelain)" ]]; then
      KETTLE_DIRTY="true"
    else
      KETTLE_DIRTY="false"
    fi
  fi
fi

if [[ "$KETTLE_DIRTY" != "false" ]]; then
  if [[ "${KETTLE_ALLOW_UNVERIFIED_CORE:-0}" != "1" ]]; then
    echo "error: refusing to bundle an unverified kettle-core tree ($KETTLE_DIRTY)" >&2
    echo "Commit the core tree, or set KETTLE_ALLOW_UNVERIFIED_CORE=1 for a local-only build." >&2
    exit 1
  fi
  if [[ "${KETTLE_RELEASE_BUILD:-0}" == "1" || -n "${CI:-}" ]]; then
    echo "error: KETTLE_ALLOW_UNVERIFIED_CORE is local-only and cannot bypass a release/CI gate" >&2
    exit 1
  fi
  echo "[build-sidecar] warning: bundling unverified core by local-only override" >&2
fi

printf '%s\t%s\t%s\n' "$KETTLE_COMMIT" "$KETTLE_DIRTY" "$SOURCE_ROOT"
