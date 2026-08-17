# Healthcare File Service Deployment Runbook

## 1. Scope

This runbook covers local startup, container delivery, production rollout, health verification, monitoring, troubleshooting, and rollback for Healthcare File Service.

The supplied Dockerfile and Compose file run only the NestJS API. PostgreSQL, S3 or MinIO, bucket creation, migrations, malware scanners, queues, and workers are external dependencies. Complete [S3 setup](S3_SETUP.md) separately for an AWS production environment.

## 2. Prerequisites

- Node.js 22 and npm 10, or Docker
- PostgreSQL with the compatible `healthcare_db` revision applied
- Two reachable S3 buckets or isolated prefixes in an S3-compatible store
- A real malware-scanning integration for production
- A copied and reviewed [environment template](../.env.example)
- A trusted gateway or private service boundary

The service never provisions dependencies. Readiness verifies PostgreSQL and bucket access but does not create or modify either system.

## 3. Configuration

Create a local environment file:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

At minimum, configure:

- a migrated PostgreSQL `DATABASE_URL`;
- the AWS region, public bucket, private bucket, and prefixes;
- a local S3 endpoint and credentials, or AWS workload identity;
- encryption and public delivery settings;
- upload limits and allowed file policies;
- a non-placeholder internal service secret;
- a production scanner implementation.

The environment template is the authoritative variable catalogue. Do not commit `.env`. Inject production secrets through the platform's secret manager.

Recommended production posture:

- `NODE_ENV=production`
- Swagger and application CORS disabled unless explicitly required
- PostgreSQL TLS and certificate verification enabled
- AWS static credential variables empty
- standard AWS endpoint mode with path-style addressing disabled
- SSE-KMS or approved SSE-S3 explicitly configured
- short presigned upload and download lifetimes
- no-op scanner disabled
- JSON logs at an operationally appropriate level

## 4. Dependency release order

1. Provision and validate S3, KMS, IAM, CloudFront, CORS, lifecycle, and audit controls.
2. Apply backward-compatible database migrations from `healthcare_db`.
3. Verify database runtime grants and the application workload role.
4. Deploy the file-service image with production configuration.
5. Wait for dependency readiness.
6. Run a controlled public and private file workflow.
7. Gradually route trusted gateway traffic.

Never give the runtime role migration credentials or couple database migration execution to application startup.

## 5. Local Node.js run

```bash
npm ci
npm run build
npm run start:dev
```

For a production-mode local process:

```bash
npm ci
npm run build
npm run start:prod
```

Local object storage may be MinIO or another compatible service provisioned outside this Compose file. Set the endpoint to a hostname reachable from the process, enable path-style addressing when required, and use isolated development buckets or prefixes.

## 6. Docker Compose run

```bash
docker compose up --build
```

Background mode and logs:

```bash
docker compose up --build --detach
docker compose ps
docker compose logs --follow api
```

Stop the API:

```bash
docker compose down
```

Compose does not create persistent infrastructure. `localhost` inside the container refers to that container, so use platform DNS, a shared network service name, or the operating system's supported host gateway for PostgreSQL and local S3.

The container runs as an unprivileged user with dropped Linux capabilities, no-new-privileges, an init process, bounded temporary storage, log rotation, and baseline CPU/memory limits. Sharp and in-memory multipart uploads can use substantial memory; tune limits from measured concurrency and file sizes.

## 7. Image build and release

```bash
docker build --tag healthcare-file-service:1.0.0 .
docker run --rm --env-file .env --publish 3000:3000 healthcare-file-service:1.0.0
```

The multi-stage image installs the lockfile dependency graph, compiles TypeScript, prunes development packages, copies only runtime artifacts, and runs as UID/GID `10001`.

Production delivery should:

1. Build once from a reviewed commit using `npm ci`.
2. Run lint, tests, schema-safety verification, dependency scanning, and image scanning.
3. Tag and push an immutable version or digest.
4. Promote the same digest through environments.
5. Inject settings and secrets only at runtime.

## 8. Quality and safety checks

```bash
npm run format:check
npm run lint
npm run build
npm test
npm run test:e2e
```

Verify that schema management has not entered this service:

```bash
./scripts/verify-no-schema-management.sh
```

Run integration tests only with dedicated migrated PostgreSQL data and dedicated test buckets or prefixes. Never run destructive, replacement, deletion, or reconciliation tests against production healthcare files.

## 9. Platform deployment

Configure a stateless HTTP workload:

- container port: `3000`
- liveness: `/health/live`
- readiness: `/health/ready`
- graceful termination: at least 30 seconds and longer than expected active server upload time
- rolling rollout: only ready replicas receive traffic
- ingress: private load balancer, service mesh, or trusted gateway only
- egress: PostgreSQL, S3, scanner, logging, and approved secret services

### AWS ECS

- Run tasks in private subnets without public IP addresses.
- Attach the least-privilege S3/KMS policy to the task role, not the execution role.
- Inject secrets from Secrets Manager or Parameter Store.
- Prefer an S3 gateway VPC endpoint for service-originated S3 traffic.
- Stream stdout JSON logs to the approved logging destination.
- Scale on CPU, memory, request rate, p95 latency, and upload pressure.

### Kubernetes or Amazon EKS

- Use multiple replicas, a PodDisruptionBudget, and rolling updates.
- Use workload identity/IRSA for the service account.
- Configure resource requests and limits from measured Sharp and upload memory use.
- Use a private ingress and network policies.
- Keep secret values out of ConfigMaps and pod specifications.

Direct-to-S3 presigned traffic travels from the client to S3, not through the API workload. Ensure browser network paths and S3 CORS are configured independently of service ingress.

