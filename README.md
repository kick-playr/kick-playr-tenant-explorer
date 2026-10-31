# Kick Playr Tenant Explorer

Responsive platform administration frontend built with Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Heroicons and Clerk. The sibling `kick-playr-tenant-explorer-api` provides the NestJS backend.

## Setup

1. Run `npm install` and copy `.env.example` to `.env.local`.
2. Configure the platform operator Clerk publishable and secret keys. This is the same instance used by the explorer API, separate from individual tenant identity realms.
3. Have the operator register the exact frontend host and origin in the shared encrypted control-database configuration. Its `explorer` section owns platform issuer, administrator subjects, authorized parties, club realms and frontend host mappings; neither frontend nor API reads these settings from environment JSON.
4. Set server-only `EXPLORER_API_ORIGIN` to the NestJS explorer API, normally `http://127.0.0.1:3003`. HTTPS is required for non-loopback hosts.
5. When you want to start it, run `npm run dev` on port **3002**. The existing club frontend/API ports 3001/3000 are unchanged. Without Clerk configuration the home page displays setup instructions and exposes no tenant data.

## Management

- Search tenants by club name, ID or hostname; filter by environment/status and paginate.
- Create provisioning tenants with opaque runtime resource references and a Clerk identity realm.
- Edit public identity, lifecycle, canonical domain and aliases.
- Maintain identity configuration and non-secret administrative JSON.
- Add/edit/remove provider connection records and reference encrypted credentials.
- Add/replace/revoke write-only credential values. Secrets are never returned or stored in local/session storage.
- Maintain existing Clerk users' tenant grants, contact mappings and `club:*` permissions; revoke access while retaining history.
- View the latest 100 administrative audit events, with timestamps in Europe/Zurich.
- Inspect operational key sources in **Tenant → Keys**: environment variable names, profile, version, availability and SHA-256 fingerprints. The migrated local setup uses dotenv; Vercel uses server-side Secrets. Actual wrapping/index/control key values stay on the API server; this view is separate from the explorer credential vault.

The interface guards unsaved edits, prevents navigation during saves, retains failed edits and shows revision conflicts. Disabling a tenant retains its domains and history. Creating a tenant does not provision databases, DNS, providers or a deployment. Administrative integration records and arbitrary JSON metadata do not automatically change the runtime's existing encrypted operational settings/integrations; see the API README for the explicit adapter boundary.

## Authentication and proxy

The server checks Clerk sign-in and uses the Explorer API's database-owned authorization policy before rendering the directory. All browser requests use `/api/explorer/*`. The Next.js route gets the Clerk session token on the server and forwards it to one configured upstream; the API remains the authorization authority. The API independently verifies the JWT signature, issuer, authorized party and platform subject allowlist. No browser API key or tenant-supplied upstream URL is accepted.

The proxy allows only tenant management paths, rejects cross-origin mutation requests, does not forward cookies/browser authorization, refuses redirects and applies a ten-second upstream deadline. Tenant API errors stay visible in the UI; network failures produce a safe connection message.

## Verification and build

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Tests exercise real React editor interactions in JSDOM plus client/proxy request handling. They use synthetic tenant responses and never write real tenants or providers. Production verification builds use `.next-production`, keeping the existing watch service's `.next` output separate. `npm start` serves the production build on port 3002.

A real signed-in browser session and Mongo-backed management flow require the environment configuration above and the running explorer API. No authentication bypass or demo data is shipped in the application.

## Club workspace

The **Settings** tab provides grouped editors for seasons and membership, appearance, responsible people, shops, billing deadlines, trials, vouchers and chat rooms. Nested values use labeled JSON editors. **All settings (read only)** shows the complete snapshot, including protected runtime configuration and generated values. Saves submit only changed writable fields with the current snapshot hash; invalid JSON blocks submission and failed saves preserve the draft. Integration secrets remain managed separately and are never included in settings responses.

