#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: ./scripts/new_migration.sh migration_name"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

npx --yes dbmate@2.33.0 \
  --env-file backend/.env \
  --migrations-dir backend/migrations \
  --no-dump-schema \
  new "$1"