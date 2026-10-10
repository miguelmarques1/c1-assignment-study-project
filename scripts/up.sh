#!/usr/bin/env bash
# Brings the whole project up: containers, shared build, Prisma client, migrations and both dev servers.
# Run from Git Bash. Docker Desktop must be running.
set -euo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1

docker compose up -d

# A stale shared build or Prisma client makes the API fail to compile (hundreds of TS errors).
docker compose exec api sh -c 'cd /workspace/packages/shared && pnpm build'
docker compose exec api sh -c 'cd /workspace/apps/api && pnpm exec prisma generate && pnpm exec prisma migrate deploy'

# Dev servers run detached; polling is needed because host edits on the bind mount are not seen otherwise.
docker compose exec -d api sh -c 'cd /workspace/apps/api && TSC_WATCHFILE=DynamicPriorityPolling TSC_WATCHDIRECTORY=DynamicPriorityPolling pnpm dev > /tmp/api-dev.log 2>&1'
docker compose exec -d web sh -c 'cd /workspace/apps/web && WATCHPACK_POLLING=true CHOKIDAR_USEPOLLING=true pnpm dev > /tmp/web-dev.log 2>&1'

echo "Web: http://localhost:3000   API: http://localhost:3001 (Swagger at /docs)"
echo "Logs: docker compose exec api tail -f /tmp/api-dev.log | /tmp/web-dev.log in web"
echo "First run only: docker compose exec api pnpm db:seed"
