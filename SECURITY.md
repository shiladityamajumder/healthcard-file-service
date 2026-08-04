# Security

## Network trust boundary

This service is not designed for direct internet access. Deploy it in private subnets behind an internal load balancer or service mesh. Security groups and network policies must reject public ingress. The API Gateway must remove client-supplied identity headers before injecting trusted values.

`INTERNAL_SERVICE_SECRET` provides a lightweight shared-secret check. It is defense in depth, not a replacement for private networking, mTLS, or a signed service-to-service identity mechanism.

## Identity and authorization

JWT validation remains the responsibility of `auth_service` and the future API Gateway. The file service consumes trusted context headers. Resource ownership and fine-grained authorization must be decided by the Gateway/domain authorization layer. The service still enforces resource existence, controlled resource mappings, category/visibility policy, and optional internal secret validation.

## Upload controls

- DTO whitelist and rejection of unknown fields.
- Multipart file count and total request limits.
- Category-specific size/MIME/extension policies.
- Content sniffing with `file-type` for supported binary types.
- Safe Unicode normalization and filename sanitization.
- UUID-based non-guessable object keys.
- No client paths, bucket names, prefixes, or object keys.
- No executable/script types by default.
- No transformation of PDFs or clinical documents.

Content sniffing does not prove a file is safe. Replace the no-op scanner before production.

## S3 controls

- No credentials in source code.
- Default credential provider chain when static credentials are omitted.
- Configurable SSE-S3 or SSE-KMS.
- Separate public/private buckets or prefixes.
- Private responses have no permanent public URL.
- Public write access is never granted.
- ACLs are not used.
- Private signed URLs use short expiry and no-store cache behavior.
- Signed URLs are redacted from logs.

## Logging restrictions

Pino redacts authorization/cookie/internal-secret headers and common signed URL fields. `DATABASE_URL` is never logged, and validation/readiness errors never contain its hostname, username, password, or other connection details. Application logging avoids file content, AWS credentials, tokens, medical data, and sensitive filenames. File IDs, safe object keys, resource types, and error codes may be logged for operations.

## PostgreSQL least privilege

Inject `DATABASE_URL` from a secret manager and keep real credentials out of source control. The database must already exist and must be migrated by `healthcare_db`; TypeORM synchronization, automatic migrations, and schema dropping are permanently disabled in this service.

Use a dedicated runtime role that does not own the database or schemas. Grant only database `CONNECT`, schema `USAGE`, and the specific table-level `SELECT`/`INSERT`/`UPDATE`/`DELETE` operations required by `DATABASE_MAPPING.md` (plus sequence access only where actually necessary). Never grant the runtime role superuser, `CREATEDB`, `CREATEROLE`, database/schema `CREATE`, object ownership, or `ALTER`/`DROP` privileges. Keep the migration role separate and unavailable to the running service.

Enable TLS for managed/production databases and leave certificate verification enabled. `DATABASE_SSL_REJECT_UNAUTHORIZED=false` is intended only for explicitly accepted, controlled exceptions.

The included scanner is a development adapter only. Startup validation blocks it when `NODE_ENV=production` unless `ALLOW_NOOP_SCANNER_IN_PRODUCTION=true` is deliberately set. That override is an explicit risk acknowledgement, not a production recommendation; replace the provider with ClamAV, GuardDuty Malware Protection for S3, or an asynchronous scanning worker.

## Malware integration

Recommended production patterns:

1. Synchronous ClamAV service for small uploads.
2. S3 event to queue, isolated scanner worker, and status transition from `uploaded/scanning` to `available`.
3. GuardDuty Malware Protection for S3 with event-driven finalization/quarantine.

For asynchronous scanning, do not expose the object until `malware_scan_status='clean'` and `status='available'`.

## IAM example

Replace account, bucket, and prefix values.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicObjectAccess",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::healthcare-public/production/public/*"
    },
    {
      "Sid": "PrivateObjectAccess",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::healthcare-private/production/private/*"
    },
    {
      "Sid": "ReadinessBucketChecks",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": ["arn:aws:s3:::healthcare-public", "arn:aws:s3:::healthcare-private"],
      "Condition": {
        "StringLike": {
          "s3:prefix": ["production/public/*", "production/private/*"]
        }
      }
    }
  ]
}
```

`HeadObject` is authorized by `s3:GetObject`; there is no separate IAM action named `s3:HeadObject`. Remove `s3:ListBucket` only if the readiness implementation is replaced with a check that does not call `HeadBucket`.
