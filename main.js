// Electron shell for kettle. Attaches to a compatible core already on :4242 or
// spawns an owned Python sidecar, then loads its localhost URL in a BrowserWindow.
// The frontend (static/index.html) is unchanged — preload.js shims window.pywebview.api.

const { app, BrowserWindow, Menu, dialog, shell, ipcMain, nativeImage } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const CORE_COMPATIBILITY = require('./kettle-compatibility.json');
const {
  validateCoreIndex,
  validateCorePing,
} = require('./lib/core-contract');
const { planSidecarStartup } = require('./lib/sidecar-startup');

const KETTLE_CMD = process.env.KETTLE_CMD || process.env.SETSWEEP_CMD || 'kettle';
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

let serverProc = null;
let serverPort = null;
let mainWindow = null;
let splashWindow = null;
let sidecarLog = null;
let versionInfo = null;
let serverIdentity = null;
let serverOwned = false;

function resolveAppIconPath() {
  const bundled = path.join(process.resourcesPath || '', 'icon.icns');
  const dev = path.join(__dirname, 'icon.icns');
  if (bundled && fs.existsSync(bundled)) return bundled;
  if (fs.existsSync(dev)) return dev;
  return null;
}

/** Dock icon in dev (`npm start`); packaged builds use icon.icns via electron-forge. */
function setAppIcon() {
  const iconPath = resolveAppIconPath();
  if (!iconPath) return;
  const img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) return;
  if (process.platform === 'darwin' && app.dock) app.dock.setIcon(img);
}

function loadVersionInfo() {
  const candidates = [
    path.join(__dirname, 'resources', 'version.json'),
    path.join(process.resourcesPath || '', 'version.json'),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch { /* try next */ }
  }
  return { shell: app.getVersion(), kettle: 'dev' };
}

function updateAboutPanel() {
  const coreVersion = serverIdentity?.version || versionInfo?.kettle || 'dev';
  app.setAboutPanelOptions({
    applicationName: 'Kettle',
    applicationVersion: versionInfo?.shell || app.getVersion(),
    version: `Kettle server ${coreVersion}`,
    copyright: 'Charles Berret',
  });
}

function resolveSidecar() {
  if (process.env.KETTLE_CMD || process.env.SETSWEEP_CMD) {
    return { cmd: KETTLE_CMD, args: ['--web'], bundled: false };
  }

  const bundled = path.join(process.resourcesPath || '', 'kettle-sidecar', 'kettle-sidecar');
  if (bundled && fs.existsSync(bundled)) {
    return { cmd: bundled, args: [], bundled: true };
  }

  return { cmd: KETTLE_CMD, args: ['--web'], bundled: false };
}

function resolveProjectsPath() {
  if (process.env.DESK_PROJECTS) return process.env.DESK_PROJECTS;
  const current = path.join(app.getPath('userData'), 'projects.json');
  if (fs.existsSync(current)) return current;
  if (process.platform === 'darwin') {
    const legacy = path.join(
      app.getPath('home'),
      'Library',
      'Application Support',
      'Setsweep',
      'projects.json'
    );
    if (fs.existsSync(legacy)) return legacy;
  }
  return current;
}

function registryImportSources() {
  const srcRoot = process.env.KETTLE_SRC
    || process.env.SETSWEEP_SRC
    || path.resolve(__dirname, '..', 'kettle-core');
  return [
    process.env.KETTLE_PROJECTS_SRC,
    process.env.SETSWEEP_PROJECTS_SRC,
    path.join(srcRoot, 'projects.json'),
  ].filter(Boolean);
}

/** Seed userData/projects.json from a dev registry on first Electron launch. */
function ensureProjectsRegistry() {
  const dest = resolveProjectsPath();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) return dest;

  for (const src of registryImportSources()) {
    try {
      if (fs.existsSync(src) && fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dest);
        console.log(`[shell] imported project registry from ${src}`);
        return dest;
      }
    } catch (err) {
      console.warn(`[shell] could not import registry from ${src}:`, err.message);
    }
  }

  fs.writeFileSync(dest, `${JSON.stringify({ projects: [] }, null, 2)}\n`);
  console.log(`[shell] created empty project registry at ${dest}`);
  return dest;
}

function sidecarEnv() {
  const PATH = [
    process.env.PATH || '',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(process.env.HOME || '', '.local/bin'),
    path.join(process.env.HOME || '', '.pyenv/shims'),
  ].filter(Boolean).join(':');

  const env = {
    ...process.env,
    PATH,
    PYTHONUNBUFFERED: '1',
    DESK_PROJECTS: resolveProjectsPath(),
  };

  return env;
}

function openSidecarLog() {
  const logDir = app.getPath('logs');
  fs.mkdirSync(logDir, { recursive: true });
  const stream = fs.createWriteStream(path.join(logDir, 'sidecar.log'), { flags: 'a' });
  stream.write(`\n--- ${new Date().toISOString()} launch ---\n`);
  return stream;
}

