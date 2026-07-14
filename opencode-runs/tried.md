# Tried Checks

No checks recorded yet.

## Run 20260709-050536 - 2026-07-09T05:06:03
- Bootstrap common paths: 28
- JS files fetched: 2
- Source skim: False files=0
- Strix: error reason=
- Shannon: error reason=
- Note: 401/403/404 results apply only to the tested context and remain available for alternate pivots.

## User-confirmed already tested - 2026-07-09
- IDOR on `/api/auth/player-stats`: tested, do not repeat without new object/session context.
- Mass assignment on `/api/auth/save-backpack`: tested, known protectedMin behavior recorded in findings.
- `/api/admin/*` endpoints: tested, forbidden without admin/session escalation.
- Casino endpoints: tested, known blackjack substitution candidate requires initial gold.
- Marketplace endpoints: tested, KINS hold behavior known.
- Generic parameter injection: tested across current known endpoints.
- `/api/auth/save-skills`: tested, server-authoritative XP behavior known.
- `/api/auth/dev-login`: tested, production disabled.

## Additional live checks from current session - 2026-07-09
- `preCompressed + deflate` @fastify/static bug is real upstream but not applicable to kintara.gg because server is not using `preCompressed`.
- Static normalization/encoding/dotfile probes on kintara.gg returned blocked/not-found, including `/.env`, `/%2eenv`, `/node_modules/.bin`, `/package.json`, `../`, `%2e`, `%2f`, `%5c`, duplicate slash variants.
- `extensions` fallback not enabled on kintara.gg: `/package.json` is 403 but `/package` is 404; real assets like `/client-config.js` do not resolve as `/client-config`.
- Directory listing is not enabled on public static dirs: `/site/img/`, `/site/css/`, `/site/js/`, `/src/`, `/node_modules/three/` all return 404, including `?format=json/html` checks.
- Confirmed info disclosure: `/README.md` and `/Dockerfile` are public while `package*.json`, `server*.js`, dotfiles, `.cjs`, `src/config/*`, and `src/build/*` are blocked.

## Authenticated checks with authorized test wallet - 2026-07-09
- Wallet auth challenge/verify succeeded for player `32810` / wallet `6Pwv...G4M`.
- `/api/auth/game-token-balance` returned `1034.235706` `$KINS`.
- `/api/club/status` returned active membership `false`, tier list `1m/3m/6m/12m`, `soldOut:false`.
- `/api/club/quote` with invalid tiers (`monthly`, `annual`, `../1m`, empty, missing) returned `bad_tier`.
- `/api/club/quote` with valid tiers returned quotes and leaked a usable tokenized QuickNode RPC URL. Recorded as F-008.
- `/api/club/confirm` with bogus signatures did not grant membership; rechecked `/api/club/status` remained `active:false`.
- `/api/auth/gate-check?shard=1` and `?shard=5` returned `membership_required`; `?shard=6` returned `ok`.
- `/api/auth/wishing-well/status` and `/stats` returned expected authenticated data; bogus `/record` signatures returned `bad_signature` or `tx_not_found_or_failed`.
- `/api/auth/solana-json-rpc` is method allowlisted: `getHealth` and `sendTransaction` blocked by relay, `getLatestBlockhash`, `getBalance`, `getAccountInfo`, and `getTokenAccountBalance` are allowed. URL override fields on allowed method were ignored.
- Direct leaked QuickNode endpoint works without Kintara cookies and accepts read methods plus `sendTransaction` method path with invalid transaction returning Solana deserialization error.
- `/api/auth/spinner-paid-quote` returned `spinner_level_required`; not tested further without level 5.
- `/api/marketplace/token-quote` returned `reserve_required`; no reserve was made to avoid state-changing marketplace interaction.

