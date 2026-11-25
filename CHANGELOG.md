# Changelog

## 0.1.0 — 2026-11-24

- Created the initial API-first monorepo, PostgreSQL schema, migration, and Docker development services.
- Added password authentication, rotating HttpOnly refresh sessions, membership checks, tenant-scoped lead/campaign/template/sequence routes, suppression rules, analytics, and integration settings.
- Added durable sequence outbox scheduling, BullMQ worker, simulated local delivery, InfraOS adapter, signed unsubscribe links, and HMAC/replay-protected TriageOS webhook handling.
- Added a responsive dashboard for workspace metrics, leads, campaigns, templates, sequences, and settings.
- Added optional, explicitly requested AI draft generation through the OpenAI Responses API. Drafts are preview-only and omit the lead email address.
- Upgraded dependencies to pass npm audit; tests, typecheck, production build, API docs, and setup instructions are included.

This is an initial development release. See `PROGRESS.md` for checks that still require a local PostgreSQL/Redis runtime or external provider contract.
