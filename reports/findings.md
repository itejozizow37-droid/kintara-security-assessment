# Verified Findings — Kintara.gg

## F-001: Resource Fabrication via save-backpack (VERIFIED)
**Severity:** High  
**Path:** POST /api/auth/save-backpack  
**Evidence:** Raw HTTP request/response

### Description
The save-backpack endpoint accepts resource values up to `_srvAuthGrantProtectedMin` without server-side validation. Any resource with a non-zero protectedMin can be fabricated at will.

### Proof
```
POST /api/auth/save-backpack
Cookie: __Host-kintara_session=...
{
  "resources": {"wood": 59, "stone": 11, "coal": 4, "potion_health": 3},
  "invSlots": [...items...],
  "baseSeq": 269,
  "intentionalRemovals": []
}

Response 200:
{
  "ok": true,
  "backpack": {"wood": 59, "stone": 11, "coal": 4, "potion_health": 3, ...}
}
```

### Impact
- Infinite potion_health (protectedMin=3 → restore to 3 on every save)
- Wood, stone, coal fabricatable up to protectedMin
- Resources can be used for alchemy (potion crafting), blacksmith, merchant

### Remediation
Server-side validation: resources must be earned through gameplay, not set via client body.

---

## F-002: protectedMin Growth via harv_hit multiplier (DISPROVED / RETIRED)
**Severity:** None  
**Path:** WebSocket harv_hit message  
**Evidence:** Live retest

### Description
Old candidate claimed `harv_hit` with `n=50000` multiplies grant and grows `protectedMin`. Live retest: server validates `n`, accepts only the in-game reward path, and refuses over-large multipliers. The `felled=false` case does not grow `protectedMin` with the rejected payload.

### Retest Evidence
```
Attempted n=50000: blocked server-side, felled=false, h=0/99
Result: no protectedMin growth, no resource grant.
```

### Impact
No exploit. Keep retired to avoid re-testing.

---

## F-003: Daily Quest Progress Separated from Backpack (VERIFIED)
**Severity:** Medium  
**Path:** N/A (server behavior)  
**Evidence:** Multiple state observations

### Description
Daily quest progress for "Farm 1900 wood" shows 239/1900 despite backpack wood being 0 (after alchemist purchases). Quest progress is cumulative and independent of current backpack state.

### Impact
- Progress is NOT lost when resources are spent
- Once quest reaches 1900 (through harv_hit growth), it stays complete
- Can claim reward without holding 1900 wood simultaneously

---

## F-004: Casino Blackjack Substitution Bug (DISPROVED / RETIRED)
**Severity:** None  
**Path:** POST /api/auth/casino-blackjack-debit  
**Evidence:** Live authenticated tests after obtaining gold

### Description
Old candidate said blackjack bet was counted as gold but deducted from wood. Live tests disproved this: `casino-blackjack-debit {amount:1, initRound:true}` deducted `gold` by 1 and left `wood` unchanged.

### Retest Evidence
```
Before: gold=5, wood=1382
POST /api/auth/casino-blackjack-debit {"amount":1,"initRound":true}
After debit: gold=4, wood=1382

Later checks:
- save-backpack cannot restore gold after debit; submitted gold=current+1 or pre-debit gold normalizes to server current gold.
- blackjack action `double` ignores injected `extraStake`/`amount`; it charged the normal extra stake.
- concurrent debit x2 is atomic: one 200, one `round_in_progress`.
```

### Impact
No exploit from this candidate. Keep retired to avoid re-testing.

---

## F-005: Action Proof HMAC Verification (VERIFIED)
**Severity:** Medium  
**Path:** WebSocket harv_hit actionProof  
**Evidence:** Decoded proof

### Description
Action proof format: `base64(payload).base64(signature)` where payload contains `{a: playerId, exp, iat, k: 'harvest.hit', n: nonce, s: {keys, kind, region, hasCoal, hasMetal}, v: 1}`. Server verifies `s.a === playerId || s.a === n(500)` — HMAC-signed, cannot forge without key.

