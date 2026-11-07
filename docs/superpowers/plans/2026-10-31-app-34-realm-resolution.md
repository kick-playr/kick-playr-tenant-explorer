# APP-34 Realm Resolution Implementation Plan

> For agentic workers: use superpowers:executing-plans task by task.

Goal: contain realm lookup failures and recover from brief transport failure without compromising tenant isolation.
Architecture: retain authoritative no-store lookup and strict validation. Add classified internal errors, one bounded transient retry, explicit unavailable results at consumers, request-scoped React cache for Server Components, and static HTTP 503/JSON responses at HTTP boundaries.
Tech stack: existing Next.js 16 / React / TypeScript / node:test.
Spec: APP-34 description, diagnosis/UX comment 10044; direct Lolo approval in delivery chat recorded in 10046.

Constraints: no cross-request realm cache, fallback realm, weakened validation, secrets/raw error logging, service starts/restarts, merges or deploys. Do not retry invalid hosts/config/payload, missing secrets, 400/404 or 429. Keep a single 5s total lookup deadline, at most two attempts for transport/502/503/504. Respect 429 with safe bounded Retry-After on controlled failure. No API throttle bypass.

Task 1 — resolver (src/lib/server-realms.ts; test/server-realms.test.ts):
- [x] Add regressions for successful recovery, exhausted transient failure, 429 without retry, malformed/mismatched realm, invalid origin/host and missing secrets; run and observe expected failures.
- [x] Add internal error categories with safe status/retry metadata; preserve exact payload validation; implement bounded retry and safe result wrapper.
- [x] Verify targeted tests.

Task 2 — consumers (src/proxy.ts, layout/page, explorer and branding routes; focused integration tests):
- [x] Write failing tests for static 503 HTML/manual retry and JSON responses, no-store and no raw details; later failure must not throw after successful proxy resolution.
- [x] Handle lookup failures at every consumer; no Clerk call or data access after failed resolution. Reuse resolution only inside React Server Component request scope, never across requests. Proxy and routes must return HTTP 503; late Server Component fallback must render neutral retry UI (Next streaming cannot guarantee a late 503 status).
- [x] Verify targeted tests plus full npm test, npm run typecheck, npm run lint. No dev server or build needing secrets.

Review focus: budget exhaustion; malicious host/payload; 429 retry amplification; failure after successful proxy lookup; no secrets or cross-request authorization reuse.

Task 3 — independent Trip QA/security review:
- [x] Review actual diff and test evidence; fix material findings, rerun affected checks.
- [x] Record evidence and limitations in APP-34. Keep source reviewable in isolated branch; no commit/push/PR until release/version requirements are checked.

Verification: RED observed for resolver recovery, boundary503 and stalled-body regressions; final npm test77/77, typecheck/lint passed. Independent Trip review approved. Two existing ClubSettingsEditor act warnings remain. No live services or production build used. Explorer patch0.1.1→0.1.2 only; primary APP/API versions unchanged.
