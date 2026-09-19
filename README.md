# Kettle Desktop

**A native macOS window for the Kettle review desk.**

[![Checks](https://github.com/charlesberret/kettle-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/charlesberret/kettle-desktop/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)

Kettle Desktop is a thin Electron shell around
[Kettle Core](https://github.com/charlesberret/kettle-core). The product sitting
is core `static/index.html` — the same three-pane desk as `kettle --web`
(queue · editor · brief / ritual / chat). This repo owns the window, menu,
hidden-inset title bar, and sidecar lifecycle. It does **not** own a second
frontend.

Product home: **[charlesberret/kettle](https://github.com/charlesberret/kettle)**.  
Viewport contract: [viewports.md](https://github.com/charlesberret/kettle/blob/main/docs/explanation/viewports.md).

## How it works

1. If a compatible core already owns `127.0.0.1:4242`, the app attaches without
   taking ownership of that process.
2. Otherwise it launches an owned Kettle sidecar (bundled or `kettle` on PATH).
3. The window loads **`http://127.0.0.1:<port>/`** (core sitting) and adds
   `body.desktop-shell` for titlebar insets.
4. Quit tears down only the sidecar this app started.

Sitting visual, copy, and theme changes land in kettle-core. `npm start` against
a live core shows them immediately. Packaged apps need a sidecar rebuild.

A July 2026 plugin-shaped fork (`app/`) is parked under
[`legacy/v2-scaffold/`](./legacy/v2-scaffold/). Do not revive it as the product
shell. Notes: [`docs/DESKTOP_V2.md`](./docs/DESKTOP_V2.md).

## Develop

Requirements: macOS, Node **22.12–25**, a working `kettle` from kettle-core.

```sh
npm ci
npm test
npm start
```

Override the core command with `KETTLE_CMD=/path/to/kettle`.

## Package locally

```sh
npm run package          # full sidecar + forge (needs clean core for release)
bash scripts/install-app.sh   # → ~/Applications/Kettle.app
```

## Architecture boundaries

| Owns | Does not own |
|------|----------------|
| Window, menu, splash, sidecar lifecycle | Desk files, founding state machine |
| `body.desktop-shell` host chrome | A sitting, theme, or type system |
| Contract checks (`lib/`) | Curator credentials |

Core remains the single authority for desk semantics, the HTTP contract, and
the graphical sitting.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). API/desk/sitting changes land in
kettle-core first. Security: [SECURITY.md](./SECURITY.md). Changelog:
[CHANGELOG.md](./CHANGELOG.md).