### Decoded Proof
```json
{
  "a": 28018,
  "exp": 1783599297025,
  "iat": 1783599237025,
  "k": "harvest.hit",
  "n": "KK3eLTwtTL4_MV6vt5YUZw",
  "s": {
    "hasCoal": 0,
    "hasMetal": 0,
    "keys": ["15,37"],
    "kind": "tree",
    "region": "world"
  },
  "v": 1
}
```

### Impact
Cannot forge harvest hits without HMAC key. Limits automated resource generation.

---

## F-006: Cross-Region Access via WebSocket (VERIFIED)
**Severity:** Medium  
**Path:** WS setRegion  
**Evidence:** Working PoC for 15+ regions

### Description
Player can enter any game region without physical portal contact by sending `pos` with target region via WebSocket. Works for: wild, pond, casino, bankShop, clothShop, petShop, furnitureShop, alchemistShop, blacksmithShop, mine, beach, ember, frostmere.

### Proof
```
setRegion('casino', 10, 4) → region_ack: casino
setRegion('bankShop', 5, 4) → region_ack: bankShop
```

### Impact
- Bypasses portal requirements
- Interior shops accessible without walking
- Casino accessible directly (no level or location check for entry)

---

## F-007: Project Root Metadata Exposure via Static ACL Gap (VERIFIED)
**Severity:** Medium  
**Paths:** `GET /README.md`, `GET /Dockerfile` on `kintara.gg` and `fanout.kintara.gg`  
**Evidence:** Live HTTP responses from 2026-07-09

### Description
The public static surface partially exposes project-root files while blocking adjacent sensitive files. This indicates a denylist-style static ACL rather than a strict public-directory allowlist.

### Proof
```
GET https://kintara.gg/README.md       -> 200 text/plain len=919
GET https://kintara.gg/Dockerfile      -> 200 text/plain len=4486
GET https://fanout.kintara.gg/README.md  -> 200 text/plain len=919
GET https://fanout.kintara.gg/Dockerfile -> 200 text/plain len=1314

GET /package.json      -> 403
GET /package-lock.json -> 403
GET /server.js         -> 403
GET /server.cjs        -> 403
GET /.env              -> 403
GET /.npmrc            -> 403
GET /.dockerignore     -> 403
```

### Impact
- Exposes deployment platform and layout: Coolify, Node 24 Alpine, `WORKDIR /app`, `COPY . .`, `npm start`, boot-time client bundling via `src/build/minify-client.cjs`.
- Exposes secret/config variable names, including `KINTARA_SESSION_SECRET`, `SESSION_SECRET`, `KINTARA_PG_URL`, `KINTARA_PG_MIGRATE_URL`, `REDIS_URL`, `KINTARA_REDIS_URL`, `ADMIN_WALLETS`, `KINTARA_ADMIN_WALLETS`, `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`, `SOLANA_RPC_URL`, `KINTARA_GAME_TOKEN_RPC_URL`, `KINTARA_GAME_TOKEN_TREASURY`, and rate-limit/fanout flags.
- Confirms static is not restricted to a minimal build/public directory.

### Remediation
Serve only a dedicated public asset directory. Use a positive allowlist for public client assets and deny all project-root files by default.

---

## F-008: Authenticated Club Quote Leaks Usable QuickNode RPC URL (VERIFIED)
**Severity:** Medium / High depending RPC billing and method policy  
**Path:** `POST /api/club/quote`  
**Evidence:** Live authenticated request and direct RPC calls, 2026-07-09

### Description
Any authenticated eligible player can request a club membership quote. The response includes `rpcEndpointPublic` with a full QuickNode Solana mainnet RPC URL containing the project token. The returned URL is directly usable outside the Kintara session context.

### Proof
```
POST /api/club/quote
Cookie: __Host-kintara_session=...
Body: {"tier":"1m"}

HTTP 200
{
  "ok": true,
  "rpcEndpointPublic": "https://summer-burned-sound.solana-mainnet.quiknode.pro/[REDACTED]",
  "quote": {
    "quoteId": "...",
    "tier": "1m",
    "treasury": "4zW4zuZb9rXpvw3cTYyGoQ2iHTtG9E17YpdeNUbwuQVt",
    "lamports": "256473505",
    "priceUsd": 19.99
  }
}
```

