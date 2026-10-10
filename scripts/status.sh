#!/usr/bin/env bash
# Shows container state and whether the API and web answer.
cd "$(dirname "$0")/.."
docker compose ps
printf 'api  /health -> '; curl -s -m 5 -o /dev/null -w '%{http_code}\n' http://localhost:3001/health || echo down
printf 'web  /       -> '; curl -s -m 20 -o /dev/null -w '%{http_code}\n' http://localhost:3000 || echo down
