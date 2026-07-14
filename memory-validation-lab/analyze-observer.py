from __future__ import annotations
import json, sys
from pathlib import Path

if len(sys.argv) < 2:
    raise SystemExit('Usage: python3 analyze-observer.py <memory-observer.ndjson>')
rows=[]
for line in Path(sys.argv[1]).read_text('utf-8', errors='replace').splitlines():
    try:
        r=json.loads(line)
        if r.get('event')=='sample': rows.append(r)
    except Exception: pass
if not rows:
    raise SystemExit('No sample rows')
base=rows[0]
peak=max(rows, key=lambda r:r['rss'])
heap_peak=max(rows, key=lambda r:r['heapUsed'])
ext_peak=max(rows, key=lambda r:r['external'])
loop_peak=max(rows, key=lambda r:r['eventLoopMaxMs'])
print(json.dumps({
    'samples':len(rows),
    'baseline':{k:base[k] for k in ['rss','heapUsed','external','arrayBuffers']},
    'peakRss':peak['rss'],
    'peakHeapUsed':heap_peak['heapUsed'],
    'peakExternal':ext_peak['external'],
    'peakEventLoopMaxMs':loop_peak['eventLoopMaxMs'],
    'lastTopRoutes':rows[-1].get('topRoutes',[]),
    'lastOpenUpgrades':rows[-1].get('openUpgrades',[]),
}, indent=2))