## Fishing/cooking and merchant flow - 2026-07-09
- Correct WS paths require shard prefix `sN`: `/ws/queue/s6`, `/ws/presence/s6`; `/ws/queue/6` failed.
- Browser-like WS headers with `Origin: https://kintara.gg` are required; without them queue upgrade returned 403.
- Shard 6 was full: queue returned `queue_pos` and direct presence returned `503` with `x-kintara-reason: shard_full`; free shards 7+ worked.
- Spoofed presence `pos` with `region:"pond"` and pond coordinates received `region_ack` and changed `/api/auth/grant-fish-xp` from `not_in_pond` to `fish_action_required`.
- Minimal verified fish cycle: join free shard, send pond `pos`, send repeated fish presence `{act:"fish", fc:20, fr:20, fph:0}` until `fish_bite`, continue wait-phase pulses, then pulse `fph:1` for strike and `fph:2` for reel, then `POST /api/auth/grant-fish-xp {"mountCatch":true}`. One cycle returned 200 and added fish/XP/daily progress.
- Early fish grant attempts returned `fish_action_too_fast`; server requires the client-like timing/state machine, not just `region:"pond"`.
- Roast pit coordinates in pond are tile sets `5,6 6,6 5,7 6,7` and `18,34 19,34 18,35 19,35`; standing cardinal-adjacent at pond `col=4,row=6` satisfied `/api/auth/grant-cook-xp`.
- Minimal verified cook cycle: pond presence near roast pit + `POST /api/auth/grant-cook-xp {"mode":"fish"}` returned 200, consumed `1 fish + 1 wood`, added `1 cooked_fish_meat`, and advanced cooking daily quest.
- Completed daily quests with controlled automation: fish quest reached `15/15`; cooked fish quest reached `20/20`; all three daily quests became claimed true.
- Merchant from world `col=21,row=11` removed `not_at_merchant`; `/api/auth/merchant-claim-cycle-gold {"amount":1}` now returns `insufficient_materials` with cost `2600 wood, 1400 stone, 800 coal, 40 cooked_fish_meat`.
- `/api/auth/merchant-lottery-enter {"count":1}` at merchant returns `lottery_entry_closed` with `phase:"claim_open"`; `/api/auth/merchant-lottery-claim` returns `nothing_to_claim`.

## Public/source follow-up - 2026-07-09
- Live `GET /api/world/merchant-campaign` returned cycle 15, `phase:"claim"`, `poolRemaining:0`, `goldStock:0`, `poolFull:1500`; merchant claim is currently pool-empty even if cost/location gates are satisfied.
- Live `GET /api/auth/merchant-lottery-status` without cookie returned 401, so per-player lottery state needs an authenticated session.
- Live `game.js` confirmed client sends cycle claim as `POST /api/auth/merchant-claim-cycle-gold {"amount":1}` only; material bundle constants are `2600 wood`, `1400 stone`, `800 coal`, `40 cooked_fish_meat`.
- Live `game.js` confirmed wild mob combat event shape: WS `{t:"wm_ev", region, a:"hit", i, le, n, px, pz}`; server loot comes back as authoritative `inv_grant` with `backpack`/`stateSeq`.
- Public `GET /api/marketplace/listings` shows direct gold listings with `itemType:"gold"`, `currency:"token"`; best observed listing was `786517` for 4 gold at `$3.99`.
- Unauthenticated `POST /api/marketplace/reserve`, `/token-quote`, and `/buy` against listing `786517` returned `401 unauthorized`; authenticated state-changing flow is required.

## Marketplace token purchase follow-up - 2026-07-09
- Marketplace `presence_required` was satisfied by opening `/ws/presence/s10` and sending world `pos` near cart at `col=21,row=10` (`x=-3.5,z=-14.5`); `POST /api/marketplace/reserve` then returned `200 ok`.
- Authenticated flow for listing `786721` (5 gold, about `$4.95`) returned `/reserve` 200 and `/token-quote` 200. Quote amount was `438864633` token atoms with `decimals=6`.
- Token-2022 payment tx confirmed on Solana mainnet with two successful `TransferChecked` instructions; wallet token balance after payment is `595.371073`.
- `/api/marketplace/token-buy-confirm {quoteId, signature}` returned `200 ok`; public listing `786721` no longer appears in marketplace results.
- Fresh wallet login is now blocked by `403 kins_required` because `$KINS < 1000`, and failed verify issues no session cookie. Private backpack/gold delivery cannot be rechecked until token balance is restored above the login threshold or an existing session cookie is available.
- After top-up, auth succeeded with `$KINS=1178.839095`; `/api/auth/me` verified marketplace delivery: `gold=5`, `wood=1382`, `cooked_fish_meat=20`, `stateSeq=2544`.

