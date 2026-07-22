# setsweep-desktop

Electron shell for [setsweep-core](../setsweep-core/), the desk/review tool. Wraps the Python server in a native macOS window — the `.app` you double-click instead of running `setsweep` in a terminal. Host adapters (VS Code/Cursor, later Obsidian/Sublime) live in [`setsweep-plugin`](../setsweep-plugin/).

Product-wide plan: [`setsweep-core/ROADMAP.md`](../setsweep-core/ROADMAP.md) — this repo's
distribution work package is brief 15 there (`docs/briefs/15-desktop-distribution.md`).

## Architecture

- **Sidecar pattern.** On launch the main process starts the setsweep web server (bundled binary when packaged, otherwise `setsweep --web` on PATH), polls until it is listening, then loads `http://127.0.0.1:<port>/` in a `BrowserWindow`.
- **Single UI source.** There is **no separate desktop frontend**. The window loads the same
  `setsweep-core/static/index.html` (and themes, marked, purify) that the browser and the
  Python sidecar serve. `preload.js` only shims `window.pywebview.api.pick_folder` for the
  native folder dialog. **Polish the web UI in core once** — desktop picks it up on the next
  `setsweep --web` (dev) or `npm run build:sidecar` (packaged). Do not fork styles into this repo.
- **External-link interception.** Off-localhost URLs open in the default browser via `shell.openExternal`.
- **Single-instance lock.** Second launches focus the existing window.
- **Clean shutdown.** Closing the window or quitting kills the Python sidecar.

## Develop

```sh
npm install        # one-time
npm start          # electron-forge start; requires setsweep on PATH
```

For dev, install setsweep from core (`pip install -e ~/cloud/git-projects/setsweep-core`). The shell widens PATH to include Homebrew, pyenv shims, and `~/.local/bin` so a GUI launch resolves `setsweep` the same way a terminal does.

Override the sidecar binary with `SETSWEEP_CMD=/path/to/setsweep`.

## Build

```sh
npm run build:sidecar   # PyInstaller → resources/setsweep-sidecar/ + resources/version.json
npm run package         # → out/Setsweep-darwin-arm64/Setsweep.app
npm run package:shell   # same, but skip sidecar rebuild (use when sidecar is already fresh)
npm run install:app     # package + copy to ~/Applications/Setsweep.app (Spotlight / launcher)
npm run make            # → out/make/zip/darwin/arm64/Setsweep-*.zip
```

`build:sidecar` reads the setsweep-core source from `SETSWEEP_SRC` (default `~/cloud/git-projects/setsweep-core`). Python comes from `SETSWEEP_VENV`, `~/.setsweep-venv`, or a local `.build-venv` created on first build.

The packaged `.app` is self-contained: no Python install required. Project registry and settings live under `~/Library/Application Support/Setsweep/`. On first launch, if `projects.json` is missing, the shell copies it from `SETSWEEP_SRC/projects.json` (default `~/cloud/git-projects/setsweep-core`) or `SETSWEEP_PROJECTS_SRC`. Sidecar logs: `~/Library/Logs/Setsweep/sidecar.log`.

No code signing or notarization yet. macOS Gatekeeper may block on first launch — right-click → Open, or run `npm run install:app` (strips quarantine after copy).

**Packaging seems stuck?** After PyInstaller, forge extracts Electron (~120 MB) via `extract-zip`, which can hang indefinitely on Electron 42 + Node 22+ (temp dir stuck at ~18 MB with only `LICENSES.chromium.html`). `Ctrl+C`, then `pkill -f 'electron-forge'`. Packaging runs a prePackage hook that patches extraction to use `ditto` instead — if you still see the hang, run `node scripts/patch-electron-extract.js` manually, then `npm run package:shell`. Sidecar already built? Use `package:shell` to skip PyInstaller.

**Launcher note:** If you previously installed the retired pywebview wrapper at `~/Applications/Setsweep.app`, replace it with `npm run install:app`. The Electron bundle uses bundle id `net.charlesberret.setsweep` and is self-contained.

## Layout

```
~/cloud/git-projects/setsweep-desktop/
├── main.js                 Electron main: sidecar, window, menus, link interception
├── preload.js              contextBridge: window.pywebview.api shim
├── splash.html             Startup splash while the sidecar binds
├── sidecar_entry.py        PyInstaller entrypoint
├── setsweep-sidecar.spec   PyInstaller spec
├── scripts/build-sidecar.sh
├── package.json            electron-forge config
├── icon.icns               App icon (temporary three-pane art; rebuild with iconutil if needed)
├── assets/icon-1024.png    Source PNG for future iconset work
├── resources/              Build artifacts (gitignored): sidecar binary + version.json
└── out/                    Packaged .app (gitignored)
```

## Deferred

- **Code signing + DMG** once you want to share the `.app` with anyone else.