Direct calls to the leaked endpoint without Kintara cookies succeeded:
```
POST [REDACTED_QUICKNODE_URL]
{"jsonrpc":"2.0","id":1,"method":"getHealth","params":[]}
-> 200 {"result":"ok"}

POST [REDACTED_QUICKNODE_URL]
{"jsonrpc":"2.0","id":1,"method":"getLatestBlockhash","params":[{"commitment":"finalized"}]}
-> 200 with valid blockhash

POST [REDACTED_QUICKNODE_URL]
{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["6Pwv...G4M"]}
-> 200 with balance

POST [REDACTED_QUICKNODE_URL]
{"jsonrpc":"2.0","id":1,"method":"sendTransaction","params":["bad"]}
-> 200 with Solana transaction deserialization error, meaning the method is reachable and not provider-blocked
```

### Impact
- Exposes a billable third-party RPC credential to any authenticated eligible user.
- Allows quota consumption and direct Solana mainnet RPC reads outside the app.
- The endpoint accepts the `sendTransaction` method path, so attackers can use Kintara's RPC quota for transaction broadcast attempts as well as reads.

### Remediation
Do not return provider-tokenized RPC URLs to clients. Keep RPC access behind `/api/auth/solana-json-rpc` with a strict method allowlist, or issue a separate origin/rate-restricted public endpoint with minimal scope.

---

## F-009: Unbounded Immutable Cache Keys via Hashed Game Alias (VERIFIED)
**Severity:** Low / availability
**Paths:** `GET /game.<16-lowercase-hex>.js` on `kintara.gg` and `fanout.kintara.gg`
**Evidence:** Live cache miss-to-hit sequence, 2026-07-10

### Description
The server accepts any 16-character lowercase hexadecimal suffix on the `game` JavaScript path, even when it is not the bundle content hash. Each accepted alias returns the current host-specific game bundle with a one-year immutable public cache policy. This creates an effectively unbounded set of CDN cache keys and cold origin fetches for the same multi-megabyte asset.

### Proof
```
GET /game.63fa4ef5e88c1e9b.js
Accept-Encoding: gzip
-> 200
CF-Cache-Status: MISS
Cache-Control: public, max-age=31536000, immutable
Vary: Accept-Encoding
Content-Encoding: gzip

GET /game.63fa4ef5e88c1e9b.js
Accept-Encoding: identity
-> 200
CF-Cache-Status: HIT
Cache-Control: public, max-age=31536000, immutable
body: current main game bundle (3,476,610 bytes)

GET /game.deadbeefdeadbeef.js
-> 200 current game bundle on each host

GET /game.abc.js
-> 404
```

The known `game.406ff6c72be54f45.js` is a real retained historical bundle on main. Other valid-looking 16-hex aliases resolve to the current bundle, so the alias matcher is not validating that the supplied suffix equals the content hash.

The same custom resolver accepts arbitrary non-dot prefixes ending in `/game.js`, including `/admin/game.js`, `/x/y/game.js`, and `/package.json/game.js`; all return the current game bundle. It does not resolve prefixed non-game modules or protected targets.

### Impact
- Attackers can generate arbitrary distinct cache keys for a large JavaScript object, increasing edge cache cardinality and causing repeated origin fetch/compression work on cold aliases.
- Existing release artifacts remain distinguishable when a real historical hash is known.
- Arbitrary game-path prefixes add non-canonical route keys, though they are served with `no-cache` rather than the immutable hash-alias policy.
- No protected file read or `Accept-Encoding` cache poisoning was observed: `Vary: Accept-Encoding` correctly separates gzip and identity representations.

### Remediation
Serve only the canonical content-hash filename(s) emitted by the build manifest. Reject unmatched hashes rather than falling back to the current bundle, and use a bounded redirect or canonical URL for legacy asset names.

---

## F-010: Fanout World-Chat Auth Inconsistency (RETIRED: Equivalent Public Spectator Feed)
**Severity:** None
**Path:** `GET https://fanout.kintara.gg/api/world/chat?after=0&region=global&shard=<id>`
**Evidence:** Anonymous coordinator-versus-fanout differential, 2026-07-10