## Casino follow-up after first gold - 2026-07-09
- `casino-blackjack-debit {amount:1, initRound:true}` deducts `gold`, not wood. Old wood-substitution candidate is false.
- `casino-blackjack-refund {amount:1}` / `recover {}` can forced-settle unfinished hands; observed wins and losses. Not deterministic gold inflation.
- `casino-blackjack-refund {amount:5}` on a 1-gold round did not trust the body amount; payout used server-side stake 1.
- Repeated `settle`/`refund` after round completion returns `no_active_round` / `nothing_to_refund`.
- `save-backpack` with `gold=current+1` or pre-debit gold normalizes back to server current gold; it does not restore gold after casino debit.
- Concurrent blackjack debit x2: one success, one `round_in_progress`; no duplicate active round.
- Injected blackjack `double` body fields `extraStake:-100` and `amount:-100` were ignored; normal extra stake was charged.
- Roulette invalid checks: negative/zero amounts rejected; string amount coerces to 1; duplicate straight numbers accepted but not profitable; `dozen/column` with all numbers rejected; `red/low` with all numbers accepted but payout still follows red/low result, not all-number coverage.

## @fastify/static allowedPath, wildcard, and dotfiles review - 2026-07-09
- Local source reviewed: `@fastify/static 9.3.0` with `@fastify/send 4.1.0` calls `allowedPath(pathname, root, request)` before `send()` performs extension and index fallback.
- Verified local extension bypass: with `allowedPath` denying `.json` paths and `extensions:['json']`, request `/allowed-path-secret` passes callback then serves `allowed-path-secret.json`. Direct `/allowed-path-secret.json` is denied. This is a post-allow-check extension transform.
- Verified local hidden-index bypass: with `dotfiles:'deny'`, `index:['.env']`, and `allowedPath` denying `/.` segments, request `/public/` serves `public/.env`; direct `/public/.env` is denied. Dotfile inspection occurs before `sendIndex()` and does not inspect selected index filename.
- `wildcard:false` does not prevent hidden-index exposure when `serveDotFiles:true`: generated directory/index route still calls send with `/public/` and serves `.env` index.
- Ruled out encoded-slash chain: `getPathnameForSend` retains `%2f` for allowedPath, but `encodeURI(pathname)` re-encodes `%` before `send()`; send decodes only to literal `%2f`, not separator `/`. No post-allow-check segment rewrite by `%2f`.
- Live applicability remains blocked in the tested Kintara configuration: extension fallback was directly ruled out (`/package` 404 while `/package.json` 403), direct dotfiles are blocked, and exposed README/Dockerfile do not disclose a dot-prefixed `index` setting. No live bypass claim without one of those configuration triggers.

## Raw URL guard distinction - 2026-07-09
- Local `@fastify/static` reproduction separates two guards: a raw `onRequest` regex blocking `server.js` is bypassed by `/server%2Ejs` and `/%73erver%2Ejs`, because static later decodes them and serves `server.js`; adding `allowedPath` blocks those exact requests because callback receives canonical `/server.js`.
- Therefore encoded-character bypasses apply to a raw pre-route/proxy/onRequest filter, not to `allowedPath` in `@fastify/static 9.3.0`.
- Exact live probes against both `kintara.gg` and `fanout.kintara.gg` returned `403` for `/server%2Ejs`, `/%73erver%2Ejs`, `/package%2Ejson`, `/%70ackage%2Ejson`, `/src%2Fconfig`, and `/%2Eenv`. Double-encoded `/src%252Fconfig` returned `404`.
- Public `README.md` and `Dockerfile` remain `200` under ordinary and percent-encoded characters, which confirms encoded ordinary characters reach the static serving path but does not bypass the protected-file guard.

