# APP-25 Integration disclosures Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation. Track steps below.

**Goal:** Initially collapse each connection's settings with independent accessible controls, retaining drafts and existing mutations.

**Architecture:** Per-card local state and useId. A native Show/Hide button controls an always-mounted hidden region, whose outer fieldset is disabled when collapsed or busy. Identity/status/reconnect/toggle stay outside. No backend, auth, persistence or save contract changes. Implement on existing development branch as explicitly requested; preserve unpublished work. Freddie UX is recorded in APP-25; independent architecture/security review approved this design before product edits.

**Tech Stack:** Existing React/TypeScript, semantic HTML and CSS tokens, Node test runner and Testing Library.

## Review Focus
- Independent cards and unique aria-controls; no shared expansion state.
- Controlled OAuth/mail drafts and uncontrolled credential inputs survive toggles, without callbacks or submissions.
- Hidden controls cannot be focused or validated; busy and active-provider restrictions still apply after opening.
- Provider navigation retains card state; a fresh page mount starts collapsed.
- Native Enter/Space operation and wrapping controls at desktop/mobile sizes.

## Task 1: Connection disclosures

Files: integration-sections/integration-connection-card.tsx, globals.css, test/integration-disclosure.test.tsx, existing club-explorer.test.tsx, README.md.

- [x] Write regression tests for collapsed names/status, independent toggles, drafts/no mutations, busy restrictions and remount reset; confirm failures before product edits.
- [x] Add native type=button with contextual Show/Hide labels and aria-expanded/aria-controls. Keep original editors mounted in hidden region + disabled fieldset; do not change their props or handlers.
- [x] Update existing interaction tests to expand the target card before editing. Preserve failure clearing, expected revisions and save payload assertions.
- [x] Run tests, lint, typecheck and build. Browser-check actual integrations, keyboard operation and desktop/mobile without saving live settings; get independent final review.
- [x] Document behavior and report implementation on development. No commits, pushes, Jira messages, merges or deployments requested.


Verification: 60 frontend tests passed, ESLint clean, TypeScript clean, Next build
passed. Live browser verified collapsed initial state, native Enter/Space, a visible
expanded region, 44px touch target and no horizontal overflow at 390px; desktop
checked at 1440px. Existing runtime services reused; no integration settings saved.
Architecture/security pre-review approved; independent final review completed with no actionable findings.
