#!/usr/bin/env sh
set -eu

npm run build
npm run lint
npm test
./scripts/verify-no-schema-management.sh

test ! -d node_modules || echo "node_modules exists locally and must be excluded from the release ZIP"
test ! -d dist || echo "dist exists locally and must be excluded from the release ZIP"
test ! -f .env || { echo ".env must not be included" >&2; exit 1; }

echo "Release checks completed."
