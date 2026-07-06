# setsweep-desktop

Electron shell for [setsweep](../../Seafile/Code/active/setsweep/), the desk/review tool. Wraps the Python server in a native macOS window — the `.app` you double-click instead of running `setsweep` in a terminal.

## Architecture

- **Sidecar pattern.** On launch the main process starts the setsweep web server (bundled binary when packaged, otherwise `setsweep --web` on PATH), polls until it is listening, then loads `http://127.0.0.1:<port>/` in a `BrowserWindow`.
- **Frontend unchanged.** `preload.js` shims `window.pywebview.api.pick_folder` to Electron's native folder dialog, so `static/index.html` runs as-is.
- **External-link interception.** Off-localhost URLs open in the default browser via `shell.openExternal`.
- **Single-instance lock.** Second launches focus the existing window.
- **Clean shutdown.** Closing the window or quitting kills the Python sidecar.

## Develop

```sh
npm install        # one-time
npm start          # electron-forge start; requires setsweep on PATH
```

For dev, install setsweep from the parent repo (`pip install -e ~/Seafile/Code/active/setsweep`). The shell widens PATH to include Homebrew, pyenv shims, and `~/.local/bin` so a GUI launch resolves `setsweep` the same way a terminal does.

Override the sidecar binary with `SETSWEEP_CMD=/path/to/setsweep`.

## Build

```sh
npm run build:sidecar   # PyInstaller → resources/setsweep-sidecar/ + resources/version.json
npm run package         # → out/Setsweep-darwin-arm64/Setsweep.app
npm run package:shell   # same, but skip sidecar rebuild (use when sidecar is already fresh)
npm run install:app     # package + copy to ~/Applications/Setsweep.app (Spotlight / launcher)
npm run make            # → out/make/zip/darwin/arm64/Setsweep-*.zip
```

`build:sidecar` reads the setsweep source from `SETSWEEP_SRC` (default `~/Seafile/Code/active/setsweep`). Python comes from `SETSWEEP_VENV`, `~/.setsweep-venv`, or a local `.build-venv` created on first build.

The packaged `.app` is self-contained: no Python install required. Project registry and settings live under `~/Library/Application Support/Setsweep/`. On first launch, if `projects.json` is missing, the shell copies it from `SETSWEEP_SRC/projects.json` (default `~/Seafile/Code/active/setsweep`) or `SETSWEEP_PROJECTS_SRC`. Sidecar logs: `~/Library/Logs/Setsweep/sidecar.log`.

No code signing or notarization yet. macOS Gatekeeper may block on first launch — right-click → Open, or run `npm run install:app` (strips quarantine after copy).

**Packaging seems stuck?** After PyInstaller, forge extracts Electron (~120 MB) via `extract-zip`, which can hang indefinitely on Electron 42 + Node 22+ (temp dir stuck at ~18 MB with only `LICENSES.chromium.html`). `Ctrl+C`, then `pkill -f 'electron-forge'`. Packaging runs a prePackage hook that patches extraction to use `ditto` instead — if you still see the hang, run `node scripts/patch-electron-extract.js` manually, then `npm run package:shell`. Sidecar already built? Use `package:shell` to skip PyInstaller.

**Launcher note:** If you previously installed the retired pywebview wrapper at `~/Applications/Setsweep.app`, replace it with `npm run install:app`. The Electron bundle uses bundle id `net.charlesberret.setsweep` and is self-contained.

## Layout

```
~/Repos/setsweep-desktop/
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
