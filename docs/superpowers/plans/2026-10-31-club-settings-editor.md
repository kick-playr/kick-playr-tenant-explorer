# Club settings editor implementation plan

**Goal:** Let club administrators inspect the complete application settings snapshot and edit every setting supported by the existing club API.

**Architecture:** Reuse the authenticated club GET/PATCH routes and encrypted club storage. A dedicated editor renders grouped primitive controls and nested JSON controls. Only changed, allowed fields are patched using expectedHash. Runtime configuration, generated legacy projections, IDs and hashes remain read-only. Integration secrets remain under the existing write-only integration controls.

**Tech stack:** Existing Next.js, React, TypeScript, CSS and node:test/Testing Library.

**Ruling:** Apply the user's standing instruction to use judgment and implement. Extend the existing UI without broadening backend permissions or editable runtime bindings.

- [x] Add regression tests for nested settings edits, changed-only patches, protected fields, invalid JSON and conflicts.
- [x] Implement a typed settings catalog, grouped editor, read-only snapshot and reset/conflict handling; integrate with ClubExplorer.
- [x] Run UI tests, lint, typecheck and browser read-only verification; review the final change. Do not modify live club settings for verification.

**Verification:** 28 UI tests, lint, TypeScript checking and production build passed. Live browser verified all six editor groups and the complete read-only snapshot control. No live settings were changed. Fresh-context review found active-tab loading and omitted generated cutoff metadata issues; both were fixed and covered by regressions.
