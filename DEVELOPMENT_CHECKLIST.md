# SequenceOS Development Checklist

This is the verification record for the current local MVP. `[x]` means the work and listed checks passed. `[?]` means blocked or not verified against a real service. Recheck this file and `PROGRESS.md` after each meaningful change.

Status legend: `[ ]` Not started · `[~]` In progress · `[x]` Verified complete · `[!]` Failed · `[?]` Blocked / unverified

## Architecture & Setup

- [x] Inspect existing repository. (Started empty; inspected on 2026-11-24.)
- [x] Design API-first architecture. (`ARCHITECTURE.md` documents boundaries and trust assumptions.)
- [x] Design database schema. (Prisma schema and checked-in initial PostgreSQL migration; generated SQL matches schema.)
- [x] Establish modular project structure. (npm workspaces for API and web.)
- [x] Configure Node.js, Express and PostgreSQL. (Express and Prisma/PostgreSQL configuration; typecheck/build pass. Runtime DB connection not tested.)
- [x] Configure Prisma, Redis and BullMQ. (Client generated; queue/worker code and Compose services configured.)
- [x] Configure environment variables and Docker. (`.env.example`, Compose, and ignore rules present.)
- [?] Apply migration and smoke test real PostgreSQL/Redis services. (Docker and psql are unavailable in this environment.)

## Backend & APIs

- [x] Implement authentication and authorization. (Argon2 credentials, short-lived JWT access, hashed rotating refresh sessions, membership checks; covered by tests.)
- [x] Implement workspace-based multi-tenancy. (Workspace-scoped routes and tenant authorization tests pass.)
- [x] Implement lead management. (Scoped CRUD and validation.)
- [x] Implement campaign management. (Scoped authoring and activation/pause.)
- [x] Implement email templates. (Scoped CRUD.)
- [x] Implement AI personalization. (Explicit draft-only endpoint; no email address, no persistence or send; typecheck and tests pass. Live provider call unverified.)
- [x] Implement sequence execution engine. (Sequence, step, enrollment and transactional outbox path; tests pass.)
- [x] Implement background workers and scheduling. (BullMQ dispatch and send worker; worker unit tests pass; Redis runtime unverified.)
- [x] Implement API documentation. (`apps/api/openapi.yaml`.)
- [?] Implement API integration with ScoutOS. (Provider contract and credentials not supplied.)
- [?] Implement InfraOS sending integration. (Adapter implemented; provider contract, credentials and staging delivery not verified.)
- [x] Implement TriageOS webhooks. (HMAC verification and event deduplication implemented and covered by tests; real provider contract unverified.)
- [?] Implement CRM integrations. (Contracts and credentials not supplied.)

## Frontend

- [x] Implement dashboard.
- [x] Implement lead management UI.
- [x] Implement campaign builder.
- [x] Implement email template editor.
- [x] Implement visual sequence builder.
- [x] Implement analytics.
- [x] Implement integration settings.
- [x] Ensure responsive design. (Responsive styles implemented; no browser/device QA performed.)

## Security

- [x] Secure authentication and authorization. (Covered by code review and API tests.)
- [x] Verify workspace data isolation. (Tenant guard and cross-workspace tests pass.)
- [x] Validate API inputs and handle errors. (Schema validation, bounded payloads, centralized errors; tests pass.)
- [x] Protect against SQL injection and XSS. (Prisma parameterized queries; React escaped rendering; Semgrep clean.)
- [x] Configure CORS, Helmet and rate limiting. (Exact origin allowlist, security headers, request limits.)
- [x] Protect API keys and sensitive credentials. (Environment-based credentials; `.env` ignored; Gitleaks clean.)
- [x] Verify webhook signatures. (HMAC and replay/deduplication checks implemented; tests pass.)
- [x] Prevent duplicate email sends. (Outbox and idempotency key handling; unit tests pass; provider behavior unverified.)
- [x] Enforce unsubscribe and suppression rules. (Signed unsubscribe and final suppression check before dispatch; tests pass.)
- [x] Audit dependencies and vulnerabilities. (`npm audit --audit-level=low`: 0 vulnerabilities, 2026-11-24.)
- [x] Scan source for common security issues. (Semgrep: 210 rules / 30 files, 0 findings, 2026-11-24.)
- [x] Scan working tree for secrets. (Gitleaks 8.30.1 directory scan: no leaks, 2026-11-24.)
- [?] Verify production secrets, TLS, shared rate limits, and provider credentials. (Requires deployment environment.)

## Testing & Production

- [x] Write unit and API tests. (`npm test`: 6 files, 28 tests passed.)
- [?] Write/run database-backed integration tests. (Current API tests use mocked Prisma; no local PostgreSQL service available.)
- [x] Test API endpoints, authorization, tenant isolation, and security paths. (Included in passing API suite.)
- [x] Test background worker logic. (Worker unit tests pass; Redis/queue runtime not available.)
- [x] Run ESLint and Prettier checks. (`npm run lint` and `npm run format:check` pass.)
- [x] Run npm audit. (0 vulnerabilities.)
- [x] Run Semgrep and Gitleaks. (Both clean; results above.)
- [x] Verify production build. (`npm run build` passes for API and web.)
- [x] Document remaining security and operational risks. (`README.md`, `ARCHITECTURE.md`, and `PROGRESS.md`.)
- [x] Update README and CHANGELOG.
- [x] Write a GitHub-facing project overview and a step-by-step local setup guide. (`README.md`, `docs/LOCAL_SETUP.md`; formatting check passed.)
- [~] Create/publish the GitHub repository. (`Harshit-149/SequenceOS` exists and is verified private; the README is committed. Full project file upload is in progress.)
- [?] Run Gitleaks on the revised documentation. (Gitleaks binary is unavailable in the current environment; docs were manually reviewed for credentials. The prior full-tree scan passed on 2026-11-24.)
- [?] Production readiness and live delivery. (Requires real database/Redis, TLS/secrets, provider contract verification and staging send.)

## Mandatory self-review

For each change, review complexity, auth/authorization/tenant scope, validation/error handling, query behavior, relevant tests/lint, and applicable security checks. Fix findings and rerun checks. Stop on critical vulnerabilities, tenant isolation failures, exposed secrets, data-loss risks, or major architecture changes.
