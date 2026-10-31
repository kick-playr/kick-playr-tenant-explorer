# Settings section navigation

Keep top-level Settings / Integrations. Settings gains a second navigation row with Seasons & membership, Appearance, People & shops, Billing, Trials & vouchers, Chat rooms, and All settings. Each panel has its own UI component, with a shared field renderer and an explicit component registry for extension. Keep draft state and saving in the parent, preserving edits between sections. Disable inactive fieldsets, retain existing validation and revision checks, reveal the relevant section on validation errors. No backend or stored configuration changes.

Verify section switching, draft preservation and changed-only saves with UI tests; run lint, type checking, build and live read-only visual verification.

Completed: seven registered section components, reusable field renderer, two-level navigation, shared cross-section drafts, disabled hidden controls, controlled selection across save remounts and validation-driven section reveal. Verified 32 tests, lint/type checking, production build, independent review and live Appearance navigation. No stored settings changed during verification.
