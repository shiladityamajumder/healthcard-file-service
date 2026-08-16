# File service API

Base path is normally `/api/v1`. The service expects trusted identity and authorization from the internal gateway. Client-supplied versions of trusted headers must be removed before forwarding.

| Method | Path | Authorization | Use |
|---|---|---|---|
| POST | `/files/upload` | Resource-write | Multipart bounded upload. |
| POST | `/files/upload-multiple` | Resource-write | Multipart batch upload with limits. |
| POST | `/files/presigned-upload` | Resource-write + Idempotency-Key | Reserve a direct storage upload. |
| POST | `/files/presigned-upload/complete` | Session + resource-write | Verify, scan, associate, finalize. |
| GET | `/files/{id}` | Resource-read | Read metadata. |
| GET | `/files/{id}/download-url` | Resource-read | Short-lived private signed URL. |
| PUT | `/files/{id}/replace` | Resource-write | Replace content with compensating cleanup. |
| DELETE | `/files/{id}` | Resource-delete | Soft-delete metadata and object. |
| POST | `/files/bulk-delete` | Resource-delete | Delete bounded authorized IDs. |
| GET | `/health`, `/health/live` | None | Liveness. |
| GET | `/ready`, `/health/ready` | None | Database/storage readiness. |

Success responses contain `success:true`, `data`, and request metadata. Errors contain `success:false`, `data:null`, and `error.code`, `error.message`, and optional details. Typical statuses: 400/422 invalid metadata, 401/403 authorization, 404 missing file, 409 idempotency conflict, 413 size limit, 415 media type, 429 throttling, and 500/503 dependency failure.

Retry reservations/completions with the same idempotency key/session. Do not blindly retry ambiguous multipart uploads. Private signed URLs are bearer capabilities: use short expiry and `no-store`, and never log them. Tables are owned by `heathcare_db`; this service never runs migrations or TypeORM synchronization.
