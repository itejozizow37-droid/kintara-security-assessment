#!/usr/bin/env bash
set -euo pipefail
CONTAINER="${1:-}"
if [[ -z "$CONTAINER" ]]; then
  echo "Usage: $0 <container-name-or-id>" >&2
  exit 2
fi

docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER" 2>/dev/null \
  | grep -E '^(NODE_OPTIONS|KINTARA_COORD_(HEAPDUMP_MB|HEAP_EXIT_MB|CONN_EXIT|WATCHDOG_DRAIN|REQ_TIMEOUT_OFF)|KINTARA_SNAP_(AB_CEILING|AB_KILL|HZ|DEDUP|DEDUP_V2|QUANTIZE|SKIP)|KINTARA_(WS_DEFLATE|WS_DEFLATE_THRESHOLD|GZIP_BIG_BROADCASTS|SHARD_WORKERS|SHARD_CAPACITY))=' \
  | sort

echo '--- process/container state ---'
docker inspect --format 'status={{.State.Status}} restartCount={{.RestartCount}} oomKilled={{.State.OOMKilled}} pid={{.State.Pid}} startedAt={{.State.StartedAt}}' "$CONTAINER"
