#!/usr/bin/env bash
# Stops the project. Pass --volumes to also wipe the database, MinIO and node_modules volumes.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--volumes" ]; then
  docker compose down --volumes
else
  docker compose down
fi