## 10. Database requirements

`healthcare_db` owns all schemas and migrations. TypeORM permanently disables synchronization, automatic migration execution, and schema dropping.

Use distinct migration and runtime roles. The file-service role needs database `CONNECT`, schema `USAGE`, and only the table operations required for file metadata and allowlisted associations. It must not own schemas or receive superuser, `CREATEDB`, `CREATEROLE`, database/schema `CREATE`, `ALTER`, or `DROP` privileges.

Size the pool across replicas:

```text
replica_count × DATABASE_POOL_MAX
```

Keep this plus every other consumer below the database connection budget. Monitor pool waits before increasing limits.

## 11. Gateway requirements

The service is not a public authentication boundary. The gateway must:

- validate the external identity and authorize the target healthcare resource;
- remove client-supplied internal service, identity, role, request, and correlation headers;
- inject canonical trusted headers;
- rate-limit signing and upload endpoints;
- preserve multipart boundaries and binary bodies for server uploads;
- set bounded upstream timeouts;
- keep direct-to-S3 uploads outside the gateway;
- preserve normalized response envelopes and correlation identifiers;
- never log signed URLs or private payloads.

Do not blindly retry an ambiguous server-side upload. Presigned reservations can be safely retried with the same idempotency key, and completion can be retried with the same session identifier.

## 12. Health verification

```bash
curl --fail http://localhost:3000/health/live
curl --fail http://localhost:3000/health/ready
```

Expected behavior:

- Liveness checks only the NestJS process.
- Readiness independently executes PostgreSQL `SELECT 1` and `HeadBucket` against the public and private buckets.
- Readiness returns `503` when any dependency is unavailable.
- The response contains booleans, not connection strings, endpoints, credentials, or AWS error details.

A transient dependency outage should remove a replica from traffic through readiness. Do not use liveness to trigger restart loops for external failures.

## 13. Release smoke test

In an approved non-production environment:

1. Verify liveness and readiness.
2. Confirm the service reports the intended application version through its generated documentation or deployment metadata.
3. Reserve a public image upload using a fresh idempotency key.
4. Upload with the exact URL, HTTP method, and headers returned by the service.
5. Complete the session and confirm its CloudFront URL is reachable.
6. Reserve and complete a private document upload.
7. Request a short-lived private download and confirm it has no permanent public URL.
8. Replace or delete a disposable test object and verify metadata and S3 reconciliation.
9. Confirm scan events, access events, correlation logs, and CloudTrail data events.
10. Remove all test resources according to the test retention policy.

Do not use actual patient or clinical content for deployment smoke tests.

## 14. Monitoring and alerts

Monitor:

- request rate, status, and p50/p95/p99 latency;
- process memory and event-loop pressure;
- multipart sizes and rejected upload counts;
- PostgreSQL pool saturation and transaction failures;
- S3 request latency, throttling, and 4xx/5xx responses;
- presign and `HeadObject` completion failures;
- pending and expired upload sessions;
- malware scan status and quarantine backlog;
- compensation and partial-delete failures;
- private signed-URL issuance and anomalous access;
- CloudFront errors and origin access failures;
- reconciliation drift between PostgreSQL and S3.

Logs must exclude credentials, connection URLs, signed URLs, cookies, authorization data, raw filenames that may contain health information, object contents, and medical request bodies.

## 15. Troubleshooting

### Readiness reports an S3 bucket failure

1. Confirm the region and bucket names.
2. Confirm the workload identity is attached to the running task or pod.
3. Grant `s3:ListBucket` on both bucket ARNs for `HeadBucket` readiness.
4. Check bucket policy, permissions boundaries, SCPs, KMS policy, and VPC endpoint policy.
5. Confirm the production endpoint is blank and path-style mode is disabled.

### Presigned upload returns `SignatureDoesNotMatch`

- Use the exact HTTP method and every header returned by the reservation response.
- Do not alter content type, cache control, encryption, KMS key, or SHA-256 metadata headers.
- Confirm client and service clocks are synchronized.
- Ensure proxies do not rewrite the query string or signed headers.
- Confirm S3 CORS allows the browser origin, `PUT`, and all signed headers.

### Upload succeeds but completion fails

Check reservation expiry, expected size, content type, `x-amz-meta-sha256`, object key, scanner result, and database state. Do not manually associate an unverified object. Let cleanup/reconciliation handle rejected or expired objects.

### Public URL returns `403`

Confirm the configured base URL is the intended CloudFront distribution, OAC is attached with always-sign behavior, and the public bucket policy grants that distribution `GetObject` on the deployed environment/prefix. Keep direct S3 public access blocked.

### KMS access is denied

Confirm the key is enabled and in the bucket's region, the full key ARN matches service configuration and bucket encryption, and both the IAM policy and KMS key policy permit the workload. CloudFront also needs key-policy access when it serves SSE-KMS public objects.

### Memory pressure during uploads

Reduce server-side file limits/concurrency or increase measured memory capacity. Prefer direct presigned uploads so object bytes bypass the gateway and Node.js process.

## 16. Rollback

For a backward-compatible database and storage configuration:

1. Stop or pause the rollout.
2. Route traffic to the last known-good immutable image.
3. Verify liveness, readiness, signing, and controlled file reads.
4. Monitor failed sessions, compensation, database errors, and S3 access.
5. Reconcile any operations that crossed S3 and PostgreSQL during the incident.

Do not delete buckets, KMS keys, object versions, or database metadata as an application rollback. Storage and schema recovery require separately reviewed procedures. Schedule KMS deletion only after retention, backup, replication, and legal requirements are satisfied; disabling or deleting a key can make retained objects unreadable.
