# Kintara next validation kit

This kit separates three questions:

1. Did V8 heap grow?
2. Did RSS/external memory grow while heap stayed stable?
3. Did active HTTP/WebSocket connections grow?

## A. Local classifier

The included `local-lab/` result demonstrates the metric fingerprints:

- retained JavaScript objects: `heapUsed` rises;
- retained `Buffer` objects: `external` and RSS rise while `heapUsed` stays nearly flat;
- held connections: connection count rises without a comparable memory increase.

## B. Staging instrumentation

Use only on staging or an exact local clone:

```bash
NODE_OPTIONS="--require=/app/tools/kintara-memory-observer.cjs" \
KINTARA_OBSERVER_LOG=/tmp/kintara-memory-observer.ndjson \
npm start
```

Then run the low-rate route profiler:

```bash
node kintara-staging-route-profiler.js \
  https://staging.example.com \
  routes.example.json \
  /tmp/route-profiler.ndjson
```

The profiler refuses `kintara.gg` and `fanout.kintara.gg`.

## C. Production passive observation

This makes only one `/ready` request per interval and reads Docker state:

```bash
INTERVAL=5 DURATION=900 \
./kintara-passive-container-watch.sh <container> https://kintara.gg/ready
```

Interpretation:

- readiness timeouts, unchanged PID/StartedAt/RestartCount: process paused;
- changed PID or StartedAt, increased RestartCount: process restarted;
- `OOMKilled=true`: container/cgroup OOM kill;
- memory rises but `heapUsed` stays stable in staging observer: RSS/external/native growth;
- `openUpgrades` rises with a route: connection-state candidate.

## Candidate routes from the public client

Prior external work identified these candidates for staging correlation:

- `/ws/spectate/s1`: anonymous recurring snapshots and reconnect behavior;
- `/ws/merchant`: public fanout WebSocket with reconnect behavior;
- `/ws/queue/sN` and `/ws/presence/sN`: authenticated long-lived connections;
- `/api/spectate/chat*`: public polling/read path.

A route is not a leak merely because it is long-lived. The observer must show memory or connection state that fails to return after the route closes.

## Additional files

- `kintara-thresholds-readonly.sh`: prints only non-secret threshold/config values.
- `analyze-passive-watch.py`: distinguishes restart, OOM kill and same-process outage.
- `VALIDATION_PLAN.md`: ordered production-passive and staging-active procedure.
- `ws-snapshot-memory-lab/`: local ArrayBuffer/RSS versus heap classification test.