## Expanded static import graph and fanout differential - 2026-07-10
- `/client-config.js` exposes the configured read fanout origin `https://fanout.kintara.gg`; main build SHA is `567d027ba92482b187e74ab582d7a124b1fd876a`, while fanout exposes stale SHA `801c4090707a6cb127891fb9beef4b270a5ed381`.
- `fanout` serves an older external-module `game.js` (1,855,212 bytes) while main serves a 3,476,610-byte build. The fanout graph deterministically yielded 185 JavaScript paths: 178 returned 200 and seven package/import-map specifiers returned 404 at same-origin paths.
- Every one of the 185 paths inferred from the fanout graph is also directly reachable from main. No source map was available for any tested module (`.js.map` and `.map` variants all 404).
- The graph exposes client source beneath `/src/game/**` (network, UI, world, interiors, NPC, renderer, and game systems). It contains API/WS route literals and client feature flags but no server-side imports, secret values, protected files, or duplicate source-body aliases.
- Only eight graph files differ between main and fanout revisions: `game.js`, `spinner-paid-wallet.mjs`, `src/game/interiors/casino.js`, `src/game/world/world-tile-math.js`, `src/game/world/world-layout.js`, `src/game/npc/npc-interact.js`, `src/game/scene/glb-loaders.js`, and `src/game/net/presence-messages.js`.
- Root target comparison confirms public client aliases only on both hosts: `/game.js == /src/game.js` and `/index.html == /site/index.html`. `game.406ff6c72be54f45.js` is an additional stale game alias, not a protected target.

## Raw request-target normalization matrix - 2026-07-10
- Raw HTTPS request targets were sent without client URL normalization to both hosts for protected sentinels `/.env`, `/server.js`, `/package.json`, and `/src/config`, with public controls `/README.md` and `/src/game.js`.
- Tested transforms: percent-encoded and double-encoded dots/slashes/backslashes, duplicate slash, literal and encoded dot segments, matrix suffixes, trailing dot/space/NUL, and overlong UTF-8 dot encodings. The response set was limited to 403, 404, and Cloudflare 400 for protected sentinels; none returned content.
- Common rewrite headers `X-Original-URL`, `X-Rewrite-URL`, and `X-Original-URI` with protected internal paths did not alter the response: all yielded the same 403 body on both hosts.
- Public controls returned their known body hashes only under canonical/accepted transforms. No tested transform mapped a protected request to a public body or a public request to a protected target.
- Result: the local raw-URL guard versus later static decode primitive is not reachable through the current main/fanout request pipeline. Retest only after proxy, static middleware, or ACL configuration changes.

## Three-chain follow-up: artifact, deployment, and non-static fanout - 2026-07-10
- Source-derived artifact branch: 75 targeted candidate paths per host were checked, derived from exposed Docker/source comments and known public files. They covered server/bootstrap names, build scripts, lockfiles, deployment manifests, archives, database dumps, and common backup suffixes. Every candidate was 403 or 404; none exposed a normal allowed artifact.
- Deployment/cache/ACL branch: main and fanout carry distinct game/client revisions. Cross-host ETags never yielded a 304 or the other host's body; `Cache-Control: no-cache` preserved each host's own hash. SNI/Host swaps route according to the explicit `Host` value, but protected `/.env` remains 403. Forwarded-host/proto hints did not alter served assets or ACL behavior.
- Non-static fanout branch: fanout intentionally blocks non-read application routes with `503 read_fanout_only` or `fanout_unavailable`. `POST /api/auth/dev-login` is `403 test_login_disabled` on main and `503 read_fanout_only` on fanout.
- Against non-mutating fanout routes `/api/version` and `/api/auth/me`, GET, POST, OPTIONS, `X-HTTP-Method-Override`, `X-Original-URL`, `X-Rewrite-URL`, and `X-Forwarded-Host` all retained the read-fanout block. No stale API/auth bypass was reached.

## Remaining static-adjacent vectors follow-up - 2026-07-10
- Alternate static roots: 100 targeted prefix/file combinations per host tested across download, export, file, media, upload, asset, static, public, dist, build, temp, backup, archive, and release prefixes with public and protected controls. Every response was 403 or 404.
- Historical/preview hosts: CT records expose `www.kintara.gg`, `fanout.kintara.gg`, and `kintara-dev.kintara.gg`. `www` is a 301-only alias to main. `kintara-dev` has no A, AAAA, or CNAME record and cannot be reached. The Common Crawl June 2026 index contains only the homepage; Wayback CDX was transport-unavailable, not interpreted as a negative archive result.
- Cache isolation: main API responses sampled from both public and auth-bound routes return `Cache-Control: no-store` and `CF-Cache-Status: DYNAMIC`; no cache age or shared-cache indicator appeared. This strongly rules out CDN cache deception for those routes. A live authenticated-cookie cross-request was not run because no session cookie is retained in the runtime workspace.
- Write-to-static prerequisite: complete 178-module public client graph was searched for file upload/export/import/download routes and browser file APIs. No upload/export/import/download endpoint or file-input/FormData primitive exists. Only `/api/captcha/image?id=` and local `createObjectURL` were found, neither of which writes a user-controlled file to the static root.

