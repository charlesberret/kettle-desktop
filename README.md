# Kettle Desktop

**A native macOS window for the Kettle review desk.**

[![Checks](https://github.com/charlesberret/kettle-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/charlesberret/kettle-desktop/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)

Kettle Desktop is a thin Electron shell around
[Kettle Core](https://github.com/charlesberret/kettle-core). It does not carry
a separate frontend or product model. The public project home is
**[charlesberret/kettle](https://github.com/charlesberret/kettle)**.

## How it works

1. If a compatible core already owns `127.0.0.1:4242`, the app attaches without
   taking ownership of that process.
2. Otherwise it launches an owned Kettle sidecar, on 4242 when available or an
   ephemeral localhost port when another service occupies it.
3. The window loads the core's own `static/index.html`.
4. Quit tears down only the sidecar this app started.

Packaged releases validate the bundled core version, contract integers, Git
commit, clean-tree state, and exact web-index hash before opening the window.
The supported contract set is declared in
[kettle-compatibility.json](./kettle-compatibility.json).

During the rename transition, an external core may still identify as
`setsweep`; bundled releases must identify as `kettle`. Existing Setsweep
Application Support data is used in place when no Kettle registry exists, so
the shell does not create a competing registry.

## Develop

Requirements:

- macOS
- Node.js 22.12 through 25 (Node 26 is not yet supported by the packaging toolchain)
- a working `kettle` command from
  [kettle-core](https://github.com/charlesberret/kettle-core)

```sh
npm install
npm test
npm start
```

Override the development core command with `KETTLE_CMD=/path/to/kettle`.
`SETSWEEP_CMD` remains a temporary compatibility fallback.

`npm test` is side-effect free with respect to the live desk. It runs JavaScript
and shell syntax checks plus unit tests; it does not bind port 4242 or build a
sidecar.

## Package locally

```sh
npm run build:sidecar
npm run smoke:sidecar
npm run package
```

`build:sidecar` reads `../kettle-core` by default. Override with
`KETTLE_SRC=/path/to/kettle-core`. Python comes from `KETTLE_VENV`,
`~/.kettle-venv`, a legacy Setsweep venv, or a local `.build-venv`.

Release builds refuse a dirty, unversioned, or structurally incomplete core
before replacing local artifacts. `KETTLE_ALLOW_UNVERIFIED_CORE=1` is available
only for direct local experiments and cannot bypass CI or release gates.

Generated artifacts are ignored:

```text
resources/kettle-sidecar/
resources/version.json
out/Kettle-*/Kettle.app
```

`npm run install:app` copies a packaged build into
`~/Applications/Kettle.app`. The app is not signed or notarized yet, so local
packages are development artifacts rather than a public download.

## Architecture boundaries

- Desktop owns Electron lifecycle, native menus, window state, external-link
  interception, folder selection, bundling, and future signing/notarization.
- Core owns the desk, API, migrations, curator runtime, web UI, and product
  semantics.
- Founding or sitting gaps are fixed in core web once, never in a desktop-only
  fork.
- File access remains in the localhost core; Electron uses context isolation,
  disables Node integration in the web view, rejects webviews, denies permission
  requests, and opens off-core links in the system browser.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Core/API changes belong in
[kettle-core](https://github.com/charlesberret/kettle-core) first.
Vulnerabilities should be reported privately as described in
[SECURITY.md](./SECURITY.md).

Release-facing changes are recorded in [CHANGELOG.md](./CHANGELOG.md).

## License

MIT. See [LICENSE](./LICENSE).