function logSidecar(chunk) {
  process.stdout.write(`[kettle] ${chunk}`);
  if (sidecarLog && !sidecarLog.destroyed) sidecarLog.write(chunk);
}

function requestSidecar(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      timeout: 500,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Sidecar ${pathname} returned HTTP ${res.statusCode}`));
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`Timed out waiting for sidecar ${pathname}`));
    });
    req.on('error', reject);
  });
}

async function pingSidecar(port, provenance = null) {
  const raw = await requestSidecar(port, '/api/ping');
  let body;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch (err) {
    throw new Error(`Could not parse sidecar ping: ${err.message}`);
  }
  return validateCorePing(body, {
    port,
    compatibility: CORE_COMPATIBILITY,
    provenance,
  });
}

async function verifyCanonicalCoreIndex(port, provenance) {
  const body = await requestSidecar(port, '/');
  validateCoreIndex(body, provenance);
}

function waitForSidecar(port, timeoutMs = 15000, provenance = null) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    let lastErr = null;
    const tryOnce = () => {
      pingSidecar(port, provenance)
        .then(resolve)
        .catch((err) => {
          lastErr = err;
          if (Date.now() >= deadline) {
            const detail = lastErr ? `: ${lastErr.message}` : '';
            reject(new Error(`Timed out waiting for Kettle /api/ping${detail}`));
            return;
          }
          setTimeout(tryOnce, 150);
        });
    };
    tryOnce();
  });
}

/** Canonical kettle-core default — prefer this so the plugin can attach without discovery. */
const DEFAULT_CORE_PORT = 4242;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => {
      srv.close(() => resolve(true));
    });
  });
}

/** Stop only a process this desktop instance spawned; attached cores are never owned. */
function killSidecar() {
  if (serverOwned && serverProc && !serverProc.killed) {
    try { serverProc.kill('SIGTERM'); } catch { /* already gone */ }
  }
  serverProc = null;
  serverOwned = false;
  serverIdentity = null;
  serverPort = null;
}

function quitApp() {
  app.isQuitting = true;
  app.quit();
}

function sidecarLogPath() {
  return path.join(app.getPath('logs'), 'sidecar.log');
}

function showSidecarCrashDialog(code) {
  dialog.showErrorBox('Kettle server stopped',
    `The kettle server exited unexpectedly (code ${code}).\n\nLog: ${sidecarLogPath()}`);
}

function startSidecar(port) {
  const { cmd, args, bundled } = resolveSidecar();
  const spawnArgs = [...args, '--port', String(port), '--no-open'];
  const provenance = bundled ? versionInfo : null;

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      killSidecar();
      reject(err);
    };

    const proc = spawn(cmd, spawnArgs, {
      env: sidecarEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProc = proc;
    serverOwned = true;

    proc.on('error', (err) => {
      const hint = bundled
        ? 'The bundled server failed to launch.'
        : 'Is `kettle` on PATH? Try: which kettle';
      fail(new Error(`Could not launch kettle (${cmd}): ${err.message}\n\n${hint}`));
    });

    proc.stdout.on('data', (b) => logSidecar(b));
    proc.stderr.on('data', (b) => logSidecar(b));

    proc.on('exit', (code, sig) => {
      console.log(`[kettle] sidecar exited code=${code} sig=${sig}`);
      serverProc = null;
      if (!settled && !app.isQuitting) {
        fail(new Error(`The kettle server exited unexpectedly (code ${code}).`));
        return;
      }
      if (!app.isQuitting) {
        showSidecarCrashDialog(code);
        quitApp();
      }
    });

    waitForSidecar(port, 15000, provenance)
      .then(async (identity) => {
        if (bundled) await verifyCanonicalCoreIndex(port, provenance);
        if (settled) return;
        serverIdentity = identity;
        settled = true;
        resolve(proc);
      })
      .catch(fail);
  });
}

function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  try {
    const raw = fs.readFileSync(windowStatePath(), 'utf8');
    const state = JSON.parse(raw);
    if (state && typeof state.width === 'number' && typeof state.height === 'number') {
      return state;
    }
  } catch { /* first launch */ }
  return { width: 1560, height: 980, x: undefined, y: undefined };
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    fs.writeFileSync(windowStatePath(), JSON.stringify(win.getBounds()));
  } catch { /* non-fatal */ }
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 320,
    height: 140,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => splashWindow?.show());
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  splashWindow = null;
}

function buildMenu() {
  const openSettings = () => mainWindow && mainWindow.webContents.executeJavaScript(
    'window.openAdmin && openAdmin()'
  );
  const appName = app.name || 'Kettle';
  const template = [
    {
      label: appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: openSettings },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow && mainWindow.reload(),
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isSidecarUrl(value, port) {
  const url = parseUrl(value);
  if (!url) return false;
  if (url.protocol !== 'http:') return false;
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return false;
  const urlPort = url.port ? parseInt(url.port, 10) : 80;
  return urlPort === port;
}

function openExternalUrl(value) {
  const url = parseUrl(value);
  if (!url || !ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol)) {
    console.warn(`[shell] blocked external navigation to ${value}`);
    return;
  }
  shell.openExternal(url.toString()).catch((err) => {
    console.warn(`[shell] failed to open external URL ${url.toString()}:`, err.message);
  });
}

function wireNavigation(win, port) {
  win.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    console.warn(`[shell] denied permission request: ${permission}`);
    callback(false);
  });

  win.webContents.on('will-attach-webview', (e) => {
    e.preventDefault();
  });

  win.webContents.on('will-navigate', (e, url) => {
    if (isSidecarUrl(url, port)) return;
    e.preventDefault();
    openExternalUrl(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSidecarUrl(url, port)) {
      win.loadURL(url).catch((err) => {
        console.warn(`[shell] failed to load sidecar URL ${url}:`, err.message);
      });
      return { action: 'deny' };
    }
    openExternalUrl(url);
    return { action: 'deny' };
  });

  win.webContents.on('did-finish-load', () => {
    const init = process.platform === 'darwin'
      ? "document.body.classList.add('desktop-shell');"
      : '';
    win.webContents.executeJavaScript(
      init + "window.dispatchEvent(new Event('pywebviewready'));"
    ).catch(() => {});
  });
}

async function createWindow() {
  if (app.isQuitting) return;
  if (mainWindow) {
    mainWindow.focus();
    return;
  }

  createSplash();
  sidecarLog = openSidecarLog();
  ensureProjectsRegistry();

  const startup = await planSidecarStartup({
    defaultPort: DEFAULT_CORE_PORT,
    isPortFree,
    pingCompatibleCore: (port) => pingSidecar(port),
    findFreePort,
  });
  serverPort = startup.port;
  if (startup.mode === 'attach') {
    serverProc = null;
    serverOwned = false;
    serverIdentity = startup.identity;
    console.log(
      `[shell] attached to compatible Kettle ${serverIdentity.version} `
      + `at http://127.0.0.1:${serverPort}/`
    );
  } else {
    if (startup.reason === 'default-port-incompatible') {
      console.warn(
        `[shell] port ${DEFAULT_CORE_PORT} is occupied by an incompatible service; `
        + `starting an owned sidecar on ${serverPort}: ${startup.detail}`
      );
    }
    await startSidecar(serverPort);
  }
  updateAboutPanel();

  const saved = loadWindowState();
  const winOpts = {
    title: 'Kettle',
    ...saved,
    minWidth: 1100,
    minHeight: 700,
    movable: true,
    resizable: true,
    show: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
  if (process.platform === 'darwin') {
    winOpts.titleBarStyle = 'hiddenInset';
    winOpts.trafficLightPosition = { x: 14, y: 12 };
  }
  mainWindow = new BrowserWindow(winOpts);

  wireNavigation(mainWindow, serverPort);

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow.show();
  });

  // Cache-bust the sitting shell — Electron otherwise keeps a stale index.html across deploys.
  await mainWindow.loadURL(`http://127.0.0.1:${serverPort}/?ui=${Date.now()}`);
  mainWindow.on('close', () => saveWindowState(mainWindow));
  mainWindow.on('closed', () => {
    mainWindow = null;
    app.isQuitting = true;
    killSidecar();
  });
}