## Hashed game alias resolver - 2026-07-10
- Main and fanout accept `/game.<16-lowercase-hex>.js` for arbitrary valid-looking values such as `deadbeefdeadbeef`, then return each host's current game bundle. Malformed, wrong-length, uppercase, `.mjs`, and `.js.map` variants return 404.
- The resolver is limited to the `game` basename: analogous aliases for README, Dockerfile, server, package, `.env`, and `src/config` do not resolve to a bundle or protected file. Traversal from the game alias remains 403.
- Fresh aliases return `CF-Cache-Status: MISS` first and `HIT` afterwards with `Cache-Control: public, max-age=31536000, immutable`, proving arbitrary immutable cache-key creation. `Vary: Accept-Encoding` separates gzip and identity correctly; no representation poisoning was found.
- `game.406ff6c72be54f45.js` is a real historical artifact on main (its SHA-256 starts with that exact 16-hex value). Bundle diff against current reveals only later chest API additions; no old-only API, host, source-path, or feature flag was found.
- Generalization check: the same synthetic hash syntax was rejected for 17 other root and nested public entrypoints, including client config, service worker, wallet modules, site JS/CSS, auth, constants, and game submodules. Only root `game.<16-lowercase-hex>.js` resolves.
- Boundary check: `game.<hash>.js/` and `game.<hash>.js/.` canonicalize back to the same game bundle; alternate separators, `game-`, `game_`, `.mjs`, nested game locations, and arbitrary non-game basenames return 404. Protected traversal from the valid alias remains 403.

## Artifact identifier provenance correlation - 2026-07-10
- 207 reachable public files across current, fanout, historical game, service worker, HTML, site, and client-module graphs were searched for content-hashed artifact references, 40-hex deployment SHAs, and the retained `game.406ff6c72be54f45.js` name.
- Only fanout's own client deployment SHA appears in `/client-config.js`. No public file references the retained historical game filename or another historical content-hash artifact.
- Deployment SHAs and bundle content hashes are unrelated in observed data: main deploy `567d...` maps to bundle `152e...`; fanout deploy `801c...` maps to bundle `7b1c...`; retained artifact is `406f...`. Supplying any deployment SHA prefix to the game alias resolver falls back to the current bundle, not a matching release.
- Current evidence therefore does not provide a deterministic artifact-ID oracle. Retrieving further retained artifacts requires an external identifier source such as historical HTML, CDN/request logs, referrers, browser history, or archive index coverage; random 64-bit hash guessing is not a valid path.

## Diagnostic and moderation ingestion source review - 2026-07-10
- `/api/auth/diag-client-event` is invoked by client code only for bounded malformed-backpack telemetry (`kind:"bp_apply_missing_field"` plus structural field/context metadata). No public client path forwards arbitrary user text to it.
- `/api/auth/player-report` accepts `reportedPlayerId` and a 5-500 character comment. Embedded admin report rendering applies `tt()` to the comment, names, wallets, status, region, and resolution note before assigning aggregated markup to `innerHTML`; `tt` escapes `&`, `<`, `>`, `"`, and `'`.
- Remote player names are passed through `Jr()` before `formatPlayerNameTagHtml()` is assigned to `innerHTML`; `Jr` escapes `&`, `<`, `>`, and `"`. Remote mottos go through `sanitizePlayerMottoClient()` and are assigned with `textContent`.
- No client-visible stored-XSS path was found through reports, presence nametags, or mottos. Any admin-profile renderer not represented in the public bundle remains a separate unverified coverage gap.

