# SequenceOS

SequenceOS is a multi-tenant workspace for organizing leads into email campaigns and follow-up sequences. It includes a React dashboard, a JSON API, PostgreSQL storage, and a Redis-backed worker.

> **Development status:** SequenceOS is an MVP for local testing. Local delivery uses a console simulator and does not send email. Provider integrations require contract and staging verification before production use.

## What you can do

- Create a workspace account and manage workspace-scoped leads.
- Write reusable email templates with `{{firstName}}` and `{{company}}` placeholders.
- Group sequences in campaigns and activate or pause campaigns.
- Add delayed template steps to sequences and enroll leads.
- Process queued sequence jobs with a separate background worker.
- Review workspace metrics and delivery statuses in the dashboard.
- Optionally request an AI-generated draft for review; the draft is not sent automatically.

## Run locally

See the detailed [Local Setup Guide](docs/LOCAL_SETUP.md) for prerequisites, environment configuration, startup, testing, and troubleshooting.

Quick start (from the project root, with Node.js 22+, npm 10+, and Docker Compose installed):

```bash
npm ci
cp .env.example .env
# Set JWT_SECRET in .env to a unique secret (see the setup guide).
docker compose up -d
npm run db:generate
npm run db:deploy
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and create an account. In a second terminal, start the worker with `npm run worker` to process sequence jobs. Keep `EMAIL_PROVIDER=console` for safe local testing.

## Architecture

- `apps/web` — React and Vite dashboard.
- `apps/api` — Express API, authentication, routes, validation, and worker.
- `prisma` — PostgreSQL schema and migrations.
- `docker-compose.yml` — local PostgreSQL 16 and Redis 7 services.
- API prefix: `/api/v1`; OpenAPI specification: [`apps/api/openapi.yaml`](apps/api/openapi.yaml).
- Design and trust boundaries: [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Development checks

```bash
npm run typecheck
npm test
npm run lint
npm run format:check
npm run build
npm audit
```

The API test suite uses mocked Prisma for tenant-authorization coverage. Apply the migration and test against local PostgreSQL and Redis as described in the setup guide for a runtime smoke test.

## Integrations and current limits

- **Email:** The local console provider records simulated sends. An InfraOS adapter exists, but its request/response contract and live delivery need staging verification.
- **AI drafts:** Optional. Configure `OPENAI_API_KEY`; drafts are only generated on explicit request and should be reviewed.
- **TriageOS:** HMAC webhook verification and event deduplication are implemented; confirm the format with the real provider.
- **ScoutOS and CRM:** Not connected yet; API contracts and credentials are needed.

Read [`PROGRESS.md`](PROGRESS.md) and [`DEVELOPMENT_CHECKLIST.md`](DEVELOPMENT_CHECKLIST.md) for verified checks and remaining work. Do not commit `.env` or provider credentials. See [`.env.example`](.env.example) for configuration names.
