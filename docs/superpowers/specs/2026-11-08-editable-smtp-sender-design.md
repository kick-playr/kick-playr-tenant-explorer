# Editable SMTP sender

The Club administration SMTP Sender address must be editable and saved for the selected tenant. The current input is read-only because mailSettings fixes the address to the runtime sender policy, the native static-token projection compares Vault sender to that policy, and the SMTP factory rejects mismatches. Removing only readOnly would produce a misleading Save flow.

Proposed approach: make the tenant's versioned Vault SMTP integration sender the authoritative SMTP address. Keep the tenant-owned sender name/reply-to policy, administrator checks, active-connection edit lock, exact tenant/application bindings, TLS/host validation and immutable version/concurrency checks. Add a narrow save flow that publishes the reviewed static version through existing authenticated Vault administration, reconciles unknown publication outcomes and then refreshes connection metadata. The UI submits fromAddress, validates email syntax and shows the resulting confirmed value; no email is sent during verification.

Alternative: keep the current fixed sender policy and edit it through a separate operator configuration flow. This retains the current authority model but does not provide the requested inline club-admin edit. A cosmetic input alone is rejected because the current backend would deny or ignore a changed address.

Approval requested for the proposed authoritative Vault configuration approach before changing the existing sender boundary. No sender values or configuration have been changed.
