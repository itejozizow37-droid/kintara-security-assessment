#!/usr/bin/env bash
set -euo pipefail

CONTAINER="${1:-}"
READY_URL="${2:-https://kintara.gg/ready}"
INTERVAL="${INTERVAL:-5}"
DURATION="${DURATION:-900}"
OUT="${OUT:-kintara-passive-watch-$(date -u +%Y%m%dT%H%M%SZ).csv}"

if [[ -z "$CONTAINER" ]]; then
  echo "Usage: $0 <container-name-or-id> [ready-url]" >&2
  exit 2
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found" >&2
  exit 2
fi

printf '%s\n' 'timestamp,status,restart_count,oom_killed,pid,started_at,mem_usage,mem_percent,pids,ready_code,ready_time_s' > "$OUT"

end=$(( $(date +%s) + DURATION ))
while (( $(date +%s) < end )); do
  ts=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
  inspect=$(docker inspect --format '{{.State.Status}}|{{.RestartCount}}|{{.State.OOMKilled}}|{{.State.Pid}}|{{.State.StartedAt}}' "$CONTAINER" 2>/dev/null || printf 'missing|0|false|0|')
  stats=$(docker stats --no-stream --format '{{.MemUsage}}|{{.MemPerc}}|{{.PIDs}}' "$CONTAINER" 2>/dev/null || printf 'n/a|n/a|n/a')
  ready=$(curl -k -sS -o /dev/null --max-time 3 -w '%{http_code}|%{time_total}' "$READY_URL" 2>/dev/null || printf '000|3.000')
  IFS='|' read -r status restart oom pid started <<< "$inspect"
  IFS='|' read -r mem mempct pids <<< "$stats"
  IFS='|' read -r code rtime <<< "$ready"
  mem=${mem//,/;}
  printf '%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n' \
    "$ts" "$status" "$restart" "$oom" "$pid" "$started" "$mem" "$mempct" "$pids" "$code" "$rtime" >> "$OUT"
  sleep "$INTERVAL"
done

echo "$OUT"