function showStartupError(err) {
  closeSplash();
  const attached = !serverOwned && serverIdentity;
  const bundled = resolveSidecar().bundled;
  const extra = attached
    ? `The compatible core at 127.0.0.1:${serverPort} was attached, not started by desktop.`
    : bundled
      ? `Sidecar log: ${sidecarLogPath()}`
      : 'Is `kettle` on PATH? Try: which kettle';
  dialog.showErrorBox('Kettle failed to start',
    `Could not launch the kettle server.\n\n${err.message}\n\n${extra}`);
}

// IPC for folder picker (preload exposes this as window.pywebview.api.pick_folder).
ipcMain.handle('kettle:pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: process.env.HOME,
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.setName('Kettle');

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    setAppIcon();
    versionInfo = loadVersionInfo();
    updateAboutPanel();

    buildMenu();
    try {
      await createWindow();
      console.log(`[shell] window loaded http://127.0.0.1:${serverPort}/`);
    } catch (err) {
      console.error('[shell] startup failed:', err);
      showStartupError(err);
      quitApp();
    }

    app.on('activate', async () => {
      if (app.isQuitting) return;
      if (BrowserWindow.getAllWindows().length === 0) {
        try {
          await createWindow();
        } catch (err) {
          showStartupError(err);
          quitApp();
        }
      }
    });
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
    killSidecar();
    if (sidecarLog && !sidecarLog.destroyed) sidecarLog.end();
  });

  // Single-window app: closing quits and tears down only an owned sidecar.
  app.on('window-all-closed', () => {
    quitApp();
  });
}
