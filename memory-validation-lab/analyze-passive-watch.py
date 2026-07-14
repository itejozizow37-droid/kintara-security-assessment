from __future__ import annotations
import csv, json, sys
from pathlib import Path

if len(sys.argv) < 2:
    raise SystemExit('Usage: python3 analyze-passive-watch.py <watch.csv>')
rows=list(csv.DictReader(Path(sys.argv[1]).open('r', encoding='utf-8', errors='replace')))
if not rows:
    raise SystemExit('No rows')

def f(x, default=0.0):
    try: return float(x)
    except Exception: return default

def i(x, default=0):
    try: return int(x)
    except Exception: return default

pid_changes=[]; started_changes=[]; restart_increases=[]; timeouts=[]; slow=[]; oom=[]
for idx,r in enumerate(rows):
    if str(r.get('oom_killed','')).lower()=='true': oom.append(r['timestamp'])
    code=r.get('ready_code','')
    rt=f(r.get('ready_time_s'))
    if code=='000': timeouts.append(r['timestamp'])
    elif rt>=1.0: slow.append({'timestamp':r['timestamp'],'seconds':rt,'code':code})
    if idx:
        p=rows[idx-1]
        if r.get('pid') != p.get('pid'): pid_changes.append({'at':r['timestamp'],'from':p.get('pid'),'to':r.get('pid')})
        if r.get('started_at') != p.get('started_at'): started_changes.append({'at':r['timestamp'],'from':p.get('started_at'),'to':r.get('started_at')})
        if i(r.get('restart_count')) > i(p.get('restart_count')):
            restart_increases.append({'at':r['timestamp'],'from':i(p.get('restart_count')),'to':i(r.get('restart_count'))})

same_process_outage=[]
for r in rows:
    if r.get('ready_code')=='000':
        same_process_outage.append({'timestamp':r['timestamp'],'pid':r.get('pid'),'startedAt':r.get('started_at')})

verdict=[]
if restart_increases or pid_changes or started_changes:
    verdict.append('restart-observed')
if oom:
    verdict.append('container-oom-kill-observed')
if timeouts and not (restart_increases or pid_changes or started_changes):
    verdict.append('readiness-outage-without-restart-signals')
if not verdict:
    verdict.append('no-restart-or-outage-observed')

print(json.dumps({
    'rows':len(rows),
    'verdict':verdict,
    'pidChanges':pid_changes,
    'startedAtChanges':started_changes,
    'restartCountIncreases':restart_increases,
    'oomKilledSamples':oom,
    'readyTimeouts':timeouts,
    'slowReadyResponses':slow,
    'sameProcessOutageSamples':same_process_outage,
}, indent=2))
