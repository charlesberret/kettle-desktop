// Electron shell for setsweep. Spawns the existing Python server (`setsweep --web`)
// as a sidecar, waits for it to bind, then loads its localhost URL in a BrowserWindow.
// The frontend (static/index.html) is unchanged — preload.js shims window.pywebview.api.

const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const SETSWEEP_CMD = process.env.SETSWEEP_CMD || 'setsweep';

let serverProc = null;
let serverPort = null;
let mainWindow = null;

function waitForPort(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = new net.Socket();
      const done = (ok, err) => {
        sock.destroy();
        if (ok) return resolve();
        if (Date.now() >= deadline) return reject(err || new Error('port wait timeout'));
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

async function startSidecar(port) {
  // PATH from a GUI launch on macOS doesn't include Homebrew/pyenv; widen it so
  // `setsweep` resolves whether it's installed via brew, pyenv, or pipx.
  const PATH = [
    process.env.PATH || '',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(process.env.HOME || '', '.local/bin'),
    path.join(process.env.HOME || '', '.pyenv/shims'),
  ].filter(Boolean).join(':');

  const proc = spawn(SETSWEEP_CMD, ['--web', '--port', String(port), '--no-open'], {
    env: { ...process.env, PATH, PYTHONUNBUFFERED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout.on('data', (b) => process.stdout.write(`[setsweep] ${b}`));
  proc.stderr.on('data', (b) => process.stderr.write(`[setsweep] ${b}`));
  proc.on('exit', (code, sig) => {
    console.log(`[setsweep] sidecar exited code=${code} sig=${sig}`);
    if (!app.isQuitting) app.quit();
  });

  await waitForPort(port);
  return proc;
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

async function createWindow() {
  serverPort = await findFreePort();
  serverProc = await startSidecar(serverPort);

  mainWindow = new BrowserWindow({
    title: 'Setsweep',
    width: 1560,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Off-localhost links bounce to the system browser — never navigate the shell.
  const isLocal = (u) => {
    try {
      const url = new URL(u);
      return url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    } catch { return false; }
  };

  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!isLocal(url)) { e.preventDefault(); shell.openExternal(url); }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocal(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
  mainWindow.on('closed', () => { mainWindow = null; });
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
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    console.log('[shell] app ready');
    buildMenu();
    try {
      console.log('[shell] picking port + spawning sidecar');
      await createWindow();
      console.log(`[shell] window loaded http://127.0.0.1:${serverPort}/`);
    } catch (err) {
      console.error('[shell] startup failed:', err);
      dialog.showErrorBox('Setsweep failed to start',
        `Could not launch the setsweep server.\n\n${err.message}\n\n` +
        `Is \`setsweep\` on PATH? Try: which setsweep`);
      app.quit();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
    if (serverProc && !serverProc.killed) {
      try { serverProc.kill('SIGTERM'); } catch {}
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
