# Validation Report

Validation date: 2026-08-04

## Environment

- Node.js: `v22.16.0`
- npm: `10.9.2`
- Docker CLI: not installed in the build environment
- npm registry exposed by the environment: internal Artifactory proxy

## Requested commands

| Command | Result |
|---|---|
| `npm install` | Blocked by the execution environment. The internal npm proxy returned HTTP 404 for public packages, including `@aws-sdk/client-s3`; direct public-registry DNS was unavailable. No `node_modules` directory was produced. |
| `npm run build` | Not executable after the install failure (`nest: not found`). |
| `npm run lint` | Not executable after the install failure (`eslint: not found`). |
| `npm test` | Not executable after the install failure (`jest: not found`). |
| `docker build` | Not executable because the Docker CLI/daemon is unavailable. |
| `docker compose config` | Not executable because the Docker CLI is unavailable. |

## Completed offline checks

- TypeScript syntax/transpile validation passed for all 62 source and test files using TypeScript 5.8.3 available in the execution image.
- A strict compiler diagnostic scan found no project-internal diagnostics after excluding errors caused solely by unavailable dependency declarations and Node/Jest type packages.
- `package.json` and `package-lock.json` parse successfully.
- `docker-compose.yml` parses successfully as YAML.
- Shell scripts pass `bash -n` syntax validation.
- Required documentation files are present.
- `synchronize: true`, `migrationsRun: true`, migration execution, `CREATE TABLE`, and `ALTER TABLE` were not found in `src`.
- No migration directory or migration files exist.
- No `.env`, `node_modules`, `dist`, or coverage directory is included.
- No committed AWS access-key pattern was detected in source/test code.
- The generated archive contains only the new file-service project.

## Reproduction on a normal development machine

Run from the project root with access to the public npm registry or an correctly configured organizational mirror:

```bash
npm install
npm run build
npm run lint
npm test
docker compose config
docker build -t healthcare-file-service:1.0.0 .
```

The database-dependent readiness check requires the external `healthcare_db` Alembic migrations to have been applied first.

## Lockfile note

Because dependency resolution could not reach a registry containing the declared packages, the included lockfile records the exact root dependency manifest but could not be hydrated with transitive package integrity entries in this environment. Running `npm install` against a normal npm registry will complete it.
