# Tenant SMTP Vault Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation.

**Goal:** Save editable SMTP host, TLS port, user, password and sender per tenant in Vault.
**Architecture:** Keep Vault ownership and user authorization authoritative. A narrow Explorer server coordinator publishes a scoped immutable email integration version, preserves an omitted password and reconciles uncertain replies. It advances explicit pins with the existing link CAS, then the UI waits for the Club API’s matching static generation and acknowledges the disabled connection. Native SMTP projects the verified Vault sender; ordinary per-message callers cannot override sender identity.
**Tech Stack:** Existing Next.js authenticated Vault proxy, NestJS tenant runtime, TypeScript.
**Spec:** Approved editable SMTP sender design, plus user requirement that every SMTP configuration is tenant-owned.

## Global constraints
- Preserve existing local chat/UI edits and keep SMTP connection disabled during editing.
- No live configuration save, activation, credential exposure or email send during QA.
- Tenant/environment scope, admin approval, allowlisted TLS destinations, version/revision CAS and runtime authority fences remain enforced.
- Do not fall back to application/shared SMTP configuration or a different version after uncertainty.

## Review focus
- Foreign tenant resource, stale source version, pinned historical version and concurrent link changes must fail closed.
- Omitted password retains only that tenant/version’s password; values never reach logs or UI responses.
- Unknown version or pin publication is reconciled without blind repeat writes.
- New sender applies only from owned Vault configuration, never from a message body.
- UI waits for the published version and reports partial publication instead of claiming success.

## Task 1: Tenant-native SMTP identity
Files: Club API tenant-v2-static-token.repository, tenant-club-administration, tenant-mail-settings, tenant-smtp.factory, tenant-communications and composition.
- [x] Add failing tests for native Vault sender, explicit administrative sender input, legacy sender enforcement, cross-tenant isolation and no per-message sender override.
- [x] Add safe native resource/version metadata to SMTP inspection; validate and project Vault sender and scoped host policy.
- [x] Pass a trusted native-only sender configuration option through composition; retain legacy fixed sender checks.
- [x] Run focused Jest suites and TypeScript checks.

## Task 2: Scoped Vault SMTP publication
Files: Explorer lib/tenant-smtp-vault.ts, app/api/vault-v2/[...path]/route.ts, tests.
- [x] Add failing tests for version CAS, tenant ownership, pin advancement, concurrent/unknown outcomes and omitted passwords.
- [x] Implement fixed club-api link/tenant resource checks, typed input, read-modify-publish using existing Vault APIs and sanitized response/error results.
- [x] Reconcile uncertain writes; preserve every unrelated link and fail explicitly on partial pin publication.
- [x] Run focused tests and typecheck.

## Task 3: Editable form and confirmed save
Files: Explorer integration-mail-settings.tsx, club-explorer.tsx, lib/tenant-smtp-save.ts, tests.
- [x] Test editable sender/dirty tracking/submit and exact published-version admission wait.
- [x] Include sender in validated form state; invoke the scoped Vault save only for native tenant SMTP; reload and acknowledge confirmed matching version.
- [x] Verify UI without mutating any real SMTP settings; retain primary edits when applying the narrow patch.

## Execution evidence
- Task 1: Native SMTP projects the tenant Vault sender, nonsecret metadata supports recovery, and runtime host bindings are scoped by tenant/environment/config revision. 66 focused API tests and4 bootstrap tests pass; compiler and Nest build pass.
- Task 2: Fixed tenant-only authenticated save route and coordinator publish CAS versions, preserve opaque passwords, reconcile uncertain writes and advance only matching pins. Divergent historical source/head configuration fails before writes; exact-content retry reuse is supported. Typed safe errors keep malformed secret responses out of browser errors. Route/coordinator regressions pass; targeted lint passes.
- Task 3: Sender is editable and submitted, API generation admission matches the exact published resource/version, and active connections remain locked. Full isolated Explorer suite168 passed; combined primary checkout suite178 passed after preserving prior chat/static-table/UI edits. Both compiler checks and webpack build pass. No real SMTP save/activation/email was performed.
- Independent review: four findings corrected with regression tests; no unresolved actionable P1/P2, report /tmp/app-52/smtp-review.md. No merge or deployment.
- Primary API test fixtures require VAULT_APPLICATION_ID empty and SECRETS_KEYS_STRATEGY=ENV_VARIABLES to isolate the real checkout’s .env bootstrap setting. With those explicit test-only overrides, the66 focused cases pass; live service retains its unchanged Vault bootstrap environment.
