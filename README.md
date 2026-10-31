# Kick Playr Tenant Explorer

Responsive platform administration frontend built with Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Heroicons and Clerk. The sibling `kick-playr-tenant-explorer-api` provides the NestJS backend.

## Setup

1. Run `npm install` and copy `.env.example` to `.env.local`.
2. Configure the platform operator Clerk publishable and secret keys. This is the same instance used by the explorer API, separate from individual tenant identity realms.
3. Set the comma-separated `EXPLORER_ADMIN_SUBJECTS` allowlist on both frontend and API, and configure the API's `EXPLORER_AUTHORIZED_PARTIES` to include `http://localhost:3002` (or your exact hosted explorer origin).
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
- Inspect operational key sources in **Tenant → Keys**: environment variable names (or legacy file paths), profile, version, availability and SHA-256 fingerprints. The migrated local setup uses dotenv; Vercel uses server-side Secrets. Actual wrapping/index/control key values stay on the API server; this view is separate from the explorer credential vault.

The interface guards unsaved edits, prevents navigation during saves, retains failed edits and shows revision conflicts. Disabling a tenant retains its domains and history. Creating a tenant does not provision databases, DNS, providers or a deployment. Administrative integration records and arbitrary JSON metadata do not automatically change the runtime's existing encrypted operational settings/integrations; see the API README for the explicit adapter boundary.

## Authentication and proxy

The server checks Clerk sign-in and a platform operator allowlist before rendering the directory. All browser requests use `/api/explorer/*`. The Next.js route rechecks the platform allowlist, gets the Clerk session token on the server and forwards it to one configured upstream. The API independently verifies the JWT signature, issuer, authorized party and platform subject allowlist. No browser API key or tenant-supplied upstream URL is accepted.

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

### Manager invitations (APP-27)

The tenant editor has an Invitations tab for bootstrap invitations by email or exact Clerk user ID, with seven-day expiry, explicit recipient acceptance and separate delivery state. Resend invalidates the old link; failed/queued delivery can be retried. Creation needs the API's explicit tenant identity binding and dedicated working SMTP sender. This UI never returns/copies raw invitation tokens.

Acceptance uses the club APP's `/invitations` page and its own Clerk workspace, not the platform console identity. Operational access stays blocked until the separate APP-26 readiness/mapping contract is implemented. Existing unpublished club-settings code is not included in this branch.
