# Validation Report

Validation date: 2026-08-04

## Environment

- Node.js: `v24.4.1`
- npm: `11.12.1`
- Docker: `28.5.1`

## Requested commands

| Command | Result |
|---|---|
| `npm install` | Passed; 801 dependency packages installed and the lockfile was hydrated. npm reported 4 dependency audit findings (1 moderate, 3 high); no automatic or forced dependency changes were applied. |
| `npm run build` | Passed. |
| `npm run lint` | Passed with zero warnings. |
| `npm test` | Passed: 14 suites, 41 tests, including runtime Nest dependency/DTO metadata, Swagger document generation, and environment-specific CSP regression coverage. |
| `docker compose config --quiet` | Passed. Docker emitted a local user-config access warning, but Compose validation completed successfully. |

## Database safety checks

- No use of the obsolete split database variables or obsolete timeout name remains outside excluded dependency/build output.
- `DATABASE_URL` is validated for `postgresql://` and `postgres://` and passed directly to TypeORM.
- TypeORM explicitly sets `synchronize: false`, `migrationsRun: false`, and `dropSchema: false`.
- No schema synchronization, migration execution, database/schema/table creation, or table alteration code was found in `src`.
- No migration files or SQL initialization files exist.
- Readiness executes exactly `SELECT 1` for PostgreSQL and independently checks S3.
- Docker Compose contains no PostgreSQL image, service, health check, volume, initialization, credentials, or dependency.
- Only documented/example PostgreSQL URLs and deliberately fake test URLs are tracked; `.env` is ignored by Git.
- `docker-compose.yml` parses successfully. The service receives `DATABASE_URL` from the external Compose environment.

## Reproduction

Run from the project root with access to the public npm registry or an correctly configured organizational mirror:

```bash
npm install
npm run build
npm run lint
npm test
docker compose config
docker build -t healthcare-file-service:1.0.0 .
```

The database must already exist and the external `healthcare_db` migrations must be applied first. This service does not provision or migrate it. A real ignored `.env` may be used locally, but it must never be committed or populated with production credentials in source control.
