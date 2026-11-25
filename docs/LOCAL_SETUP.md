# Local Setup Guide

This guide starts SequenceOS on a development machine. It assumes you have a copy of the repository and are comfortable running commands in a terminal.

## 1. Install prerequisites

- Node.js 22 or newer and npm 10 or newer.
- Docker Engine and the Docker Compose plugin, or equivalent local PostgreSQL 16 and Redis 7 services.
- Git, if you are cloning the repository.

Install Docker using the [official Docker Engine instructions](https://docs.docker.com/engine/install/) for your operating system. On Ubuntu-based Linux Mint, Docker's Ubuntu steps may work, though Mint itself is not officially supported. On macOS or Windows, Docker Desktop includes Compose.

Check your tools:

```bash
node --version
npm --version
docker --version
docker compose version
```

## 2. Open the project folder

If you cloned the repository, change into its folder. For a folder named `Sequence OS` on your Desktop:

```bash
cd "$HOME/Desktop/Sequence OS"
```

Confirm you are in the project root. It contains `package.json`, `.env.example`, `docker-compose.yml`, and the `apps` and `prisma` folders:

```bash
pwd
ls -a
```

Run npm and Prisma commands from this project root. If npm reports `ENOENT` for `package.json`, the terminal is in the wrong folder.

## 3. Install dependencies and configure the environment

```bash
npm ci
cp .env.example .env
```

Open `.env` in a text editor and replace the example `JWT_SECRET` with a private random value. You can generate one with:

```bash
openssl rand -base64 48
```

Copy the generated value after `JWT_SECRET=`. Keep `.env` private; Git ignores it. Keep `EMAIL_PROVIDER=console` for local testing. Other provider keys are optional and should stay blank unless you have configured the corresponding service.

## 4. Start PostgreSQL and Redis

From the project root:

```bash
docker compose up -d
```

On Linux, if Docker reports a permissions error, use `sudo docker compose up -d`. Check that both services are running:

```bash
docker compose ps
```

The local database defaults are in `.env.example` and `docker-compose.yml`. They are for development only.

## 5. Create the database schema

```bash
npm run db:generate
npm run db:deploy
```

`db:generate` creates the Prisma client. `db:deploy` applies the checked-in migrations to the local database.

## 6. Start the API and dashboard

```bash
npm run dev
```

Keep this terminal open. The API listens on port 4000 and Vite serves the dashboard at [http://localhost:5173](http://localhost:5173). Open that address in a browser and use **Create an account** to make your first workspace.

Do not open `apps/web/index.html` directly as a `file://` URL; use the Vite address above.

## 7. Start the sequence worker

For sequence processing, open a second terminal and change into the project root again:

```bash
cd "$HOME/Desktop/Sequence OS"
npm run worker
```

Keep this terminal open while testing sequences. Create a lead, template, and campaign in the dashboard; activate the campaign, add a template step to a sequence, then enroll leads. The worker terminal should report `Email simulated` when it processes a job. Local console mode does not send real email.

## 8. Run checks

From the project root:

```bash
npm run typecheck
npm test
npm run lint
npm run format:check
npm run build
npm audit
```

The automated API tests mock Prisma. The local run above additionally exercises the database migration and lets you smoke-test Redis and the worker.

## Common issues

### `npm` says it cannot find `package.json`

The terminal is not in the project folder. Run `cd "$HOME/Desktop/Sequence OS"` (adjust the path if you put the project elsewhere), then retry.

### `docker: command not found` or `docker compose` is unavailable

Install Docker Engine and the Compose plugin for your OS using the official [Docker installation guide](https://docs.docker.com/engine/install/). Reopen the terminal and check `docker --version` and `docker compose version`.

### Docker reports permission denied

On Linux, run the compose command with `sudo`, for example `sudo docker compose up -d`.

### The API cannot connect to PostgreSQL or Redis

Check `docker compose ps`, ensure both services are healthy, and confirm the `DATABASE_URL` and `REDIS_URL` in `.env` match the local service ports. Check whether another service is already using ports 5432 or 6379.

### The web page does not load

Keep `npm run dev` running and open `http://localhost:5173`. The API should also be running on port 4000.

## Stop local services

Press **Ctrl+C** in the terminals running `npm run dev` and `npm run worker`. To stop PostgreSQL and Redis but keep their saved data, run:

```bash
docker compose down
```

Avoid `docker compose down -v` unless you intentionally want to delete the local database and Redis volumes.

## Optional integrations

- AI drafts require `OPENAI_API_KEY` in `.env`. Draft generation is explicit and preview-only.
- Real email delivery requires InfraOS credentials and verification of its API contract. Do not enable it just to test the local app.
- ScoutOS and CRM connectors are not available yet. TriageOS webhook handling needs confirmation against the provider's real contract.
