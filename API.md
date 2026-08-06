# API

Base URL: `/api/v1/files`

All examples assume trusted internal headers. Public clients should call the future API Gateway, not this service directly.

## Single upload

```bash
curl -X POST http://localhost:3000/api/v1/files/upload \
  -H 'X-Internal-Service-Key: change-me-for-non-local-environments' \
  -H 'X-User-ID: 9cf8539c-a940-4fc4-8121-cb71d005f699' \
  -F 'file=@prescription.pdf;type=application/pdf' \
  -F 'resourceType=prescription_document' \
  -F 'resourceId=70f95c8e-cbc5-4700-af76-dcb8178bba92' \
  -F 'fileCategory=prescription' \
  -F 'visibility=private' \
  -F 'metadata={}'
```

## Multiple upload

```bash
curl -X POST http://localhost:3000/api/v1/files/upload-multiple \
  -H 'X-Internal-Service-Key: change-me-for-non-local-environments' \
  -F 'files=@front.jpg;type=image/jpeg' \
  -F 'files=@side.jpg;type=image/jpeg' \
  -F 'resourceType=product_media' \
  -F 'resourceId=0f16ce0c-f2d7-46e8-b8e7-d904e028071d' \
  -F 'fileCategory=product_image' \
  -F 'visibility=public' \
  -F 'metadata={"mediaType":"image","displayOrder":0,"isPrimary":false}'
```

## Presigned upload reservation

SHA-256 is mandatory because `platform.file_objects` requires a final SHA-256 before status can become `available`.

```bash
curl -X POST http://localhost:3000/api/v1/files/presigned-upload \
  -H 'content-type: application/json' \
  -H 'Idempotency-Key: prescription-70f95c8e-v1' \
  -H 'X-Internal-Service-Key: change-me-for-non-local-environments' \
  -d '{
    "resourceType":"prescription_document",
    "resourceId":"70f95c8e-cbc5-4700-af76-dcb8178bba92",
    "fileCategory":"prescription",
    "visibility":"private",
    "replaceExisting":false,
    "metadata":{},
    "filename":"prescription.pdf",
    "contentType":"application/pdf",
    "sizeBytes":524288,
    "sha256":"8f14e45fceea167a5a36dedd4bea2543fcd2f8c7c453c7f5cf4193f90e84d73d"
  }'
```

Use the returned URL exactly once with the returned required headers. Do not modify the key.
Reusing the same idempotency key with different normalized request parameters returns `IDEMPOTENCY_KEY_CONFLICT`. An expired reservation is rejected and its object is scheduled for immediate best-effort cleanup.

```bash
curl -X PUT "$UPLOAD_URL" \
  -H 'content-type: application/pdf' \
  -H 'x-amz-meta-sha256: 8f14e45fceea167a5a36dedd4bea2543fcd2f8c7c453c7f5cf4193f90e84d73d' \
  --data-binary @prescription.pdf
```

Complete:

```bash
curl -X POST http://localhost:3000/api/v1/files/presigned-upload/complete \
  -H 'content-type: application/json' \
  -H 'X-Internal-Service-Key: change-me-for-non-local-environments' \
  -d '{"uploadSessionId":"5f95cf7b-c6e9-40b5-a36e-5b91f874d99d"}'
```

## Metadata

```bash
curl -H 'X-Internal-Service-Key: change-me-for-non-local-environments' \
  http://localhost:3000/api/v1/files/8226d071-061c-4c61-ae74-603606cd654f
```

Private metadata includes an internal object key but no permanent public URL. Public metadata includes the stable public URL and generated variant URLs.

## Private download URL

```bash
curl -H 'X-Internal-Service-Key: change-me-for-non-local-environments' \
  http://localhost:3000/api/v1/files/8226d071-061c-4c61-ae74-603606cd654f/download-url
```

The URL is short-lived and response caching is disabled.

## Replace

```bash
curl -X PUT http://localhost:3000/api/v1/files/8226d071-061c-4c61-ae74-603606cd654f/replace \
  -H 'X-Internal-Service-Key: change-me-for-non-local-environments' \
  -F 'file=@replacement.pdf;type=application/pdf'
```

The resource association, category, visibility, and association metadata are inherited from the existing file record.
Generated image variants cannot be replaced independently; replace the source file so variants can be regenerated consistently.

## Delete

```bash
curl -X DELETE \
  -H 'X-Internal-Service-Key: change-me-for-non-local-environments' \
  http://localhost:3000/api/v1/files/8226d071-061c-4c61-ae74-603606cd654f
```

Deleting a generated variant by its returned file ID soft-deletes only the variant object and variant link. It does not clear the source file's domain association.

## Bulk delete

```bash
curl -X POST http://localhost:3000/api/v1/files/bulk-delete \
  -H 'content-type: application/json' \
  -H 'X-Internal-Service-Key: change-me-for-non-local-environments' \
  -d '{"fileIds":["8226d071-061c-4c61-ae74-603606cd654f"]}'
```

Bulk deletion returns success/error details for each file rather than rolling back completed files.

## Resource-specific metadata

| Resource type | Metadata |
|---|---|
| `product_media` | optional `variantId`, `altText`, `displayOrder`, `isPrimary` |
| `insurance_claim_document` | required `documentType` |
| `support_ticket_attachment` | optional `ticketMessageId` |
| `notification_attachment` | optional `disposition`, `filename`, `contentId`, `displayOrder` |
| direct field mappings | no additional metadata required |
