# SequenceOS architecture

## Product scope

SequenceOS is a multi-tenant outbound sequence platform. The first release exposes a versioned JSON API and a React web client. Users belong to workspaces; every business record is owned by one workspace. The API is the authority for access and validation. The browser never talks directly to PostgreSQL, Redis, or sending providers.

## Runtime

- `apps/api`: TypeScript, Express, Prisma, PostgreSQL. Feature modules own routers, validation, and services.
- `apps/web`: React + Vite + TypeScript single-page client, consuming `/api/v1`.
- PostgreSQL: source of truth. All workspace-owned queries include the authenticated workspace id.
- Redis + BullMQ: delayed sequence work and provider send jobs. Jobs carry workspace and enrollment identifiers; workers re-check eligibility, suppression, enrollment state, and idempotency before sending.
- InfraOS adapter: outbound email provider boundary. Provider credentials are server-side secrets and never returned by API.
- Optional OpenAI Responses adapter generates preview-only message drafts on explicit user action. It sends contact name, company, title, template, and goal; it excludes email address and uses `store: false`.
- ScoutOS, TriageOS, and CRM adapters are integration boundaries; unsupported external contracts remain unimplemented until their API/auth/signature specs are known.

## Trust boundaries and security

1. Authenticate bearer access tokens and derive user id from verified claims, never request body/header workspace ids.
2. Resolve workspace access through active membership for each request. Workspace ids from URLs are selectors only; services scope every query by authorized workspace.
3. Validate request bodies, params, and query strings at the route boundary. Use Prisma parameterized queries; no raw SQL unless separately reviewed.
4. Hash passwords with Argon2id; store only token hashes for refresh/session revocation. Keep signing and integration secrets in environment/secret storage.
5. Enforce suppression and unsubscribe checks in the final worker immediately before provider dispatch. Use a database unique idempotency key per enrollment step.
6. Verify inbound webhook signatures against raw request bytes and reject stale/replayed delivery ids.
7. Apply Helmet, strict configurable CORS, request rate limits, bounded payloads, and structured redacted logs.

## API outline

`/api/v1/auth` (signup, login, refresh, logout), `/workspaces`, and workspace-scoped `/leads`, `/templates`, `/campaigns`, `/sequences`, `/enrollments`, `/analytics`, `/integrations`. Standard errors use `{ error: { code, message, requestId } }`. List endpoints use bounded cursor pagination. Webhooks live under `/api/v1/webhooks/:provider` and do not use browser auth.

## Data ownership

`User` ↔ `Membership` ↔ `Workspace` establishes tenant access. `Lead`, `Template`, `Campaign`, `Sequence`, `Enrollment`, `SendAttempt`, `Suppression`, and `Integration` have a workspace owner. Sequence steps define ordered delays and content; enrollments track progression; send attempts record idempotent delivery outcomes. Audit events capture security-relevant changes without storing credentials.

## Delivery slices

1. Foundation: API/web workspace, schema, configuration, containers, health check, documentation.
2. Identity and tenant isolation: signup/login/session, membership, scoped CRUD, automated authorization tests.
3. Campaign authoring: lead import/manual CRUD, templates, campaigns, sequence steps.
4. Execution: enrollment, delayed jobs, idempotent send adapter, suppression/unsubscribe, worker tests.
5. Integrations and analytics: provider/webhook contracts, CRM adapters, reporting, operational documentation.

External integrations need their real API contracts and credentials before they can be safely marked complete.
