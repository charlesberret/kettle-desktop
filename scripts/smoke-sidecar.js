#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SIDECAR = process.env.SETSWEEP_SIDECAR
  || path.join(ROOT, 'resources', 'setsweep-sidecar', 'setsweep-sidecar');
const TIMEOUT_MS = Number(process.env.SETSWEEP_SMOKE_TIMEOUT_MS || 15000);

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

function request(pathname, port) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      timeout: 1000,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`Timed out requesting ${pathname}`));
    });
    req.on('error', reject);
  });
}

async function waitForPing(port, deadline) {
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const res = await request('/api/ping', port);
      if (res.statusCode === 200) {
        const body = JSON.parse(res.body);
        if (body.app === 'setsweep' && body.port === port) return body;
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

  const port = await findFreePort();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setsweep-sidecar-smoke-'));
  const projectsPath = path.join(tmpDir, 'projects.json');
  fs.writeFileSync(projectsPath, `${JSON.stringify({ projects: [] }, null, 2)}\n`);

  const proc = spawn(SIDECAR, ['--port', String(port), '--no-open'], {
    env: {
      ...process.env,
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
    const ping = await waitForPing(port, deadline);
    const root = await request('/', port);
    if (root.statusCode !== 200) {
      throw new Error(`Expected GET / to return 200, got ${root.statusCode}`);
    }
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