Signed-in club administrators are authorized by the explorer API's live tenant grants. They see only their own clubs and operational settings/integrations. Platform operators retain the platform console and can switch to **My club settings** when they also hold a club administrator grant. Next.js no longer treats a frontend allowlist as the authority for club access.

Settings and provider changes go through the club runtime and its existing encrypted database. This workspace exposes no tenant creation, infrastructure, encryption-key, domain, lifecycle or grant-management controls. SMTP/IMAP/Pingen credential fields are write-only and cleared even after a failed submission; Bexio and Dropbox reconnect through OAuth.

The selected Clerk issuer must match the club's authority grant. The runtime must explicitly trust this explorer's origin and requires a session-bound JWT with its tenant audience. In the club's Clerk Dashboard, open **Sessions → Customize session token** and merge the required `aud` claim into the existing claims. For local FCRWW:

```json
{ "aud": "kick-playr:development:fcrww" }
```

Use the normal Clerk session token. Custom JWT templates do not carry the required session ID (`sid`) and are not supported for this runtime authentication flow. Preserve existing claims and session verification; do not remove the API's audience requirement. After changing claims, refresh the session or sign out and back in.

Additional club Clerk realms use dedicated, explicitly registered explorer hosts.
The encrypted `tenantWorkflowConfiguration` document `_id: "runtime:development"`
in the shared control database contains the `explorer.frontendHosts` map, for example:

```json
{
  "my-club.explorer.localhost:3002": {
    "publishableKey": "pk_test_REPLACE",
    "secretVariable": "EXPLORER_CLUB_MY_CLUB_CLERK_SECRET_KEY"
  }
}
```

Keep the referenced SDK secret and Clerk middleware encryption key in the
frontend server's environment:

```dotenv
EXPLORER_CLUB_MY_CLUB_CLERK_SECRET_KEY=sk_test_REPLACE
CLERK_ENCRYPTION_KEY=REPLACE_WITH_32_RANDOM_BYTES_AS_HEX
```

The matching issuer, pinned public JWT key and explorer origin belong in
`explorer.clubRealms`; fixed club application-proxy destinations belong in
`explorer.clubRuntimes`. `explorer.platformHosts` explicitly lists hosts using the
frontend's platform Clerk bootstrap keys. Platform authorization policy is stored
as `explorer.issuer`, `explorer.authorizedParties` and `explorer.adminSubjects`.
The club runtime must separately trust the explorer origin.

Server-side realm resolution calls the API's public `GET /public/realm?host=...`
endpoint. Only an exact registered host succeeds: platform responses contain
`{host, club:false}`; club responses contain only
`{host, club:true, publishableKey, secretVariable}`. The frontend resolves that
variable name against its own server environment. Secret values, settings and
grants never appear in this public projection. Unknown hosts, malformed
responses and unavailable configuration fail closed, without an environment JSON
or platform-host fallback.

Dynamic private keys are encrypted by Clerk's middleware; the React provider
receives only the selected public key. The frontend needs no shared MongoDB
wrapping key or tenant database credentials. Local club sign-in is registered at
`http://fcrww.explorer.localhost:3002`; the platform console is separately
registered at `http://localhost:3002`.

Platform **Users** forms include a **Tenant administrator** checkbox that adds the permissions needed by the club settings workspace. Other manual grants remain when the preset is unchecked. Enter `club:*:*` on its own line to request all currently supported club permissions for that tenant; the API expands it into explicit grants and excludes platform authority. Bexio's existing administrator-role checks remain enforced.

OAuth integration cards show the client ID and callback URL, plus whether a secret
is configured. Enter a replacement secret to save new client settings; changing
the client ID requires its matching secret. Saved settings are encrypted in the
club database and marked pending until a successful reconnect. Existing working
credentials stay in use until then. Stored secrets are never displayed, and new
secret inputs are cleared after submission, including failed saves.

