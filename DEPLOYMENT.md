# Deployment

## Local

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL and MinIO.
3. Apply all `healthcare_db` Alembic migrations.
4. Run `npm install`, `npm run build`, and `npm run start:prod`.

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

- Migrations are applied only by `healthcare_db` as a separate release step.
- Use PgBouncer when connection fan-out warrants it.
- Set `DATABASE_POOL_MAX` per replica so total connections remain below database capacity.
- Use TLS in production.
- Confirm search paths/permissions include all mapped schemas; entities use fully qualified schema names.

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
