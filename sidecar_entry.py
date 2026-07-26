#!/usr/bin/env python3
"""PyInstaller entrypoint — runs the kettle web server as a bundled sidecar."""

import server
import sys


def main() -> int:
    if not sys.argv or sys.argv[0] != "kettle-sidecar":
        sys.argv.insert(0, "kettle-sidecar")
    return server.main() or 0


if __name__ == "__main__":
    raise SystemExit(main())
