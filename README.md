# Kettle Desktop

**A native macOS window for the Kettle review desk (v2 sitting).**

[![Checks](https://github.com/charlesberret/kettle-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/charlesberret/kettle-desktop/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)

Kettle Desktop is an Electron shell around
[Kettle Core](https://github.com/charlesberret/kettle-core). **v2** presents a
**plugin-shaped sitting** (queue · editor · desk) over the localhost API — the
same workflow model as the VS Code / Cursor extension, not a full reload of
core’s historical browser shell.

Charter: [`docs/DESKTOP_V2.md`](./docs/DESKTOP_V2.md).  
Product home: **[charlesberret/kettle](https://github.com/charlesberret/kettle)**.

## Layout

```text
Queue (left)  ·  Editor (center)  ·  Desk brief / ritual / chat (right)
```

Ritual: **Approve · Comment · Sweep**. Approve bookmarks; sweep closes the sitting.

## How it works

1. If a compatible core already owns `127.0.0.1:4242`, the app attaches without
   taking ownership of that process.
2. Otherwise it launches an owned Kettle sidecar (bundled or `kettle` on PATH).
3. The window loads **`app/index.html`** (local UI) and calls the core HTTP API.
4. Quit tears down only the sidecar this app started.

### v0 backup (web sitting shell)

The previous product surface loaded core `static/index.html` (including older
chrome such as the dense meta/context rail). That tree is preserved as:

- tag `desktop-v0-web-sitting`
- branch `legacy/web-sitting-shell`
- tarball under `~/cloud/backups/kettle-desktop-v0-web-sitting-*.tar.gz`

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
| v2 sitting UI in `app/` | Core browser reference (`static/index.html`) |
| Contract checks (`lib/`) | Curator credentials |

Core remains the single authority for desk semantics and the HTTP contract.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). API/desk changes land in kettle-core first.
Security: [SECURITY.md](./SECURITY.md). Changelog: [CHANGELOG.md](./CHANGELOG.md).
