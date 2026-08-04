# Architecture

## Scope

The service owns file workflow logic and S3 access. It does not own database schema evolution, JWT authentication, API Gateway behavior, domain authorization policy, or malware infrastructure.

## Modules

```text
src/
├── common/                 response, errors, request context, validation utilities
├── config/                 typed configuration and startup validation
├── database/               exact TypeORM mappings for platform file tables
└── modules/
    ├── files/              controllers, DTOs, orchestration, resource mapping
    ├── storage/            S3 abstraction and AWS SDK v3 implementation
    ├── image-processing/   Sharp thumbnail abstraction
    ├── file-scanning/      scanner interface and no-op development adapter
    └── health/             liveness and dependency readiness
```

## Dependency direction

Controllers depend on `FilesService`. `FilesService` depends on abstract storage/scanner contracts, validation, object-key generation, resource mapping, and TypeORM. AWS commands remain inside `S3StorageService`. Controllers contain no database or S3 business logic.

## Database boundary

The service receives a validated PostgreSQL connection URL through `DATABASE_URL` and passes it directly to TypeORM. The target database must already exist, with all required schemas and tables applied by `healthcare_db`. TypeORM entity metadata maps those existing objects but is never used to create or modify them: `synchronize`, `migrationsRun`, and `dropSchema` are all permanently disabled.

The application contains no migration runner or database/schema/table creation path. Startup stops cleanly after bounded retries when PostgreSQL is unavailable. Readiness uses only `SELECT 1`, normalizes failures to dependency booleans, and checks S3 independently.

## Request flow

1. Pino creates the HTTP request log.
2. `RequestContextMiddleware` validates or creates request/correlation IDs and parses trusted identity headers.
3. `InternalServiceGuard` verifies the shared internal secret when configured.
4. Global `ValidationPipe` transforms DTOs, removes nothing silently, and rejects unknown properties.
5. The controller delegates to a focused service method.
6. The response interceptor emits the auth-service-compatible envelope.
7. The global exception filter emits stable error codes and field-level validation details.

## Server-side upload flow

1. Validate resource type/category/visibility against the static map.
2. Check the domain record exists.
3. Validate size, declared MIME, extension, detected content type, and filename.
4. Compute SHA-256.
5. Run the configured scanner.
6. Generate a server-controlled non-guessable object key.
7. Upload source and optional public image variants.
8. In one PostgreSQL transaction, insert `platform.file_objects`, write scan events and variants, and update/insert the domain association.
9. If the transaction fails, delete uploaded objects as compensation.
10. For replacement, commit the new reference first, then best-effort delete the old object.

## Presigned upload flow

1. Validate metadata and require an idempotency key.
2. Hash normalized reservation parameters so a key cannot be reused for a different upload request.
3. Create a pending `file_objects` row and `file_upload_sessions` row. Concurrent reservation races resolve through the existing `(scope, idempotency_key)` unique constraint.
4. Sign a final server-generated S3 key. SHA-256 is required as `x-amz-meta-sha256`.
5. Client uploads directly to S3.
6. Completion loads only the reserved key and runs `HeadObject`.
7. Verify size, content type, metadata checksum, session status, and expiry.
8. Run the scanner adapter.
9. In one transaction, associate the resource and mark file/session complete.
10. A repeated completion returns the completed file without creating another association. Expired sessions are rejected and best-effort storage cleanup runs before a new reservation is required.

## Private download flow

The service verifies that the object is private, available, clean, and not soft-deleted. It creates a short-lived `GetObject` URL, writes `platform.file_access_events`, and returns the URL without logging it.

## Consistency model

S3 and PostgreSQL cannot share a transaction. The implemented decisions are:

- Upload: S3 first, database second; database failure triggers S3 deletion.
- Presigned completion: object exists first, database finalization second; failure attempts object deletion and marks the reservation failed/rejected.
- Replacement: upload new, transactionally swap reference and mark old metadata deleted, then delete old S3 object. Cleanup failure is logged and does not roll back a successful reference change.
- Delete: transactionally clear association and mark metadata deleted, then delete S3. Failure returns `FILE_DELETE_PARTIAL_FAILURE`; retrying the same delete remains safe.

A production cleanup worker should periodically reconcile deleted/rejected rows with S3.

## Scalability

The application is stateless aside from PostgreSQL and S3. Multiple instances can run behind an internal load balancer. PostgreSQL optimistic `row_version` columns remain mapped. Presigned upload sessions provide persistent retry semantics. Large uploads should prefer direct-to-S3 to avoid application memory pressure.
