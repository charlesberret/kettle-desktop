# setsweep-desktop

Electron shell for [setsweep](../../Seafile/Code/active/setsweep/), the desk/review tool. Wraps the existing local Python server in a native macOS window — the .app you double-click instead of running `setsweep` in a terminal.

## Architecture

- **Sidecar pattern.** The Electron main process spawns `setsweep --web --port <free> --no-open` as a subprocess on launch, polls until it's listening, then `loadURL`s `http://127.0.0.1:<port>/` in a BrowserWindow.
- **Frontend unchanged.** `preload.js` shims `window.pywebview.api.pick_folder` to Electron's native `dialog.showOpenDialog`, so `static/index.html` runs as-is.
- **External-link interception.** Off-localhost URLs are bounced to the default browser via `shell.openExternal` (the fix for the Lex-in-Setsweep class of bug — pywebview happily followed external links in-window).
- **Single-instance lock.** Second launches focus the existing window.
- **Clean shutdown.** `before-quit` kills the Python sidecar.

## Develop

```sh
npm install        # one-time
npm start          # launches Electron in dev mode (electron-forge start)
```

Requires `setsweep` on PATH (installed from the parent `~/Seafile/Code/active/setsweep/` via `pip install -e`). The shell widens its PATH to include Homebrew, pyenv shims, and `~/.local/bin` so a GUI launch resolves `setsweep` the same way a terminal does.

## Build

```sh
npm run package    # → out/Setsweep-darwin-arm64/Setsweep.app  (unsigned, ~230MB)
npm run make       # → out/make/zip/darwin/arm64/Setsweep-*.zip (~93MB)
```

No code signing or notarization. macOS will Gatekeeper-block the .app on first launch — right-click → Open, or `xattr -dr com.apple.quarantine /Applications/Setsweep.app`.

## Phase 2 (deferred)

- **PyInstaller-bundled sidecar.** Today the .app shells out to whatever `setsweep` is on PATH. Phase 2: PyInstaller compiles `server.py` + deps into a binary copied into `Contents/Resources/`, so the .app is self-contained and survives on a Mac with no Python install.
- **Retire `app.py` / pywebview** in the parent setsweep repo once this shell is the only window.
- **Code signing + DMG** once you want to share the .app with anyone else.

## Layout

```
~/Repos/setsweep-desktop/
├── main.js              Electron main: sidecar spawn, window, menus, link interception
├── preload.js           contextBridge: window.pywebview.api shim
├── package.json         electron-forge config
├── icon.icns            App icon (placeholder; built from icon.iconset/)
├── icon.iconset/        PNG sources for the .icns
└── out/                 Build outputs (gitignored)
```
