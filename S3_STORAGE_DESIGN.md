# S3 Storage Design

## Key format

```text
{environment}/{visibilityPrefix}/{resourceType}/{resourceId}/{year}/{month}/{objectName}
```

Example:

```text
production/private/prescription_document/70f95c8e-cbc5-4700-af76-dcb8178bba92/2026/08/3c6e....pdf
```

The key never includes patient names, phone numbers, emails, diagnosis text, prescription contents, or other healthcare data. `resourceId` is a UUID. Private object names use only a random UUID and validated extension; the sanitized original filename remains metadata. Public object names may retain a sanitized filename after a UUID because catalog/profile filenames are not treated as clinical identifiers.

## Variants

```text
{sourceDirectory}/variants/{variantName}/{sourceUuidAndStem}-{variantName}.webp
```

Only public images are processed by default. The current implementation creates a configurable WebP thumbnail. Source images remain unchanged. Private clinical content is never transformed.

## Bucket strategies

### Separate buckets

Recommended for production:

- `AWS_S3_PUBLIC_BUCKET`
- `AWS_S3_PRIVATE_BUCKET`

This gives simpler policies, lifecycle rules, replication rules, and CloudFront origin controls.

### One bucket with prefixes

Set both bucket variables to the same bucket and use distinct prefixes. Bucket policy must still prohibit anonymous access to the private prefix.

## Public delivery

Priority:

1. `AWS_CLOUDFRONT_PUBLIC_BASE_URL`
2. `AWS_S3_PUBLIC_BASE_URL`
3. Constructed AWS S3 regional URL
4. Path-style endpoint URL for local S3 compatibility

Use CloudFront Origin Access Control and a bucket policy that permits CloudFront reads. Do not expose write operations through CloudFront.

## Private delivery

Private object keys persist in the database. The service signs `GetObject` requests only after validating file status. Download URL expiry is configured through `PRESIGNED_DOWNLOAD_EXPIRY_SECONDS`.

## Presigned uploads

The reservation signs the final key, exact content type, expected content length, SHA-256 metadata, cache behavior, and encryption headers. Completion compares `HeadObject` to the reservation. Clients cannot choose a key or bucket.

## Lifecycle and cleanup

Recommended lifecycle rules:

- Abort incomplete multipart uploads after one day if multipart support is added.
- Expire uncompleted temporary/reserved objects after a bounded window.
- Retain deleted private files only if legal/clinical retention requires it; otherwise remove promptly.
- Transition long-term records according to `retention_until` and legal policy.

A reconciliation worker should identify:

- deleted/rejected rows with objects still present;
- pending upload sessions past expiry;
- objects without a matching `file_objects` row;
- active metadata whose object is missing.
