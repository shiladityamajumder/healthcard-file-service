# API Gateway Integration

## Network placement

Deploy the file service on a private subnet and expose it only through a private load balancer or service mesh address, for example:

```text
http://healthcare-file-service.internal:3000/api/v1
```

Security groups, Kubernetes network policies, or equivalent controls must prevent direct Internet access. The gateway must remove client-supplied internal identity headers and inject trusted values after authentication and authorization.

## Responsibilities

The API Gateway is responsible for JWT validation, session/token policy, user and tenant authorization, rate limiting, public routing, and rejecting untrusted callers. The file service validates resource/type/visibility rules and existing records but does not implement a second JWT stack.

Before forwarding, the gateway must authorize the actor against the requested healthcare resource. A valid user identity alone is not proof that the actor may access a prescription, report, patient document, or other private object.

## Trusted headers

Names are configurable; defaults are:

| Header | Purpose | Format |
|---|---|---|
| `X-Internal-Service-Key` | Optional shared gateway-to-service secret | Opaque secret |
| `X-Request-ID` | Request identifier propagated across services | UUID; service generates one when missing and rejects invalid values |
| `X-Correlation-ID` | End-to-end trace/correlation identifier | UUID; defaults to the request ID when missing |
| `X-User-ID` | Authenticated user | UUID |
| `X-Actor-ID` | Acting user/service identity | UUID |
| `X-Roles` | Authorized roles/scopes | Comma-separated bounded values |
| `Idempotency-Key` | Required for presigned reservation retries | Up to 128 characters |

The gateway should strip all of these headers from the external request and inject canonical values. The shared secret is defense in depth, not a substitute for network isolation. For higher assurance, replace it with workload identity, mTLS, or a signed service-to-service request scheme.

## Routes

Forward versioned file routes to `/api/v1/files/*`. Keep `/health` for liveness probes and `/ready` for dependency readiness. Swagger should normally be disabled in production or restricted to an internal engineering network.

## Body size and multipart forwarding

The gateway and load balancer body limits must be at least the configured service limits. Multipart forwarding must preserve:

- the original multipart boundary;
- binary bodies without base64 conversion;
- `Content-Type` and `Content-Length` where available;
- repeated `files` fields for multi-upload;
- the trusted request and identity headers.

For large files, prefer `POST /files/presigned-upload`, direct client upload to S3, and `POST /files/presigned-upload/complete`. This avoids gateway and application buffering limits and reduces timeout pressure.

## Recommended timeout behavior

- Metadata, signing, completion, metadata lookup, and delete routes: use a bounded upstream timeout appropriate to the platform, typically shorter than direct file uploads.
- Server-side multipart upload: allow enough time for validation, scanning, S3 upload, and database finalization, but do not use an unbounded timeout.
- Direct-to-S3 upload itself must not traverse the gateway.
- The gateway should return the service's normalized error envelope and machine-readable error code without replacing it with an incompatible format.

## Retry behavior

Safe automatic retries:

- `GET` metadata and download URL requests, subject to authorization re-evaluation;
- presigned reservation with the same `Idempotency-Key`;
- presigned completion with the same upload session ID;
- delete after a transport failure, because deletion is state-aware.

Do not blindly retry a server-side multipart upload after an ambiguous upstream timeout because a completed upload may already exist. Query the operation result or use presigned upload/idempotent workflows. Do not retry non-retryable 4xx errors. Apply bounded exponential backoff with jitter for retryable dependency failures.

## Public assets

The gateway may return the stable `publicUrl` supplied by the service. Normal product/profile APIs may resolve their stored file UUID and public URL according to their domain contract. Public read traffic should use CloudFront or the configured public S3 base URL; public writes always go through an authorized service workflow or a constrained presigned request.

## Private assets

Never cache private signed URLs in a shared cache. The gateway must authorize every download URL request and should preserve `Cache-Control: no-store`. Signed URLs are short-lived bearer capabilities and must not be logged, placed in analytics parameters, or returned in permanent domain records.

## Error and trace propagation

Preserve the response envelope:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The associated resource was not found.",
    "details": null
  },
  "meta": {
    "requestId": "...",
    "correlationId": "...",
    "apiVersion": "v1",
    "timestamp": "..."
  }
}
```

Forward `requestId` and `correlationId` into gateway/access logs while continuing to redact signed URLs, credentials, tokens, filenames that may contain health information, and request bodies containing medical data.
