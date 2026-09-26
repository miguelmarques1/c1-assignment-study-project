# English Quest

A private study platform for reaching CEFR **C1** in English. Two learners hold a live
conversation lesson over WebRTC; the recording is transcribed, scored for pronunciation
and analysed into an individual diagnosis that drives a personalised study plan.

Everything runs locally under Docker. All AI and Speech consumption runs on each
participant's own API keys.

See [`docs/prd.md`](docs/prd.md) for the product definition and
[`docs/`](docs/) for per-feature specifications.

## Requirements

- Docker Desktop with Compose v2
- Node 22+ and pnpm 9 on the host are optional — every command below runs inside a container

## Setup

```bash
cp .env.example .env
```

Fill in the values marked `CHANGE ME`. At minimum:

- `SESSION_SECRET` — at least 32 characters. Generate one with `openssl rand -base64 48`.
  The API refuses to boot with a shorter secret.
- `SEED_USERS` — the accounts to create, as a JSON array.

Then bring the stack up and install dependencies once:

```bash
docker compose up -d
docker compose exec api pnpm install
```

## Running

The `api` and `web` containers start **idle** on purpose, so you run only what a given
task needs and leave the rest of the machine free.

```bash
# everything
docker compose up -d

# only the API and its backing services (leaves LiveKit down)
docker compose up -d api
```

Start the dev servers from inside their containers:

```bash
docker compose exec api pnpm dev     # API on http://localhost:3001
docker compose exec web pnpm dev     # web on http://localhost:3000
```

The API applies pending migrations at boot and refuses to start until PostgreSQL and
Redis answer. It logs a readiness line listing every dependency with its latency.

## Common commands

| Task | Command |
|---|---|
| Shell into the API container | `docker compose exec api bash` |
| Regenerate the OpenAPI snapshot | `docker compose exec api sh -c 'cd apps/api && pnpm openapi:generate'` |
| Apply migrations | `docker compose exec api pnpm db:migrate` |
| Seed the configured accounts | `docker compose exec api pnpm db:seed` |
| Import curated content ([assignment-content/README.md](assignment-content/README.md)) | `docker compose exec api sh -c 'cd apps/api && pnpm content:import'` |
| Check an import without writing anything | `docker compose exec api sh -c 'cd apps/api && pnpm content:import --dry-run'` |
| Run the API test suite | `docker compose exec api pnpm test` |
| Lint everything | `docker compose exec api pnpm -r lint` |
| Typecheck everything | `docker compose exec api pnpm -r typecheck` |
| Tail logs | `docker compose logs -f` |
| Stop the stack | `docker compose down` |

Root `package.json` mirrors these as shortcuts (`pnpm up`, `pnpm api`, `pnpm db:seed`, …)
for when pnpm is available on the host.

## Services

| Service | Host port | Purpose |
|---|---|---|
| web | 3000 | Next.js client — lessons, history, activities |
| api | 3001 | NestJS API |
| postgres | 5432 | Relational store |
| redis | 6379 | Sessions, login throttling, job queues |
| minio | 9000 / 9001 | S3-compatible object storage (console on 9001) |
| livekit | 7880 / 7881 | Self-hosted WebRTC server |

Health of every dependency: `curl http://localhost:3001/health`.

## API documentation

| Surface | Where |
|---|---|
| Swagger UI | <http://localhost:3001/docs> |
| OpenAPI document | <http://localhost:3001/docs-json> · <http://localhost:3001/docs-yaml> |
| Committed snapshot | [`docs/api/openapi.json`](docs/api/openapi.json) |

The snapshot is what you import into **Postman or Insomnia** — no running stack required.
Enable the client's cookie jar and a `POST /auth/login` keeps you authenticated for
everything else; the session cookie is HttpOnly, so there is no token to copy by hand.

Schemas are generated from the Zod contracts in `packages/shared`, so the document always
matches what the API enforces. **Every new or changed route must be annotated and the
snapshot regenerated** — `test/unit/openapi.spec.ts` fails the build otherwise. The full
convention is in [F01's spec, section 5](docs/F01-local-infrastructure-and-authentication/spec.md).

## Accounts

There is no public registration and no password reset — by design. Accounts come from
`SEED_USERS` via `pnpm db:seed`, which is idempotent by email and leaves accounts it does
not list untouched. A row inserted directly into the database works just as well.