SMTP and IMAP cards support mail server, TLS port, username and replacement
password; IMAP also supports inbox/archive folders. Active connections must be
disabled before edits. Server host allowlists and the fixed SMTP sender remain
enforced. Initial setup saves encrypted configuration without enabling it or
sending mail; use Enable separately when ready.

Settings uses a second navigation row for Seasons & membership, Appearance,
People & shops, Billing, Trials & vouchers, Chat rooms and the read-only snapshot.
Each section has a dedicated component under `src/components/settings-sections/`.
To extend the menu, add a section component and register its stable ID/label in
`settings-sections/registry.ts`; editable field definitions live in
`src/lib/club-settings.ts`. The editor owns shared drafts and saving, so section
switches retain edits. Selection survives a successful save; validation opens the
section containing an invalid field.

Integrations also uses a second-level provider menu. Provider components live in
`src/components/integration-sections/`; add providers to its `registry.ts`.
Connections from the same provider share a section, with a generic fallback for
new providers. Hidden sections remain mounted and disabled to retain unsaved
drafts while preventing inactive actions and browser form validation.

Connection settings start collapsed, with the provider, account reference, status
and connection actions still visible. Each card has its own keyboard-accessible
**Show settings / Hide settings** control. Collapsing keeps editors mounted and
preserves unsaved values without saving or resetting them; hidden fields are
disabled and excluded from keyboard navigation and form validation. Opening a
card retains the existing busy, active-connection and save restrictions. Expansion
is local to the current page; a fresh page load starts collapsed (APP-25).

### Theme palettes

The theme registry is `src/lib/theme.ts`. Green uses the website's light green
surfaces, Black uses its dark navy/green palette, and White uses its light palette.
All three share Kick Playr's lime accent. CSS components use semantic
`--color-*` tokens; the older `--ink`, `--paper` and `--theme-*` names are aliases.

To add a theme, add one definition to `themeDefinitions` with a unique stable
`id`, `name`, accessible `label`, `icon` (`desktop`, `sun`, `moon`, or `palette`),
`logo` (`black` or `white`, chosen for surface contrast), `colorScheme`, and a complete `palette` (spread an existing palette and override
colors). The switcher, validation, persisted preference, initial-paint script and
CSS rules derive from the registry automatically. No theme-specific component
selectors are needed. Theme tests check normal-text contrast against WCAG AA.
Email previews deliberately use the White palette to represent an email page.

Website logo assets are copied into `public/brand/` (no runtime dependency on the
website). `ThemeLogo` selects the black or white asset through registry-generated
CSS, so the contrasting logo is selected before hydration. Green and White use
the black artwork; Black uses the white artwork. Brand headers, platform sidebar,
sign-in and setup pages share this component.
The favicon uses the same per-theme logo metadata. The initial theme script owns
its link independently of React head resources, avoiding duplicate icons during
hydration; theme selection and cross-tab preference changes update it in place.


### Club branding and custom colors

Club administrators configure **Settings → Appearance → Club branding**. Upload a
light logo and favicon, optionally add dark variants and a brand name, and enable
**Custom theme** to choose the club's background, panel, text, border and accent
colors. Text contrast is validated before saving. Custom theme becomes available
in the header theme switcher after **Save club settings**; drafts only change the
editor preview. Green, White and Black remain available.

Branding is stored with the club's encrypted settings and uses the same revision
checks and tenant authorization. Browser uploads accept PNG, JPEG and WebP (also
ICO for favicons), up to 2 MB before resizing. Logos are reduced to at most 256 px,
favicons to 64 px, and each saved asset is limited to 8 KiB. Complex images are
resized further automatically; SVG and animated assets are not stored. Removing
an asset restores the corresponding Kick Playr fallback.

The lightweight authorized `/api/settings/branding` projection supplies branding
without exposing integration settings. Explorer favicons use an authenticated
same-origin image route with private caching; logos use the validated image data.
Club custom styles load after authorization, with a built-in palette during the
initial request. Branding is scoped to the current club and cleared on a club
change; no credentials or environment-variable changes are needed.
