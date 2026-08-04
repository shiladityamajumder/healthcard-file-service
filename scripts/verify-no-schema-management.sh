#!/usr/bin/env sh
set -eu

# Keep this guard broad: the service may query existing tables but never owns schema lifecycle.
if grep -R --line-number --exclude-dir=node_modules --exclude-dir=dist \
  -E 'synchronize[[:space:]]*:[[:space:]]*true|migrationsRun[[:space:]]*:[[:space:]]*true|runMigrations\(|\.synchronize\(|createDatabase\(|createSchema\(|createTable\(|CREATE[[:space:]]+(DATABASE|SCHEMA|TABLE)|ALTER[[:space:]]+TABLE' src; then
  echo "Schema-management code detected." >&2
  exit 1
fi

echo "No automatic schema synchronization or migration execution detected."