## Historical URL and standalone admin renderer follow-up - 2026-07-10
- URLScan search returned public scan metadata for Kintara, but result request lists are access-controlled (403). Common Crawl exposed only a homepage capture; Wayback CDX remained transport-unavailable. Filtered Chrome and Firefox histories contained no Kintara URLs.
- Source-derived standalone admin paths were tested on main and fanout. Only `/admin/game.js` returned 200, byte-identical to normal `game.js`; it is not an admin renderer or chunk.
- Resolver grammar: arbitrary non-dot prefixes ending in `/game.js` serve the current game bundle, including `/x/game.js`, `/x/y/game.js`, `/server.js/game.js`, and `/package.json/game.js`. Prefixes ending in `.env` remain 403. Hash aliases work only at root; `/admin/game.<hash>.js` is 404.
- Prefixed non-game client modules (`auth-gate`, constants, game submodules, site JS, wallet modules, client config, service worker, and index) all return 404. The resolver cannot select an arbitrary static target.

## Cross-layer deployment correlation - 2026-07-10
- URLScan's historical Render IP `216.24.57.1`, queried with valid `kintara.gg` SNI and Host, now terminates through Cloudflare and returns the same current main responses and ACL. It is not a reachable direct origin.
- During this assessment main deployment SHA changed from `567d027ba92482b187e74ab582d7a124b1fd876a` to `dde38cfc7c6ddea0c06a763ec6a3b18238d7f6c5`. `client-config.js` and `/api/version` changed together; `game.js`, `sw.js`, and `index.html` bytes did not.
- A 60-second, 5-second-interval watcher observed the new deployment marker remain stable. It establishes that server/deployment SHA and game content hash are independent and that a config-only deploy does not create a new game artifact identifier.

## Fanout read-policy differential - 2026-07-10
- Anonymous GET comparison of all 196 `/api/*` literals from current `game.js` found one authorization differential: `/api/world/chat` is 401 on coordinator but 200 on fanout.
- Fanout response is repeatable and contains 20 records with player ID, shard, display name, wallet field, region, `worldX`, `worldZ`, message, and timestamp. `/api/world/chat/bootstrap` leaks the same structure.
- Client contract parameters `after=0&region=global&shard=N` work anonymously on fanout. A metadata-only scan of shards 1-31 found 16 successful shards, each returning 20 records; coordinator returned 401 for equivalent calls. Non-global `region=casino` returned `503 fanout_unavailable` in tested context.
- Retest against the client-declared spectator routes changes the classification: main `/api/spectate/chat/bootstrap?region=global&shard=1` returns the same response hash as fanout bare world chat, and main `/api/spectate/chat?after=0&region=global&shard=1` returns a larger anonymous spectator feed. Fanout route is therefore an auth-policy inconsistency, not a net-new confidential disclosure.

## Sensitive read-route middleware matrix - 2026-07-10
- Tested coordinator and fanout read routes for game-token balance, admin reports, guild chat, friend list, world chat, club status, and wishing-well status under duplicate slash, dot segment, encoded API prefix/slash, trailing slash, dot tail, semicolon, OPTIONS, `X-Original-URL`, and `X-Rewrite-URL` variants.
- All selected coordinator protected reads remained 401. Fanout retained its 503 `read_fanout_only` gate for every selected protected route. No malformed form converted a protected read to a 200 response.
- Fanout world-chat canonical and trailing-slash forms returned 200; this is the previously retired F-010 behavior and matches the public spectator feed rather than a new auth bypass.

