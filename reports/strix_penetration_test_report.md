# Security Penetration Test Report

**Generated:** 2026-07-12 23:12:59 UTC

# Executive Summary

A comprehensive black-box security assessment was performed on https://kintara.gg, a browser-based isometric MMO built on the Solana blockchain with a play-to-earn economy using the $KINS token. The assessment discovered 207 API endpoints across the application, 31 game servers, a WebSocket presence system, and multiple subdomains.

The most critical finding is an unauthenticated WebSocket endpoint (wss://kintara.gg/ws/spectate/s{shardId}) that streams real-time position, health, and status data for ALL players on any game server - approximately 1,400+ players online at time of testing. This enables mass surveillance of player locations, health points, combat state, and activities without any authentication.

Additional findings include multiple unauthenticated API endpoints exposing player data across 10+ endpoints, enabling enumeration of 230+ unique player identities through cross-correlation of chat messages, marketplace listings, and property ownership records. The adminBypass flag exposed in the /api/servers response reveals an internal access control mechanism. The service worker and client configuration file leak internal architecture details including the deployment platform (Render) and git commit SHA.

The authentication system (Solana Ed25519 wallet signatures with KINS token balance verification) was thoroughly tested and found to be robust - no auth bypass, mass assignment, prototype pollution, or injection vulnerabilities were discovered. SQL injection, NoSQL injection, and XSS were tested across all accessible endpoints with no exploitable vulnerabilities found.

The primary risk is player privacy: unauthenticated attackers can build comprehensive player dossiers by correlating data from chat, marketplace, property records, and real-time WebSocket surveillance.

# Methodology

The assessment followed OWASP WSTG and PTES methodology for black-box web application testing. The approach consisted of:

1. RECONNAISSANCE: Subdomain enumeration (subfinder), technology fingerprinting (httpx, manual HTTP analysis), service worker analysis, client-config.js analysis, and robots.txt review. Discovered subdomains: fanout.kintara.gg (read-only mirror), kintara-dev.kintara.gg (dead DNS), www.kintara.gg (redirect).

2. ATTACK SURFACE MAPPING: Extracted 207 API endpoints from the client-side JavaScript bundle (game.js, 3.5MB minified). Categorized endpoints into public, authenticated, and admin tiers. Discovered WebSocket endpoints for spectate, queue, and presence systems.

3. VULNERABILITY TESTING: Deployed 4 specialized parallel agents covering: (a) authentication bypass and admin access, (b) information disclosure and IDOR validation, (c) SQL/NoSQL injection and XSS, (d) business logic and API parameter fuzzing. Each agent tested its domain with browser User-Agent headers (required to bypass Cloudflare bot detection).

4. VALIDATION: All findings were validated with raw HTTP evidence. The auth flow was tested end-to-end by generating an Ed25519 keypair and performing the full challenge-response cycle. Mass assignment, prototype pollution, challenge replay, header injection, method tampering, and parameter pollution were all tested.

5. CROSS-CORRELATION: Player data from multiple unauthenticated endpoints was cross-referenced to demonstrate the ability to build comprehensive player profiles from chat, marketplace, property, and WebSocket data.

# Technical Analysis

## Confirmed Vulnerabilities (8 reports filed)

### High Severity (1 finding)
1. **Unauthenticated WebSocket Player Surveillance** (vuln-0006, CVSS 7.5) - The spectate WebSocket at /ws/spectate/s{shardId} accepts unauthenticated connections and streams real-time data for all players: positions (x/y/z), health points, shield charges, combat damage, outfit/cosmetic schemas, movement status, and current actions. Connects to any of 31 shards without auth.

### Medium Severity (5 findings)
2. **Unauthenticated World Chat Exposure** (vuln-0001, CVSS 5.3) - /api/spectate/chat/bootstrap returns ~100 chat messages with playerId, displayName, coordinates, and timestamps without auth. Supports ?shardId=1-10 parameter for multi-shard enumeration.

3. **Property Owner Data Exposure** (vuln-0002, CVSS 5.3) - /api/property-signs/status returns all property ownership data (34 properties, 24 unique owners) with names and IDs. Individual endpoints also exposed: /api/{mansion|house|trailer|flat}/{id}/status.

4. **Marketplace Data Exposure with Player Enumeration** (vuln-0003, CVSS 5.3) - /api/marketplace/listings exposes 7,680+ listings with sellerId, sellerName, and priceUsd. Pagination via limit/offset enables full enumeration of all sellers.

5. **adminBypass Flag Exposure** (vuln-0004, CVSS 5.3) - /api/servers response includes "adminBypass":false flag, revealing internal access control architecture.

6. **Service Worker Architecture Disclosure** (vuln-0007, CVSS 6.5) - /sw.js contains comments exposing the Render deployment platform, internal file structure, caching strategies, and maintenance page path.

7. **Client Configuration Exposure** (vuln-0008, CVSS 5.3) - /client-config.js exposes fanout server URL, client version SHA, idle kick timeout, and feature flags. /api/version separately exposes the git commit SHA.

### Consolidated Report (filed by subagent)
8. **Multi-Endpoint Player Data Exposure** (vuln-0005, CVSS 7.5) - Consolidated report covering 10+ unauthenticated endpoints that expose player activity metrics, token data, marketplace stats, world campaign data, and version info. Cross-correlation of 230+ unique player IDs demonstrated.

## Areas Tested with No Findings
- **SQL Injection**: Tested marketplace, property, auth, and world endpoints - all use input validation/parameterized queries
- **NoSQL Injection**: Tested $ne, $gt, $regex, $where operators - all rejected or ignored
- **XSS**: Chat messages are JSON with proper Content-Type, no input reflection found
- **Authentication Bypass**: KINS requirement, dev-login, challenge replay, mass assignment, prototype pollution, header injection, method tampering - all properly secured
- **Path Traversal**: Cloudflare blocks encoded traversal, server normalizes paths
- **CORS**: Properly configured, no wildcard origins

## Attack Path Summary
1. Connect to wss://kintara.gg/ws/spectate/s1 → get real-time positions of 1,400+ players
2. GET /api/spectate/chat/bootstrap → get player IDs, names, and chat history
3. GET /api/marketplace/listings?limit=100&offset=0...7600 → enumerate all sellers
4. GET /api/property-signs/status → get all property owners
5. Cross-correlate: 230+ unique players identified, 11 found in both chat and marketplace
6. Monitor specific players' real-time positions and health via WebSocket for targeted exploitation

# Recommendations

## Immediate (Critical Priority)
1. **Secure the Spectate WebSocket** - Require authentication for /ws/spectate/* connections. If public spectate is intended, strip health points, shield charges, combat values, and outfit schemas from the data. Only send position data for players in the spectator's viewport, not the entire shard.
2. **Add authentication to chat, marketplace, and property endpoints** - These endpoints currently expose player data without any auth. At minimum, require a session cookie before returning playerId, displayName, or ownership data.

## Short-Term (High Priority)
3. **Remove adminBypass flag from API responses** - This is internal server configuration that should never be exposed to clients. Audit all admin endpoints to ensure server-side enforcement.
4. **Minimize data in marketplace listings** - Remove sellerId and priceUsd from unauthenticated responses. If browsing is public, show only item type, quantity, and price without seller identity.
5. **Strip internal comments from service worker** - Use a build process to minify /sw.js and remove architecture comments before deployment. Do not reference the deployment platform in client-facing code.
6. **Remove git SHA from /api/version and /client-config.js** - This helps attackers identify specific code versions. Move version tracking to authenticated server-side monitoring.
7. **Remove idle timeout and feature flags from client-config.js** - Fetch these via authenticated API calls rather than a static public file.

## Medium-Term
8. **Implement rate limiting on all public endpoints** - The chat, marketplace, property, and spectate endpoints should have rate limits to prevent automated enumeration and surveillance.
9. **Reduce spectate chat data** - For spectate mode, return only recent messages (10-20) and do not include playerId or walletPubkey fields. Use anonymized identifiers.
10. **Harden CSP** - Remove 'unsafe-inline' from script-src directive. Use nonces or hashes for inline scripts instead.
11. **Test authenticated endpoints** - Casino, spinner, wishing well, and marketplace buy/reserve flows require authenticated sessions to test for race conditions and business logic flaws. Recommend obtaining a KINS-holding wallet for authenticated testing.
12. **Monitor for subdomain takeover** - kintara-dev.kintara.gg has dead DNS. Remove the DNS record or monitor for takeover.

