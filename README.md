# Healthcare File Service

## Documentation map

- [API reference](docs/API.md)
- [Architecture](ARCHITECTURE.md)
- [Deployment runbook](docs/DEPLOYMENT_RUNBOOK.md)
- [Environment template](.env.example)

## Technology and operational log

Node.js 22+, NestJS 11, TypeScript, TypeORM, PostgreSQL, AWS SDK v3/S3, MinIO, Sharp, Swagger, Pino, Docker, and npm lockfile reproducibility are used here.

```text
INFO service_started service=healthcare-file-service environment=production
INFO file_upload_completed file_id=<uuid> request_id=<uuid>
```

Production-grade NestJS microservice for public and private healthcare file storage. It maps the existing PostgreSQL schema owned by `healthcare_db`; it never creates, alters, synchronizes, or migrates database objects.

## Key properties

- NestJS 11, TypeScript, TypeORM, PostgreSQL, AWS SDK v3, S3/MinIO, Swagger, Pino, Sharp, Jest.
- Canonical metadata in `platform.file_objects`.
- Idempotent direct-to-S3 reservations in `platform.file_upload_sessions`.
- Public URL support through CloudFront or a configured public S3 base URL.
- Short-lived presigned private download URLs.
- Strict resource mappings; clients cannot provide table names, schema names, columns, buckets, prefixes, or object keys.
- MIME, extension, size, filename, resource, category, and visibility validation.
- S3/database compensating actions for partial failures.
- Multiple upload only for verified link-table resources; direct single-reference fields require explicit replacement.
- No JWT implementation. The service is intended for a private VPC behind a trusted API Gateway.

## Prerequisites

- Node.js 22+
- npm 10+
- PostgreSQL 15+ with all `healthcare_db` Alembic migrations applied
- Amazon S3, MinIO, or another compatible object store

## Important database rule

This service connects to one already-existing PostgreSQL database using `DATABASE_URL`. The database and every required schema/table must exist before the service starts. Apply the separate database project first:

```bash
cd healthcare_db
alembic upgrade head
```

`healthcare_db` is the sole schema and migration authority. This service contains no migrations, never creates or alters database objects, and permanently configures TypeORM with synchronization and automatic migration execution disabled. Startup fails if configuration is invalid or the configured database cannot be reached after connection retries. Readiness reports unavailable using a non-mutating `SELECT 1` check and does not expose connection details.

## Local setup

```bash
cp .env.example .env
npm install
npm run build
npm run start:dev
```

Swagger is available at `http://localhost:3000/docs` and OpenAPI JSON at `http://localhost:3000/openapi.json` when `SWAGGER_ENABLED=true`.

Health routes:

- `GET /health` and `GET /health/live`
- `GET /ready` and `GET /health/ready`

Versioned file API base:

```text
http://localhost:3000/api/v1/files
```

## Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

The Compose stack starts the file service and MinIO only. It does not create PostgreSQL, database volumes, schemas, tables, or run migrations. Set `DATABASE_URL` to an existing database reachable from the container:

```env
# PostgreSQL on the Docker host
DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/healthcare

# PostgreSQL in another Compose service on the same network
DATABASE_URL=postgresql://postgres:postgres@postgres-service-name:5432/healthcare

# Managed PostgreSQL
DATABASE_URL=postgresql://username:password@database-host:5432/healthcare
DATABASE_SSL=true
```

These values are examples only. Never commit real credentials. In production, use secret injection and a runtime role without database/schema creation or schema modification privileges; grant only the table and sequence operations required by the file workflows.

## Standard response contract

Success:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": {
    "requestId": "6c6f95f7-5750-4be9-9a92-a76c30d69f0b",
    "correlationId": "6c6f95f7-5750-4be9-9a92-a76c30d69f0b",
    "apiVersion": "v1",
    "timestamp": "2026-08-04T06:00:00.000Z"
  }
}
```

Error:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "UNSUPPORTED_FILE_TYPE",
    "message": "The file MIME type is not allowed.",
    "details": null
  },
  "meta": {
    "requestId": "6c6f95f7-5750-4be9-9a92-a76c30d69f0b",
    "correlationId": "6c6f95f7-5750-4be9-9a92-a76c30d69f0b",
    "apiVersion": "v1",
    "timestamp": "2026-08-04T06:00:00.000Z"
  }
}
```

This matches the response contract detected in `auth_service/app/common/response.py`.

## Main endpoints

| Method | Path                                      | Purpose                                |
| ------ | ----------------------------------------- | -------------------------------------- |
| POST   | `/api/v1/files/upload`                    | Server-side single upload              |
| POST   | `/api/v1/files/upload-multiple`           | Server-side multiple upload            |
| POST   | `/api/v1/files/presigned-upload`          | Reserve metadata and create S3 PUT URL |
| POST   | `/api/v1/files/presigned-upload/complete` | Verify with `HeadObject` and finalize  |
| GET    | `/api/v1/files/:id`                       | Metadata                               |
| GET    | `/api/v1/files/:id/download-url`          | Private signed URL                     |
| PUT    | `/api/v1/files/:id/replace`               | Safe replacement                       |
| DELETE | `/api/v1/files/:id`                       | Association cleanup and deletion       |
| POST   | `/api/v1/files/bulk-delete`               | Per-file bulk deletion results         |

See [docs/API.md](docs/API.md) for the complete API contract.

## Trusted gateway headers

The service accepts configurable headers for request identity and tracing:

- `X-Internal-Service-Key`
- `X-Request-ID`
- `X-Correlation-ID`
- `X-User-ID`
- `X-Actor-ID`
- `X-Roles`
- `Idempotency-Key`

These headers are not proof of identity by themselves. The service must be private, and the Gateway/load balancer must strip client-provided values before injecting trusted values.

## Public and private behavior

Public files use the public bucket/prefix and expose `public_url` after successful upload, scan, and database association. CloudFront is preferred. Public read access is bucket-policy or CloudFront based; the service never makes a bucket publicly writable and does not use object ACLs.

Private files use the private bucket/prefix. Persistent responses contain the internal file ID and object key, never a permanent public URL. A short-lived signed URL is generated on demand, returned with `Cache-Control: private, no-store`, and not logged.

## Malware scanning

The included scanner is explicitly a development no-op adapter. It exercises the scanning interface and writes a scan event, but it does not inspect malware. Startup rejects this adapter in `production` unless `ALLOW_NOOP_SCANNER_IN_PRODUCTION=true` is deliberately supplied. Replace it with ClamAV, GuardDuty Malware Protection for S3, or an asynchronous queue-driven scanner before production use. MIME inspection is not malware scanning.

## Validation commands

```bash
npm install
npm run build
npm run lint
npm test
./scripts/verify-no-schema-management.sh
```

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [docs/API.md](docs/API.md)
- [DEPLOYMENT.md](DEPLOYMENT.md)
- [SECURITY.md](SECURITY.md)
- [DATABASE_MAPPING.md](DATABASE_MAPPING.md)
- [S3_STORAGE_DESIGN.md](S3_STORAGE_DESIGN.md)
- [ERROR_CODES.md](ERROR_CODES.md)
- [TESTING.md](TESTING.md)
- [docs/API_GATEWAY_INTEGRATION.md](docs/API_GATEWAY_INTEGRATION.md)
