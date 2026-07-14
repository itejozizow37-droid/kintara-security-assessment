'use strict';
const zlib = require('node:zlib');

if (!global.gc) throw new Error('run with --expose-gc');

const clients = 20;
const rounds = 100;
const payloadObj = {
  t: 'snap', region: 'global', onlineTotal: 31,
  players: Array.from({length: 80}, (_,i)=>({id:i,x:i*1.1,z:i*2.2,name:`player-${i}`,'motto':'x'.repeat(80)})),
  npcs: Array.from({length: 60}, (_,i)=>({id:i,x:i,z:i*2,state:'idle',meta:'y'.repeat(80)})),
  res: Array.from({length: 100}, (_,i)=>({id:i,type:'tree',hp:100,extra:'z'.repeat(60)})),
  wear: {}, shacks: [], firepits: []
};
let payload = JSON.stringify(payloadObj);
while (Buffer.byteLength(payload) < 20000) payload += ' ';

function mem(label) {
  global.gc();
  const m = process.memoryUsage();
  return {label, rss:m.rss, heapUsed:m.heapUsed, heapTotal:m.heapTotal, external:m.external, arrayBuffers:m.arrayBuffers};
}
function delta(a,b){
  const o={label:b.label};
  for(const k of ['rss','heapUsed','external','arrayBuffers']) o[k]=b[k]-a[k];
  return o;
}

const result={node:process.version, clients, rounds, payloadBytes:Buffer.byteLength(payload), scenarios:{}};
const base=mem('baseline');

// Scenario 1: one compressed snapshot reused for all clients and discarded.
for(let r=0;r<rounds;r++){
  const compressed=zlib.gzipSync(payload);
  for(let c=0;c<clients;c++){
    // Simulate immediate send completion without retaining per-client copies.
    void compressed.length;
  }
}
const normal=mem('normal-reuse');
result.scenarios.normalReuse={absolute:normal, delta:delta(base,normal)};

// Scenario 2: retain one compressed Buffer per client per round (slow-client/backpressure queue model).
const queues=Array.from({length:clients},()=>[]);
for(let r=0;r<rounds;r++){
  for(let c=0;c<clients;c++) queues[c].push(zlib.gzipSync(payload));
}
const bufferLeak=mem('per-client-buffer-queues');
result.scenarios.perClientBufferQueues={absolute:bufferLeak, delta:delta(normal,bufferLeak), retainedBuffers:clients*rounds};

// Release queues.
for(const q of queues) q.length=0;
global.gc();
const released=mem('buffers-released');
result.scenarios.buffersReleased={absolute:released, delta:delta(bufferLeak,released)};

// Scenario 3: retain parsed object copies per client/round (server-side state map model).
const states=Array.from({length:clients},()=>[]);
for(let r=0;r<rounds;r++){
  for(let c=0;c<clients;c++) states[c].push(JSON.parse(payload));
}
const objectLeak=mem('per-client-object-state');
result.scenarios.perClientObjectState={absolute:objectLeak, delta:delta(released,objectLeak), retainedObjects:clients*rounds};

console.log(JSON.stringify(result,null,2));
