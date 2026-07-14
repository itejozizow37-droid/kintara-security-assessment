from __future__ import annotations
import json, os, socket, subprocess, sys, time, urllib.request
from pathlib import Path

lab = Path(__file__).resolve().parent
p = subprocess.Popen(
    ['node', '--expose-gc', str(lab/'server.cjs')],
    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1
)
assert p.stdout
ready = json.loads(p.stdout.readline())
http_port, tcp_port = ready['httpPort'], ready['tcpPort']

def get(path):
    with urllib.request.urlopen(f'http://127.0.0.1:{http_port}{path}', timeout=3) as r:
        return json.loads(r.read())

def snap(label):
    d = get('/metrics')
    d['label'] = label
    return d

results = {'node': subprocess.check_output(['node','-v'], text=True).strip(), 'ready': ready, 'samples': []}
results['samples'].append(snap('baseline'))

for i in range(3):
    results['samples'].append({**get('/heap-retain?mib=3'), 'label': f'heap-retain-{i+1}'})
    time.sleep(.3)

get('/release'); time.sleep(.5)
results['samples'].append(snap('after-release'))

for i in range(3):
    results['samples'].append({**get('/rss-retain?mib=3'), 'label': f'rss-retain-{i+1}'})
    time.sleep(.3)

socks=[]
for i in range(12):
    s=socket.create_connection(('127.0.0.1',tcp_port), timeout=2)
    socks.append(s)
    if i in (2,5,11):
        time.sleep(.1)
        results['samples'].append(snap(f'connections-{i+1}'))

for s in socks: s.close()
time.sleep(.5)
results['samples'].append(snap('connections-closed'))

# Drain a small amount of server samples for event-loop context.
server_samples=[]
start=time.time()
while time.time()-start<1.0:
    line=p.stdout.readline()
    if not line: break
    try: server_samples.append(json.loads(line))
    except Exception: pass
    if len(server_samples)>=5: break
results['serverSamples']=server_samples

p.terminate()
try: p.wait(timeout=3)
except subprocess.TimeoutExpired: p.kill()
results['exitCode']=p.returncode

# Classify deltas relative to baseline.
b=results['samples'][0]
for s in results['samples']:
    s['deltaRss']=s['rss']-b['rss']
    s['deltaHeapUsed']=s['heapUsed']-b['heapUsed']
    s['deltaExternal']=s['external']-b['external']
    s['deltaConnections']=s['tcpConnections']-b['tcpConnections']

out=lab/'result.json'
out.write_text(json.dumps(results, indent=2), encoding='utf-8')
print(out)
