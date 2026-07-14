# Kintara: следующий этап проверки

## Что уже доказано локально

1. Heap snapshot блокирует event loop и создаёт краткую недоступность.
2. Snapshot может содержать session/config strings.
3. Node может сначала записать snapshot, затем завершиться по OOM.
4. Собственный dump/exit watchdog воспроизводит паузу и последующий exit.
5. Удержание JavaScript-объектов повышает `heapUsed`.
6. Удержание `Buffer`/compressed frames повышает `external`, `arrayBuffers` и RSS при почти стабильном `heapUsed`.
7. Удержание соединений повышает connection count без обязательного большого роста памяти.

## Новая сильная гипотеза

Публичный Dockerfile содержит одновременно:

- `KINTARA_COORD_HEAPDUMP_MB`
- `KINTARA_COORD_HEAP_EXIT_MB`
- `KINTARA_COORD_CONN_EXIT`
- `KINTARA_SNAP_AB_CEILING`
- `KINTARA_SNAP_AB_KILL`
- `KINTARA_SNAP_HZ`
- `KINTARA_WS_DEFLATE`
- `KINTARA_WS_DEFLATE_THRESHOLD`
- `KINTARA_GZIP_BIG_BROADCASTS`

Это делает WebSocket snapshot/broadcast ветку сильнее обычного HTTP endpoint. `AB` наиболее естественно соответствует ArrayBuffer, поэтому возможен рост `external/arrayBuffers/RSS`, а не только V8 `heapUsed`.

## Приоритет кандидатов для staging

1. `/ws/spectate/sN`
   - анонимное долгоживущее соединение;
   - повторяющиеся snapshot-сообщения;
   - reconnect-логика;
   - вероятный потребитель snapshot serialization/compression.
2. `/ws/presence/sN`
   - долгоживущее authenticated соединение;
   - per-player/per-shard state;
   - snapshot и event broadcast.
3. `/ws/queue/sN`
   - кандидат на `KINTARA_COORD_CONN_EXIT` и незакрытые connection records.
4. `/ws/merchant`
   - публичное fanout-соединение с reconnect.
5. `/api/spectate/chat*`
   - polling/read path; ниже по вероятности для retained state.
6. Hashed game aliases
   - известный availability/cache-key риск, но слабее как причина retained process memory.

## Шаг 1. Узнать реальные пороги без раскрытия секретов

```bash
./kintara-thresholds-readonly.sh <container>
```

Скрипт показывает только memory/connection/snapshot-параметры и состояние контейнера.

## Шаг 2. Отличить паузу от перезапуска на production

```bash
INTERVAL=5 DURATION=900 \
./kintara-passive-container-watch.sh <container> https://kintara.gg/ready
```

Затем:

```bash
python3 analyze-passive-watch.py kintara-passive-watch-*.csv
```

Интерпретация:

- timeout/медленный `/ready`, PID и StartedAt не изменились: процесс зависал, но не перезапускался;
- PID/StartedAt изменились или RestartCount вырос: был restart;
- `OOMKilled=true`: cgroup/container OOM kill;
- exit без `OOMKilled`: вероятнее application watchdog или V8 abort внутри контейнера.

## Шаг 3. Определить route и тип памяти на staging

Запуск приложения с observer:

```bash
NODE_OPTIONS="--require=/app/tools/kintara-memory-observer.cjs" \
KINTARA_OBSERVER_LOG=/tmp/kintara-memory-observer.ndjson \
npm start
```

Низкоинтенсивный последовательный profiler:

```bash
node kintara-staging-route-profiler.js \
  https://staging.example.com routes.example.json \
  /tmp/route-profiler.ndjson
```

Проверяется по одному маршруту, с паузой между ними. Production-хосты profiler блокирует.

### Как читать результат

- `heapUsed` растёт после закрытия маршрута и не возвращается: retained JS state/map/listeners.
- `external` и `arrayBuffers` растут, `heapUsed` почти стабилен: retained Buffer, compression queue или unsent WS frames.
- RSS растёт при стабильных heap/external: native allocator, zlib/native library или fragmentation.
- `openUpgrades` растёт и не падает после закрытия: connection cleanup leak.
- Event-loop latency растёт без retained memory: CPU/serialization/compression bottleneck, а не memory leak.

## Запрещённый этап на production

Не создавать искусственно сотни соединений, не разгонять память и не инициировать heap snapshot. Production используется только для пассивной телеметрии. Активное сравнение маршрутов проводится на staging или точном локальном клоне.
