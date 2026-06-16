#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

npx --yes dbmate@2.33.0 \
  --env-file backend/.env \
  --migrations-dir backend/migrations \
  --no-dump-schema \
  --wait \
  up
