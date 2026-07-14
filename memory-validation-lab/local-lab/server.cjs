'use strict';
const http = require('node:http');
const net = require('node:net');
const { monitorEventLoopDelay } = require('node:perf_hooks');

const heapStore = [];
const bufferStore = [];
const sockets = new Set();
const hist = monitorEventLoopDelay({ resolution: 20 });
hist.enable();

function mem() {
  const m = process.memoryUsage();
  return {
    ts: new Date().toISOString(),
    pid: process.pid,
    uptime: process.uptime(),
    rss: m.rss,
    heapUsed: m.heapUsed,
    heapTotal: m.heapTotal,
    external: m.external,
    arrayBuffers: m.arrayBuffers,
    tcpConnections: sockets.size,
    heapItems: heapStore.length,
    bufferItems: bufferStore.length,
    eventLoopP99Ms: Number(hist.percentile(99) / 1e6),
  };
}

function allocHeapMiB(mib) {
  // Distinct JS strings retained in V8 heap.
  const target = Math.max(1, Math.floor(mib * 1024));
  const arr = [];
  for (let i = 0; i < target; i++) {
    arr.push(`${Date.now()}-${i}-` + 'x'.repeat(900));
  }
  heapStore.push(arr);
}

function allocBufferMiB(mib) {
  const b = Buffer.alloc(Math.max(1, Math.floor(mib * 1024 * 1024)), 0x41);
  bufferStore.push(b);
}

const httpServer = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const mib = Math.min(8, Math.max(1, Number(u.searchParams.get('mib') || 2)));
  if (u.pathname === '/heap-retain') allocHeapMiB(mib);
  else if (u.pathname === '/rss-retain') allocBufferMiB(mib);
  else if (u.pathname === '/release') { heapStore.length = 0; bufferStore.length = 0; if (global.gc) global.gc(); }
  else if (u.pathname !== '/metrics' && u.pathname !== '/ready') { res.writeHead(404); res.end('not found'); return; }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(mem()));
});

const tcpServer = net.createServer((sock) => {
  sockets.add(sock);
  sock.on('close', () => sockets.delete(sock));
  sock.on('error', () => sockets.delete(sock));
});

httpServer.listen(0, '127.0.0.1', () => {
  tcpServer.listen(0, '127.0.0.1', () => {
    console.log(JSON.stringify({ event: 'ready', httpPort: httpServer.address().port, tcpPort: tcpServer.address().port, pid: process.pid }));
  });
});

setInterval(() => console.log(JSON.stringify({ event: 'sample', ...mem() })), 500).unref();
