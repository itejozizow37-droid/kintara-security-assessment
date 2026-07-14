'use strict';

// Low-rate staging profiler. Refuses known production hosts.
// HTTP: one sequential GET per route. WebSocket: one connection at a time,
// at most two messages, then closes.

const fs = require('node:fs');
const { setTimeout: sleep } = require('node:timers/promises');

const base = process.argv[2] || 'http://127.0.0.1:3000';
const routesFile = process.argv[3];
const output = process.argv[4] || 'route-profiler.ndjson';
const delayMs = Math.max(1000, Number(process.env.PROFILER_DELAY_MS || 3000));

if (!routesFile) {
  console.error('Usage: node kintara-staging-route-profiler.js <base-url> <routes.json> [output.ndjson]');
  process.exit(2);
}

const host = new URL(base).hostname.toLowerCase();
if (host === 'kintara.gg' || host === 'fanout.kintara.gg' || host.endsWith('.kintara.gg')) {
  console.error('Refusing production Kintara host. Use localhost or a staging hostname.');
  process.exit(3);
}

const routes = JSON.parse(fs.readFileSync(routesFile, 'utf8'));
const out = fs.createWriteStream(output, { flags: 'a', mode: 0o600 });
const log = (x) => out.write(JSON.stringify({ ts: new Date().toISOString(), ...x }) + '\n');

async function httpProbe(route) {
  const url = new URL(route.path, base);
  const start = performance.now();
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000) });
    const body = await r.arrayBuffer();
    log({ event: 'http', label: route.label, path: route.path, status: r.status, bytes: body.byteLength, ms: performance.now() - start });
  } catch (e) {
    log({ event: 'http-error', label: route.label, path: route.path, error: String(e), ms: performance.now() - start });
  }
}

async function wsProbe(route) {
  let WebSocket;
  try { ({ WebSocket } = require('ws')); }
  catch { log({ event: 'ws-skip', label: route.label, reason: 'Install ws in staging: npm i -D ws' }); return; }

  const baseUrl = new URL(base);
  const proto = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${baseUrl.host}${route.path}`;
  await new Promise((resolve) => {
    const start = performance.now();
    let messages = 0;
    let bytes = 0;
    const ws = new WebSocket(url, { origin: base, handshakeTimeout: 5000 });
    const timer = setTimeout(() => { try { ws.close(); } catch {} resolve(); }, 5000);
    ws.on('open', () => {
      log({ event: 'ws-open', label: route.label, path: route.path, ms: performance.now() - start });
      if (route.register) ws.send(JSON.stringify(route.register));
    });
    ws.on('message', (d) => {
      messages += 1;
      bytes += Buffer.byteLength(d);
      if (messages >= 2) { clearTimeout(timer); ws.close(); }
    });
    ws.on('close', (code) => {
      clearTimeout(timer);
      log({ event: 'ws-close', label: route.label, path: route.path, code, messages, bytes, ms: performance.now() - start });
      resolve();
    });
    ws.on('unexpected-response', (_req, res) => {
      clearTimeout(timer);
      log({ event: 'ws-http-response', label: route.label, path: route.path, status: res.statusCode, ms: performance.now() - start });
      resolve();
    });
    ws.on('error', (e) => log({ event: 'ws-error', label: route.label, path: route.path, error: e.message }));
  });
}

(async () => {
  log({ event: 'run-start', base, delayMs, routeCount: routes.length });
  for (const route of routes) {
    log({ event: 'marker-before', label: route.label, path: route.path });
    if (route.type === 'ws') await wsProbe(route);
    else await httpProbe(route);
    log({ event: 'marker-after', label: route.label, path: route.path });
    await sleep(delayMs);
  }
  log({ event: 'run-end' });
  out.end();
})().catch((e) => {
  log({ event: 'fatal', error: String(e && e.stack || e) });
  out.end(() => process.exit(1));
});