## New-deploy authenticated test/debug and membership follow-up - 2026-07-10
- Fresh ephemeral wallet authentication against main deployment `dde38cfc7c6ddea0c06a763ec6a3b18238d7f6c5` succeeded for authorized player `32810`. Authenticated `/api/auth/me`, `/api/auth/game-token-balance`, and `/api/version` were all 200; reported `$KINS` balance was `1178.839095`.
- Exact source-backed Team Test Login retest: `GET /api/auth/dev-login` returned `{ok:true,enabled:false,label:"Team Test Login"}` and `POST` with a valid 16-hex `testToken` returned 403 `{ok:false,error:"test_login_disabled"}`. Fanout returned 503 `read_fanout_only` for both methods.
- Client source has no server-facing E2E/debug switch beyond that route. `window.__KINTARA_E2E__`, `debugCombatLock`, and `/play?spectate=1` are client UI behavior; `GET /client-config.js?all=1|debug=1|verbose=1` has no server-side feature effect.
- Authenticated `/api/auth/gate-check` applies membership only to canonical numeric representations of paid shards: `1`, `01`, `1.0`, and `1e0` returned 403 `membership_required`; `6` returned 200 `gate:ok`. Malformed/noncanonical values `s1`, `06`, `0`, `-1`, and `NaN` returned 200 `gate:ok`.
- The preflight response does not grant queue access. With the same authenticated session, `wss://kintara.gg/ws/queue/s1` failed its upgrade with HTTP 403, while `/ws/queue/s6` opened and emitted `{"t":"queue_pos","pos":2,"ahead":1}`. `/ws/queue/s01`, `/ws/queue/s1.0`, and `/ws/queue/ss1` did not establish an upgrade within four seconds. No membership bypass is verified.
- A malformed relay body initially returned HTTP 200 with an empty body. The exact JSON-RPC 2.0 envelope was then verified: authenticated `getLatestBlockhash` and `getBalance` both returned normal Solana RPC results with `jsonrpc`, matching `id`, and read-only data. No debug method, upstream override, or write path surfaced.

## Current bundle object-access follow-up - 2026-07-10
- Authenticated `GET /api/friends/list` returned an empty friend set. Direct read-only `GET /api/friends/dm/history?peerId=<id>&afterId=0&limit=200` requests for 12 spectator-observed non-friend player IDs all returned 403 `not_friends`; no DM IDOR.
- Authenticated `GET /api/wild/ground-bags?shard=<n>` accepts arbitrary shard values without an established queue/presence context. Shards `6` and `10` returned 9 and 7 active foreign ground bags respectively; responses expose `id`, `victimId`, exact tile, realm, shard, expiry, and item contents. Shards `1`, `7`, and `31` were empty in that sample. This is recorded as C-008 disclosure; no foreign `loot-bag` mutation was attempted.
- Read-only `GET /api/property-signs/status` exposes ownership/name/lock maps for mansions, houses, trailers, and flats; no password or private interior state was returned. `/api/chests/kiosk` exposes public chest definitions/prices/weighted rewards, `/api/chests/defs` without IDs returns an empty list, and authenticated `/api/guilds/me` returned no controlled guild. No new property/chest/guild impact was established.
- F-011 chain proof: an initial foreign `POST /api/wild/loot-bag` request without presence returned 400 `bad_pos` and left `stateSeq=2565`. After joining shard `s10`, a forged presence `pos` frame at a freshly enumerated foreign bag tile (`wild`, col=42, row=14) received `region_ack`; the same claim returned 200 and added the foreign `wild_sword` to the authorized account, advancing `stateSeq` to `2566`. The server accepted the client-reported tile as distance proof.

## Current bundle admin authorization follow-up - 2026-07-10
- Fresh ordinary-user session returned 403 `forbidden` for exact current admin reads: `ws-stats`, player reports, banned wallets, player search, own inventory/ledger/alts, released item types, item/chest catalogs, and chest definitions.
- A live ordinary-user presence socket sent the non-mutating `{t:"adm_mute_list"}` event and received `{t:"adm_mute_list_res",ok:false,err:"Not authorized (server rejected)."}`. No privileged HTTP or WebSocket admin read/binding bypass was found.

## Run 20260712-154040 - 2026-07-12T16:12:59
- Bootstrap common paths: 28
- JS files fetched: 2
- Source skim: False files=0
- Strix: completed reason=Strix exited without a completed report
- Shannon: skipped reason=run_shannon=never
- Note: 401/403/404 results apply only to the tested context and remain available for alternate pivots.

## Run auth-context-smoke - 2026-07-12T18:46:43
- Bootstrap common paths: 0
- JS files fetched: 0
- Source skim: False files=0
- Strix: skipped reason=tool_profile=passive
- Shannon: skipped reason=tool_profile=passive
- Note: 401/403/404 results apply only to the tested context and remain available for alternate pivots.

## Run 20260713-031527 - 2026-07-13T03:57:32
- Bootstrap common paths: 28
- JS files fetched: 2
- Source skim: False files=0
- Strix: failed reason=Strix exited without a completed report
- Shannon: blocked reason=Strix must produce a completed report before Shannon starts.
- Note: 401/403/404 results apply only to the tested context and remain available for alternate pivots.
