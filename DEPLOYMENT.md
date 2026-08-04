# Deployment

## Local

1. Copy `.env.example` to `.env`.
2. Provision an existing PostgreSQL database and apply all `healthcare_db` Alembic migrations.
3. Set `DATABASE_URL` to that database and configure TLS as appropriate.
4. Start MinIO or configure S3.
5. Run `npm install`, `npm run build`, and `npm run start:prod`.

The file service never provisions the database and never creates schemas/tables or runs migrations. TypeORM synchronization, migration execution, and schema dropping are permanently disabled. Invalid connection configuration fails startup with a sanitized configuration error; an unavailable database causes bounded connection retries followed by startup failure.

## Docker Compose database connections

The default Compose file does not contain PostgreSQL. It passes the externally supplied `DATABASE_URL` into the file-service container and retains MinIO for local object-storage development.

```env
# PostgreSQL running on the host
DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/healthcare

# PostgreSQL running as another Compose service on the same network
DATABASE_URL=postgresql://postgres:postgres@postgres-service-name:5432/healthcare

# Managed PostgreSQL
DATABASE_URL=postgresql://username:password@database-host:5432/healthcare
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
```

The connection strings are placeholders. Supply real values from a secret manager or deployment secret, never source control.

## Docker image

The Dockerfile uses Node.js 22, a build stage, production dependency pruning, a non-root UID/GID, and `SIGTERM` for graceful shutdown.

```bash
docker build -t healthcare-file-service:1.0.0 .
docker run --rm --env-file .env -p 3000:3000 healthcare-file-service:1.0.0
```

## ECS

- Run in private subnets without public IPs.
- Use an internal ALB or Cloud Map/service connect.
- Store secrets in Secrets Manager or SSM Parameter Store.
- Use a task role for S3/KMS permissions; omit static AWS keys.
- Configure ALB health checks on `/health`; use `/ready` for deployment readiness where dependency-aware checks are desired.
- Set deregistration delay longer than expected upload request duration.
- Stream stdout JSON logs to CloudWatch.
- Scale on CPU, memory, request count, and p95 latency.

## EKS

- Use a Deployment with multiple replicas and a PodDisruptionBudget.
- Use IRSA for S3/KMS permissions.
- Liveness: `/health`; readiness: `/ready`.
- Use private ingress/internal load balancer.
- Set resource requests/limits, especially memory because server-side multipart uploads are buffered.
- Prefer presigned uploads for large files.

## PostgreSQL

- The database must already exist and all required schemas/tables must be applied by `healthcare_db` as a separate release step before this service starts.
- Connect only through `DATABASE_URL`; do not deploy the obsolete individual host, port, database, username, or password settings.
- This service never creates, migrates, synchronizes, alters, or drops database objects.
- Use PgBouncer when connection fan-out warrants it.
- Set `DATABASE_POOL_MAX` per replica so total connections remain below database capacity.
- Use TLS in production. Keep `DATABASE_SSL_REJECT_UNAUTHORIZED=true`; disable certificate verification only for a controlled environment with an explicit risk decision.
- Confirm search paths/permissions include all mapped schemas; entities use fully qualified schema names.

### Recommended production privilege model

Use separate migration and runtime roles. Only the `healthcare_db` migration role should own schemas or hold database/schema creation and DDL permissions. The file-service runtime role should have `CONNECT` on the database and `USAGE` on only the mapped schemas. Grant table-level `SELECT`, `INSERT`, `UPDATE`, and `DELETE` only where the documented file workflows require them, and sequence `USAGE`/`SELECT` only if an accessed table actually uses a sequence. Do not grant `CREATE` on the database or schemas, ownership, superuser, `CREATEDB`, `CREATEROLE`, or broad default privileges. Review the exact table access list in `DATABASE_MAPPING.md`.

The readiness query needs no schema modification privilege. If PostgreSQL or S3 is unavailable, `/ready` returns a normalized 503 response containing only dependency status booleans.

## S3 and CloudFront

- Block public access on the private bucket.
- For public files, use CloudFront Origin Access Control or a narrow bucket read policy.
- Keep all buckets non-publicly-writable.
- Enable versioning when recovery/audit requirements justify it.
- Configure default encryption and optionally KMS.
- Enable access logging/CloudTrail data events according to compliance requirements.

## VPC and security groups

- Service ingress: only Gateway/internal ALB/service mesh.
- PostgreSQL ingress: only service security group and migration jobs.
- Minimize unrestricted egress; use S3 gateway endpoint and Secrets Manager/CloudWatch endpoints where practical.
- Ensure clients cannot reach the service directly and spoof identity headers.

## Graceful shutdown

Nest shutdown hooks are enabled. The orchestrator should send `SIGTERM`, stop new requests at the load balancer, and allow active uploads to complete before force termination.

## Monitoring

Alert on:

- readiness failures;
- `FILE_UPLOAD_FAILED`, `DATABASE_OPERATION_FAILED`, and compensation failures;
- rising pending/expired upload sessions;
- high rejected/quarantined file counts;
- S3 4xx/5xx latency;
- database pool exhaustion;
- memory usage during server-side uploads.
