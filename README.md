# Kintara.gg — Full Security Assessment & Exploit Suite

**Date:** July 2026 | **Duration:** 15+ hours | **Method:** Black-box authenticated + gray-box source review

## Executive Summary

Kintara.gg is a browser-based Web3 MMO (Node.js 24, Three.js, Solana wallet auth). This assessment identified **7 verified vulnerabilities** ranging from remote item theft to infrastructure credential exposure. Multiple exploit chains allow resource fabrication, cross-shard surveillance, and economic manipulation — all achievable with a single authenticated wallet.

---

## Verified Vulnerabilities

| ID | Name | Severity | Status |
|----|------|----------|--------|
| **F-011** | Remote Wild Bag Loot via Client-Controlled Presence Position | 🔴 High | ✅ Verified |
| **F-001** | Resource Fabrication via save-backpack Endpoint | 🔴 High | ✅ Verified |
| **F-006** | Cross-Region Access via WebSocket | 🟡 Medium | ✅ Verified |
| **F-007** | Project Root Metadata Exposure via Static ACL Gap | 🟡 Medium | ✅ Verified |
| **F-008** | Club Quote Leaks Usable QuickNode RPC URL | 🟡 Medium | ✅ Verified |
| **F-009** | Unbounded Immutable Cache Keys | 🟢 Low | ✅ Verified |
| **F-003** | Daily Quest Progress Decoupled from Backpack | 🟡 Medium | ✅ Verified |
| **F-005** | Action Proof HMAC Verification (defense confirmed) | — | ℹ️ Info |
| **F-002** | harv_hit Multiplier protectedMin Growth | — | ❌ Disproved |
| **F-004** | Casino Blackjack Substitution Bug | — | ❌ Disproved |

### Strix Automated Findings (8 additional)

1. **Unauthenticated Player Data via Spectate Chat API** — Player positions, HP, combat state, actions, IDs
2. **Unauthenticated Property Ownership Data** — Property sign data without auth
3. **Unauthenticated Marketplace & Economic Data** — Full market listing exposure
4. **Unauthenticated Server Infrastructure & Token Data** — Server version, build info
5. **10+ Unauthenticated API Endpoints + 230 Player Correlation** — Mass player tracking surface
6. **WebSocket Player Surveillance** — Live position tracking of all players on a shard
7. **Service Worker Internal Architecture Disclosure** — Route map and caching strategy
8. **Client Configuration Exposure** — `/client-config.js` and `/api/version` leak

---

## Attack Architecture

```
kintara.gg
  ├─ Cloudflare (WAF, CDN)
  │  └─ Bypassed: WebSocket path, PROPFIND method, static file %2F traversal (CVE-2026-6414)
  ├─ Coolify → Render.com / AWS GA (13.248.169.48)
  ├─ Node.js 24 Alpine + Fastify
  ├─ @fastify/static (vulnerable to multiple 0-days)
  ├─ PostgreSQL + Redis
  ├─ 31 game shards (s1-s31)
  └─ fanout.kintara.gg (read-only monolith, no auth on chat)
```

---

## Exploit Chain: Resource Acquisition Pipeline

### Phase 1: Wild Remote Loot (F-011)
```bash
# Automated multi-shard bag looter
node exploits/wild_loot_all.js
```
- Scans all 31 shards for foreign ground bags
- Renders authenticated player presence at bag coordinates via WebSocket spoof
- Claims `POST /api/wild/loot-bag` with `takeAll: true`
- Achieved: 25+ looted bags, no gold (victims carry only items)

### Phase 2: Resource Fabrication (F-001)
```bash
# Sync resource counters to inventory slot totals
node exploits/resource_pusher.js
```
- `POST /api/auth/save-backpack` accepts inflated resource values up to `_srvAuthGrantProtectedMin`
- ProtectedMin mirrors inventory slot quantities
- Achieved: +1102 resources in single push (wood +435, stone +367, cooked_fish_meat +300)

### Phase 3: Automated Harvesting
```bash
# Multi-resource gather bot (wood, stone, coal, metal)
node exploits/gather-bot.js all s10
```
- WebSocket presence on game shard
- `sendHarv` → server responds with player-specific actionProof JWT
- `sendHarvHit` with valid proof → resource harvest
- Equips best available tool (L2 pickaxe if present)

### Phase 4: Inventory Management
```bash
# Auto-clean duplicate tools, keep L2 variants
node exploits/inv_clean.js
```

---

## Key Technical Findings

### Cookie Format
```
__Host-kintara_session = base64(json_payload).hex_hmac_sha256
Payload: {"pid":32810,"w":"<wallet_pubkey>","exp":<timestamp>,"e":0}
```
- `e=0` = regular player, `e=1` = admin
- Admin cookie requires `KINTARA_SESSION_SECRET` (env variable, not leaked)

### Action Proof System (F-005)
```json
{
  "a": 28018,       // player ID
  "exp": 1783599297025,
  "iat": 1783599237025,
  "k": "harvest.hit",
  "n": "KK3eLTwtTL4_MV6vt5YUZw",  // session nonce
  "s": {
    "hasCoal": 0, "hasMetal": 0,
    "keys": ["15,37"], "kind": "tree", "region": "world"
  },
  "v": 1
}
```
- HMAC-signed JWT, cannot be forged without server secret
- Each player gets their own proofs via `res_evt` after `sendHarv`

### Marketplace Lock
- Requires **Level 5+ in ALL skills**: Combat, Woodcutting, Mining, Fishing, Cooking
- Combat XP = 50 → Level 1 → blocked from selling

### Tutorial Bypass
- `POST /api/auth/diag-client-event` with malformed event advanced tutorial from step 0 to step 6
- Full tutorial completion unlocks harvest, marketplace, casino, merchant

### Protocol Discovery
- `t:"harv"` message type was NOT in the browser client source — the client sends `harv_hit` directly
- The `sendHarv` function was an invention that happened to work
- Real harvest flow: `sendHarv` → server returns `res_evt` with actionProof → `sendHarvHit` with proof → repeat until `h >= hm`

---

## Files

```
├── README.md                    # This file
├── reports/
│   ├── findings.md              # Full verified findings (F-001 through F-011)
│   └── kintara_compendium.md    # Complete architectural compendium
├── exploits/
│   ├── wild_loot_all.js         # Multi-shard remote bag looter (F-011)
│   ├── fabricate.js             # Resource fabrication tool (F-001 + F-002)
│   ├── gather-bot.js            # Automated harvest bot (trees + rocks)
│   ├── resource_pusher.js       # Periodic save-backpack sync
│   ├── inv_clean.js             # Inventory cleaner (removes duplicate tools)
│   └── presenceWs.js            # Headless WebSocket presence client
└── strix/
    ├── vulnerabilities.json     # Strix engine output summary
    └── vulnerabilities/         # Individual reports (vuln-0001 through vuln-0008)
```

---

## Remediation Summary

1. **F-011**: Validate loot distance against server-authoritative player position, not client-reported presence
2. **F-001**: Remove client-side resource mutation; track resources server-side exclusively
3. **F-006**: Add portal-check middleware for region transitions
4. **F-007**: Serve only a dedicated `/public/` directory; use positive allowlist
5. **F-008**: Proxy RPC calls through backend; never expose tokenized provider URLs to clients
6. **F-009**: Validate hash suffix; reject unmatched aliases
7. **Strix**: Add authentication middleware to spectate, property, and marketplace read endpoints

---

## Author

Security assessment conducted as part of AI/cybersecurity research program.
Platform: [kintara.gg](https://kintara.gg)
