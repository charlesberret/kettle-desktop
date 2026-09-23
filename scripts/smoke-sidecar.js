#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const compatibility = require('../kettle-compatibility.json');
const { validateCoreIndex, validateCorePing } = require('../lib/core-contract');

const ROOT = path.resolve(__dirname, '..');
const SIDECAR = process.env.KETTLE_SIDECAR
  || path.join(ROOT, 'resources', 'kettle-sidecar', 'kettle-sidecar');
const TIMEOUT_MS = Number(process.env.KETTLE_SMOKE_TIMEOUT_MS || 15000);
const VERSION_PATH = process.env.KETTLE_VERSION_INFO
  || path.join(ROOT, 'resources', 'version.json');

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

function request(pathname, port, token) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      timeout: 1000,
      // Every /api/ route requires the per-boot token (kettle-core
      // docs/AUTH-TOKEN.md); without it the sidecar answers 403 and this smoke
      // waits out its deadline for a server that is perfectly healthy.
      headers: token ? { 'X-Kettle-Token': token } : {},
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`Timed out requesting ${pathname}`));
    });
    req.on('error', reject);
  });
}

/** Port and per-boot token, as every viewport reads them. */
function readDiscovery(home) {
  try {
    const raw = fs.readFileSync(path.join(home, '.cache', 'kettle', 'server.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function waitForPing(port, deadline, provenance, home) {
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const discovery = readDiscovery(home);
      const res = await request('/api/ping', port, discovery && discovery.token);
      if (res.statusCode === 200) {
        const body = JSON.parse(res.body.toString('utf8'));
        return validateCorePing(body, { port, compatibility, provenance });
      }
    } catch (err) {
      lastErr = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw lastErr || new Error('Timed out waiting for sidecar /api/ping');
}

async function main() {
  if (!fs.existsSync(SIDECAR)) {
    throw new Error(`Sidecar not found at ${SIDECAR}. Run npm run build:sidecar first.`);
  }
  if (!fs.existsSync(VERSION_PATH)) {
    throw new Error(`Version provenance not found at ${VERSION_PATH}. Run npm run build:sidecar first.`);
  }
  const provenance = JSON.parse(fs.readFileSync(VERSION_PATH, 'utf8'));

  const port = await findFreePort();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kettle-sidecar-smoke-'));
  const projectsPath = path.join(tmpDir, 'projects.json');
  fs.writeFileSync(projectsPath, `${JSON.stringify({ projects: [] }, null, 2)}\n`);

  // HOME inside the scratch dir: the sidecar writes ~/.cache/kettle/server.json on
  // bind, and inheriting the real HOME would overwrite the discovery record the
  // developer's live window and its viewports are using.
  const proc = spawn(SIDECAR, ['--port', String(port), '--no-open'], {
    env: {
      ...process.env,
      HOME: tmpDir,
      DESK_PROJECTS: projectsPath,
      PYTHONUNBUFFERED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  proc.stdout.on('data', (chunk) => { output += chunk.toString(); });
  proc.stderr.on('data', (chunk) => { output += chunk.toString(); });

  const exitPromise = new Promise((resolve) => {
    proc.on('exit', (code, signal) => resolve({ code, signal }));
  });

  try {
    const deadline = Date.now() + TIMEOUT_MS;
    const ping = await waitForPing(port, deadline, provenance, tmpDir);
    const root = await request('/', port);
    if (root.statusCode !== 200) {
      throw new Error(`Expected GET / to return 200, got ${root.statusCode}`);
    }
    validateCoreIndex(root.body, provenance);
    console.log(`sidecar smoke ok: pid=${ping.pid} port=${ping.port}`);
  } catch (err) {
    proc.kill('SIGTERM');
    const exited = await Promise.race([
      exitPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 1000)),
    ]);
    const status = exited ? `code=${exited.code} signal=${exited.signal}` : 'still running';
    throw new Error(`${err.message}\nsidecar status: ${status}\n${output.trim()}`);
  } finally {
    if (!proc.killed) proc.kill('SIGTERM');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
