# Error Codes

| Code | HTTP | Meaning |
|---|---:|---|
| `REQUEST_VALIDATION_ERROR` | 422 | DTO or field validation failed |
| `INVALID_REQUEST_ID` | 400 | Request ID header is not a UUID |
| `INVALID_CORRELATION_ID` | 400 | Correlation ID header is not a UUID |
| `INVALID_USER_ID` | 400 | Trusted user ID header is not a UUID |
| `INVALID_ACTOR_ID` | 400 | Trusted actor ID header is not a UUID |
| `INVALID_ROLES_HEADER` | 400 | Trusted roles header is malformed or too large |
| `INTERNAL_SERVICE_AUTH_FAILED` | 401 | Shared internal secret missing/invalid |
| `FILE_REQUIRED` / `FILES_REQUIRED` | 422 | Multipart file missing |
| `EMPTY_FILE` | 422 | Zero-byte file |
| `FILE_TOO_LARGE` | 413 | Category size exceeded |
| `TOTAL_UPLOAD_TOO_LARGE` | 413 | Multi-upload total exceeded |
| `TOO_MANY_FILES` | 413 | File count exceeded |
| `MULTIPART_REQUEST_INVALID` | 413 | Multipart parser rejected the request |
| `MULTIPLE_FILES_NOT_ALLOWED` | 409 | Resource uses a single direct file reference |
| `UNSUPPORTED_FILE_TYPE` | 415 | MIME not allowed |
| `UNSUPPORTED_FILE_EXTENSION` | 415 | Extension not allowed |
| `MIME_EXTENSION_MISMATCH` | 415 | Declared/detected type mismatch |
| `FILE_CONTENT_UNRECOGNIZED` | 415 | Content could not be safely identified |
| `INVALID_RESOURCE_TYPE` | 422 | Resource type not in allowlist |
| `INVALID_FILE_CATEGORY` | 422 | Category unsupported |
| `FILE_CATEGORY_MISMATCH` | 422 | Category does not match resource type |
| `VISIBILITY_NOT_ALLOWED` | 422 | Public/private policy violation |
| `INVALID_RESOURCE_METADATA` | 422 | Controlled association metadata invalid |
| `RESOURCE_NOT_FOUND` | 404 | Associated domain record absent |
| `FILE_ASSOCIATION_EXISTS` | 409 | Direct resource already has a file reference |
| `FILE_NOT_FOUND` | 404 | File metadata absent or soft-deleted |
| `FILE_NOT_AVAILABLE` | 409 | File not clean/available |
| `MALWARE_DETECTED` | 422 | Scanner rejected file |
| `FILE_UPLOAD_FAILED` | 503 | S3 upload failed |
| `DATABASE_OPERATION_FAILED` | 409/500 | Integrity conflict or database operation failure |
| `DATABASE_UNAVAILABLE` | 503 | PostgreSQL connection dependency unavailable |
| `DATABASE_SCHEMA_UNAVAILABLE` | 503 | Required `healthcare_db` schema is not applied |
| `UPLOAD_COMPENSATION_FAILED` | logged | S3 rollback failed after DB error |
| `IDEMPOTENCY_KEY_REQUIRED` | 422 | Presigned reservation lacks key |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | Key was reused with different upload metadata |
| `UPLOAD_SESSION_NOT_FOUND` | 404 | Reservation absent |
| `UPLOAD_SESSION_CORRUPT` | 409 | Session/file relationship invalid |
| `PRESIGNED_URL_EXPIRED` | 410 | Reservation expired |
| `EXPIRED_UPLOAD_CLEANUP_FAILED` | logged | Expired-object cleanup must be reconciled |
| `UPLOAD_COMPLETION_MISMATCH` | 409 | HeadObject differs from reservation |
| `UPLOAD_SESSION_NOT_COMPLETABLE` | 409 | Session state disallows completion |
| `UPLOAD_SESSION_NOT_REUSABLE` | 409 | Failed/aborted idempotent reservation cannot be replayed |
| `PRESIGNED_UPLOAD_CREATION_FAILED` | 503 | URL signing failed |
| `PRESIGNED_DOWNLOAD_CREATION_FAILED` | 503 | Download signing failed |
| `S3_OBJECT_NOT_FOUND` | 404 | Reserved object absent |
| `S3_HEAD_OBJECT_FAILED` | 503 | Storage verification failed |
| `PRIVATE_FILE_REQUIRED` | 409 | Download URL requested for public file |
| `FILE_ALREADY_REPLACED` | 409 | Association changed concurrently |
| `FILE_VARIANT_REPLACE_NOT_ALLOWED` | 409 | Generated variant cannot be replaced independently |
| `REPLACE_REQUIRES_FILE_ENDPOINT` | 409 | Ambiguous link replacement request |
| `FILE_DELETE_FAILED` | 503 | S3 delete failed |
| `FILE_DELETE_PARTIAL_FAILURE` | 503 | DB cleared but S3 cleanup needs retry |
| `BULK_FILE_DELETE_FAILED` | 503 | S3 multi-delete failed |
| `SERVICE_NOT_READY` | 503 | Database or S3 readiness failed |
| `SERVICE_UNAVAILABLE` | 503 | Generic dependency failure |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected internal failure |

Startup configuration can also fail fast with `INVALID_UPLOAD_POLICY_CONFIGURATION` when a category override is unknown, malformed, broader than the global MIME allowlist, or larger than the global multipart limit. This is intentionally a startup failure rather than an HTTP response.
