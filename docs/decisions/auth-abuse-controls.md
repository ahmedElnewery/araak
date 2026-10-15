# Decision: Sign-in and recovery abuse controls

**Status: PENDING OWNER APPROVAL** (⛔ GATE-ABUSE). The T102/T103 throttling implementation and any "abuse-safe" claim wait for sign-off.
**Traces to:** FR-012, FR-014, FR-015, CL-012, CL-015; research R-02 results (item 6: Supabase Auth limits key on the server's egress IP when sign-in is proxied, so they cannot protect individual accounts).

## Proposed limits (the numbers are proposals)

| Surface | Key | Limit | Window |
| --- | --- | --- | --- |
| Sign-in (tenant portal) | (tenant, normalized identifier) | 5 failures | 15 min rolling |
| Sign-in (tenant portal) | client IP (from `TRUSTED_PROXY_HOPS`) | 20 failures | 15 min rolling |
| Sign-in (admin) | identifier; client IP | 5; 20 | 15 min rolling |
| Public recovery request | (tenant, identifier); client IP | 5 requests; 20 requests | 60 min rolling |

Per-account recovery issuance caps from R-02 still apply on top (>=5 min between issuances, <=5 successful in rolling 24 h).

## Throttled response
Identical to every other failure: the same HTTP status, body, localized message and error code (`invalid_credentials`), and padded to the same response time (R-02 item 5: tolerance 250 ms on the p50 gap). The response never reveals whether an account exists, in any tenant, or whether a limit was hit. A throttled attempt does not run the password check, but must still perform the padded dummy check so timing matches.

## Keys and data retention
- Throttle keys are `HMAC-SHA256(AUTH_THROTTLE_HMAC_KEY, tenant_id || ':' || normalized_identifier)` and `HMAC(key, client_ip)`; no raw identifiers or IPs are stored.
- Counters keep only the HMAC key, a count and window timestamps; rows older than 24 h are purged by a scheduled job.
- No account lockout (a lockout would let an attacker disable a victim); throttling is per key and expires.
- Throttle events are written to the tenant security log without the raw identifier or IP (FR-033).

## Open points for the owner
1. Are the numbers above acceptable, or should a CAPTCHA step be added after repeated failures?
2. May the security log record the HMAC'ed identifier to help managers spot attacks?

## Approval

| | |
| --- | --- |
| Owner decision | ☐ Approved ☐ Changes requested |
| Date / name | |
