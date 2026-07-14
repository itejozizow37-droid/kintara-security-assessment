'use strict';

// Staging-only memory and route observer.
// It logs metrics and route activity. It does not read or print environment values.

const fs = require('node:fs');
const http = require('node:http');
const { monitorEventLoopDelay } = require('node:perf_hooks');

const intervalMs = Math.max(250, Number(process.env.KINTARA_OBSERVER_INTERVAL_MS || 1000));
const outputPath = process.env.KINTARA_OBSERVER_LOG || '/tmp/kintara-memory-observer.ndjson';
const stream = fs.createWriteStream(outputPath, { flags: 'a', mode: 0o600 });
const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();

const counters = new Map();
const inflight = new Map();
const upgrades = new Map();

function normalizePath(raw) {
  try {
    const u = new URL(raw || '/', 'http://127.0.0.1');
    return u.pathname
      .replace(/\/s\d+(?=\/|$)/g, '/s:shard')
      .replace(/\b\d{4,}\b/g, ':id');
  } catch {
    return '/invalid-url';
  }
}

function bump(map, key, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
  if (map.get(key) <= 0) map.delete(key);
}

function top(map, limit = 15) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function write(obj) {
  stream.write(JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n');
}

const originalEmit = http.Server.prototype.emit;
http.Server.prototype.emit = function patchedEmit(event, ...args) {
  if (event === 'request') {
    const req = args[0];
    const res = args[1];
    const route = normalizePath(req && req.url);
    bump(counters, route);
    bump(inflight, route);
    const done = () => bump(inflight, route, -1);
    res.once('finish', done);
    res.once('close', done);
  } else if (event === 'upgrade') {
    const req = args[0];
    const socket = args[1];
    const route = normalizePath(req && req.url);
    bump(counters, `UPGRADE ${route}`);
    bump(upgrades, route);
    socket.once('close', () => bump(upgrades, route, -1));
    socket.once('error', () => bump(upgrades, route, -1));
  }
  return originalEmit.call(this, event, ...args);
};

function sample() {
  const m = process.memoryUsage();
  const handles = typeof process._getActiveHandles === 'function'
    ? process._getActiveHandles().reduce((acc, h) => {
        const k = h?.constructor?.name || 'Unknown';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {})
    : {};
  const requests = typeof process._getActiveRequests === 'function'
    ? process._getActiveRequests().length
    : null;

  write({
    event: 'sample',
    pid: process.pid,
    uptimeSec: Number(process.uptime().toFixed(3)),
    rss: m.rss,
    heapUsed: m.heapUsed,
    heapTotal: m.heapTotal,
    external: m.external,
    arrayBuffers: m.arrayBuffers,
    eventLoopMeanMs: Number((loop.mean / 1e6).toFixed(3)),
    eventLoopP99Ms: Number((loop.percentile(99) / 1e6).toFixed(3)),
    eventLoopMaxMs: Number((loop.max / 1e6).toFixed(3)),
    activeRequests: requests,
    activeHandles: handles,
    topRoutes: top(counters),
    inflightRoutes: top(inflight),
    openUpgrades: top(upgrades),
  });
  loop.reset();
}

write({ event: 'observer-start', pid: process.pid, node: process.version, intervalMs, outputPath });
const timer = setInterval(sample, intervalMs);
timer.unref();

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.once(sig, () => {
    write({ event: 'observer-stop', signal: sig, pid: process.pid });
    stream.end(() => process.kill(process.pid, sig));
  });
}
