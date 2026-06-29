// Electron shell for setsweep. Spawns the existing Python server (`setsweep --web`)
// as a sidecar, waits for it to bind, then loads its localhost URL in a BrowserWindow.
// The frontend (static/index.html) is unchanged — preload.js shims window.pywebview.api.

const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const SETSWEEP_CMD = process.env.SETSWEEP_CMD || 'setsweep';

let serverProc = null;
let serverPort = null;
let mainWindow = null;
let splashWindow = null;
let sidecarLog = null;
let versionInfo = null;

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
  return { shell: app.getVersion(), setsweep: 'dev' };
}

function resolveSidecar() {
  if (process.env.SETSWEEP_CMD) {
    return { cmd: process.env.SETSWEEP_CMD, args: ['--web'], bundled: false };
  }

  const bundled = path.join(process.resourcesPath || '', 'setsweep-sidecar', 'setsweep-sidecar');
  if (bundled && fs.existsSync(bundled)) {
    return { cmd: bundled, args: [], bundled: true };
  }

  return { cmd: SETSWEEP_CMD, args: ['--web'], bundled: false };
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
  };

  if (resolveSidecar().bundled) {
    env.DESK_PROJECTS = path.join(app.getPath('userData'), 'projects.json');
  }

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
  process.stdout.write(`[setsweep] ${chunk}`);
  if (sidecarLog && !sidecarLog.destroyed) sidecarLog.write(chunk);
}

function waitForPort(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = new net.Socket();
      const done = (ok, err) => {
        sock.destroy();
        if (ok) return resolve();
        if (Date.now() >= deadline) {
          return reject(err || new Error('Timed out waiting for the setsweep server to start'));
        }
        setTimeout(tryOnce, 150);
      };
      sock.setTimeout(500);
      sock.once('connect', () => done(true));
      sock.once('timeout', () => done(false));
      sock.once('error', (e) => done(false, e));
      sock.connect(port, '127.0.0.1');
    };
    tryOnce();
  });
}

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

function killSidecar() {
  if (serverProc && !serverProc.killed) {
    try { serverProc.kill('SIGTERM'); } catch { /* already gone */ }
  }
  serverProc = null;
  serverPort = null;
}

function startSidecar(port) {
  const { cmd, args, bundled } = resolveSidecar();
  const spawnArgs = [...args, '--port', String(port), '--no-open'];

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

    proc.on('error', (err) => {
      const hint = bundled
        ? 'The bundled server failed to launch.'
        : 'Is `setsweep` on PATH? Try: which setsweep';
      fail(new Error(`Could not launch setsweep (${cmd}): ${err.message}\n\n${hint}`));
    });

    proc.stdout.on('data', (b) => logSidecar(b));
    proc.stderr.on('data', (b) => logSidecar(b));

    proc.on('exit', (code, sig) => {
      console.log(`[setsweep] sidecar exited code=${code} sig=${sig}`);
      serverProc = null;
      if (!settled && !app.isQuitting) {
        fail(new Error(`The setsweep server exited unexpectedly (code ${code}).`));
        return;
      }
      if (!app.isQuitting) app.quit();
    });

    waitForPort(port)
      .then(() => {
        if (settled) return;
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
  const appName = app.name || 'Setsweep';
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

function wireNavigation(win) {
  const isLocal = (u) => {
    try {
      const url = new URL(u);
      return url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    } catch { return false; }
  };

  win.webContents.on('will-navigate', (e, url) => {
    if (!isLocal(url)) { e.preventDefault(); shell.openExternal(url); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocal(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(
      "window.dispatchEvent(new Event('pywebviewready'));"
    ).catch(() => {});
  });
}

async function createWindow() {
  if (mainWindow) {
    mainWindow.focus();
    return;
  }

  createSplash();
  sidecarLog = openSidecarLog();

  serverPort = await findFreePort();
  await startSidecar(serverPort);

  const saved = loadWindowState();
  mainWindow = new BrowserWindow({
    title: 'Setsweep',
    ...saved,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  wireNavigation(mainWindow);

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow.show();
  });

  await mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
  mainWindow.on('close', () => saveWindowState(mainWindow));
  mainWindow.on('closed', () => {
    mainWindow = null;
    killSidecar();
  });
}

function showStartupError(err) {
  closeSplash();
  const bundled = resolveSidecar().bundled;
  const extra = bundled
    ? `Sidecar log: ${path.join(app.getPath('logs'), 'sidecar.log')}`
    : 'Is `setsweep` on PATH? Try: which setsweep';
  dialog.showErrorBox('Setsweep failed to start',
    `Could not launch the setsweep server.\n\n${err.message}\n\n${extra}`);
}

// IPC for folder picker (preload exposes this as window.pywebview.api.pick_folder).
ipcMain.handle('setsweep:pick-folder', async () => {
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
  app.setName('Setsweep');

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    versionInfo = loadVersionInfo();
    app.setAboutPanelOptions({
      applicationName: 'Setsweep',
      applicationVersion: versionInfo.shell,
      version: `Setsweep server ${versionInfo.setsweep}`,
      copyright: 'Charles Berret',
    });

    buildMenu();
    try {
      await createWindow();
      console.log(`[shell] window loaded http://127.0.0.1:${serverPort}/`);
    } catch (err) {
      console.error('[shell] startup failed:', err);
      showStartupError(err);
      app.quit();
    }

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        try {
          await createWindow();
        } catch (err) {
          showStartupError(err);
          app.quit();
        }
      }
    });
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
    killSidecar();
    if (sidecarLog && !sidecarLog.destroyed) sidecarLog.end();
  });

  // Single-window app: closing the window quits and tears down the sidecar.
  app.on('window-all-closed', () => {
    app.quit();
  });
}