### Description
The coordinator requires authentication for `/api/world/chat`, while fanout serves its global-chat read path anonymously. Follow-up source and live checks established that the coordinator already offers the same category of global chat data anonymously through `/api/spectate/chat` and `/api/spectate/chat/bootstrap` for spectator mode.

### Proof
```
GET https://kintara.gg/api/world/chat?after=0&region=global&shard=1
-> 401 {"ok":false,"error":"unauthorized"}

GET https://fanout.kintara.gg/api/world/chat?after=0&region=global&shard=1
-> 200 {"ok":true,"maxId":426176,"shardId":1,"messages":[...]}
```

Each record includes `id`, `playerId`, `shardId`, `displayName`, `walletPubkey`, `region`, `worldX`, `worldZ`, `message`, and `createdAtMs`.

The unauthenticated request was repeatable. A metadata-only scan of the 31 advertised shards found 16 shards returning 20 records each; the others returned `503 fanout_unavailable`. `/api/world/chat/bootstrap?region=global&shard=1` leaks the same data. The endpoint is `Cache-Control: no-store` and Cloudflare marks it dynamic.

### Retest Evidence
```
GET https://kintara.gg/api/spectate/chat/bootstrap?region=global&shard=1
-> 200 with the same 4,130-byte response hash as fanout bare /api/world/chat

GET https://kintara.gg/api/spectate/chat?after=0&region=global&shard=1
-> 200 with a larger public spectator chat response
```

The client bundle's spectator flow explicitly calls these routes without credentials. Fanout's `/api/world/chat` route remains a naming/auth-policy inconsistency, but it does not create a new data disclosure under the observed public spectator policy.

### Recommendation
Use the explicit `/api/spectate/chat*` routes for anonymous consumption and align fanout route naming/auth middleware with that policy to avoid future divergence. Any privacy issue in the shared chat fields is a spectator-feature policy question, not a fanout-only bypass.

---

## F-011: Remote Wild Bag Loot via Client-Controlled Presence Position (VERIFIED)
**Severity:** High  
**Paths:** `WS /ws/presence/s<shard>` and `POST /api/wild/loot-bag`

### Description
The loot endpoint uses the server's current presence position for its distance check, but the presence hub accepts a client-supplied `pos` frame as that position without validating movement, travel path, or a server-authoritative coordinate. An authenticated player can join a shard, announce the exact tile of an active foreign ground bag, then claim it immediately.

`GET /api/wild/ground-bags?shard=<n>` makes target selection easier by returning arbitrary-shard bag IDs, foreign victim IDs, positions, expiry, and item contents without an established presence context.

### Proof
```
GET /api/wild/ground-bags?shard=10
-> 200; selected active foreign bag:
   victimId: 33096
   bagId: wb-mretboon-b4bfc412013ca280
   region: wild
   tile: col=42, row=14
   items: [{t:"wild_sword", n:1}]

WS /ws/queue/s10
-> {"t":"queue_ready"}

WS /ws/presence/s10
send {"t":"pos","region":"wild","x":17.5,"y":0.25,"z":-10.5,...}
-> {"t":"region_ack","region":"wild"}

POST /api/wild/loot-bag
{"bagId":"wb-mretboon-b4bfc412013ca280","shard":10,
 "col":42,"row":14,"realm":"wild","takeAll":true}
-> 200 {"ok":true,"backpack":{...,"invSlots":[...,{"t":"wild_sword","n":1},...]},"stateSeq":2566}
```

The authorized test account state sequence advanced from `2565` to `2566`. A preceding direct claim without a position/presence context was rejected with `400 {"error":"bad_pos"}` and did not advance state, confirming that the spoofed position is the bypassed enforcement boundary.

### Impact
- Any authenticated player meeting the normal `$KINS` login gate can take active PvP tombstones anywhere in a joinable shard without travelling to them.
- The attacker can target valuable drops using the arbitrary-shard bag enumeration response and repeat claims while bags remain active.
- This removes the intended spatial risk and enables direct theft of carried player items.

### Remediation
Maintain server-authoritative player coordinates and movement history. Reject position deltas that exceed a bounded distance per elapsed server time, and perform loot distance checks against that authoritative state. Restrict ground-bag listing to the authenticated player's active shard and visible realm, returning only rendering data required for nearby bags.
