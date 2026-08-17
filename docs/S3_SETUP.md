# Production Amazon S3 Setup for Healthcare File Service

## 1. Purpose and operating model

This guide defines a production-grade Amazon S3 configuration for Healthcare File Service. It covers the settings the current implementation actually uses and the surrounding controls expected for sensitive healthcare workloads.

The target design uses:

- separate private and public-asset S3 buckets;
- S3 Block Public Access enabled on both buckets;
- Bucket owner enforced Object Ownership with ACLs disabled;
- a customer-managed symmetric KMS key when policy requires customer-controlled encryption;
- CloudFront Origin Access Control for public asset delivery;
- workload identity for the NestJS service;
- explicit CORS for approved browser origins using direct presigned PUT;
- versioning, reviewed lifecycle rules, object-level audit events, and continuous posture monitoring;
- a real malware-scanning and quarantine decision before an object becomes available.

The public bucket is not anonymously public. “Public” is the application visibility classification; CloudFront reads its origin through a narrow service policy. Private files are available only through short-lived presigned downloads issued after authorization.

> Compliance note: configuration alone does not make a system compliant. Confirm data classification, retention, residency, AWS account controls, and contractual requirements—including an AWS Business Associate Addendum when handling protected health information—with the organization’s security, privacy, and legal owners.

## 2. Current service behavior

The implementation:

- uses AWS SDK for JavaScript v3 and the default credential chain when static credentials are absent;
- performs `PutObject`, `GetObject`, `HeadObject`, `DeleteObject`, `DeleteObjects`, `CopyObject`, and `HeadBucket` operations;
- creates presigned `PUT` and private `GET` URLs;
- signs content type, cache control, `x-amz-meta-sha256`, and configured encryption headers;
- checks both buckets with `HeadBucket` during readiness;
- generates keys below `{environment}/{visibilityPrefix}/...`;
- omits object ACLs;
- records returned S3 version IDs, but deletion currently does not specify a version ID;
- supports one `AWS_S3_KMS_KEY_ID` for both buckets.

With the current application, use one customer-managed KMS key for both buckets or use SSE-S3 for both. Separate bucket-specific KMS keys require an application configuration change.

## 3. Decisions to approve

| Decision | Recommended baseline |
|---|---|
| AWS account | Dedicated production workload account under AWS Organizations |
| Region | Approved region matching residency and latency requirements |
| Bucket strategy | Separate public-asset and private buckets |
| Object ownership | Bucket owner enforced; ACLs disabled |
| Public access | All four S3 Block Public Access controls enabled |
| Encryption | SSE-KMS with one customer-managed symmetric key, or approved SSE-S3 |
| Public delivery | CloudFront OAC with always-signed origin requests |
| Private delivery | Short-lived S3 presigned GET after authorization |
| Upload delivery | Presigned PUT for large files; bounded server upload for small files |
| Versioning | Enabled on both buckets |
| Retention | Approved per category; no blanket private-object expiration |
| Malware | Real scanner with clean/quarantine decision integrated into file status |
| Audit | Organization CloudTrail plus S3 object data events for both buckets |
| Infrastructure | Reviewed Terraform, CloudFormation, or equivalent IaC |

Do not place patient names, email addresses, phone numbers, diagnoses, claim numbers, prescription text, or other health data in bucket names, KMS aliases, AWS tags, object tags, CloudFront names, or object keys.

## 4. Example values

Choose globally unique bucket names. These are placeholders:

```text
AWS account:       111122223333
Region:            ap-south-1
Environment:       production
Public bucket:     acme-health-prod-file-public-111122223333
Private bucket:    acme-health-prod-file-private-111122223333
Public prefix:     public
Private prefix:    private
Runtime role:      healthcare-file-service-prod
KMS alias:         alias/healthcare-file-service-prod
CloudFront domain: files.example-health.com
```

The role’s object resources begin with:

```text
arn:aws:s3:::acme-health-prod-file-public-111122223333/production/public/*
arn:aws:s3:::acme-health-prod-file-private-111122223333/production/private/*
```

The environment segment precedes the configured visibility prefix because `ObjectKeyService` builds keys in that order.

## 5. Provision with infrastructure as code

Use version-controlled IaC for repeatability, review, drift detection, and recovery. The CLI examples explain required settings and help verification; they are not a replacement for a reviewed stack.

```bash
AWS_REGION=ap-south-1
PUBLIC_BUCKET=acme-health-prod-file-public-111122223333
PRIVATE_BUCKET=acme-health-prod-file-private-111122223333

aws s3api create-bucket \
  --bucket "$PUBLIC_BUCKET" \
  --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"

aws s3api create-bucket \
  --bucket "$PRIVATE_BUCKET" \
  --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"
```

For `us-east-1`, omit `--create-bucket-configuration`. Never reuse development or staging buckets for production.

## 6. Disable ACLs and block public access

```bash
aws s3api put-bucket-ownership-controls \
  --bucket "$PUBLIC_BUCKET" \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'

aws s3api put-bucket-ownership-controls \
  --bucket "$PRIVATE_BUCKET" \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'

for BUCKET in "$PUBLIC_BUCKET" "$PRIVATE_BUCKET"; do
  aws s3api put-public-access-block \
    --bucket "$BUCKET" \
    --public-access-block-configuration \
      BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
done
```

Also enable account- or organization-level S3 Block Public Access unless an approved exception prevents it. S3 uses the most restrictive combination of organization, account, bucket, and access-point settings.

Do not enable S3 website hosting, anonymous reads, anonymous writes, public ACLs, or broad public allow statements. CloudFront OAC works while Block Public Access remains enabled.

## 7. Configure encryption

S3 automatically supplies SSE-S3 baseline encryption for new objects. Healthcare environments often choose a customer-managed KMS key for explicit key policy, audit, rotation, and separation of duties.

### 7.1 KMS key

Use a symmetric customer-managed key in the same region as both buckets. Give it a non-sensitive alias and enable rotation when required by policy. Separate key administration from usage; the application role must not administer, disable, schedule deletion, or change policy.

An application key-use statement can be bounded like this:

```json
{
  "Sid": "AllowHealthcareFileServiceUse",
  "Effect": "Allow",
  "Principal": {
    "AWS": "arn:aws:iam::111122223333:role/healthcare-file-service-prod"
  },
  "Action": [
    "kms:Decrypt",
    "kms:Encrypt",
    "kms:GenerateDataKey*",
    "kms:DescribeKey"
  ],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "kms:CallerAccount": "111122223333",
      "kms:ViaService": "s3.ap-south-1.amazonaws.com"
    }
  }
}
```

This is one statement inside a complete KMS key policy. Preserve approved account-enablement and key-administration statements. Review replication, scanner, cross-account, and CloudFront principals separately.

### 7.2 Bucket default encryption

Create `bucket-encryption.json` with the full key ARN:

```json
{
  "Rules": [
    {
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "arn:aws:kms:ap-south-1:111122223333:key/00000000-0000-0000-0000-000000000000"
      },
      "BucketKeyEnabled": true
    }
  ]
}
```

```bash
aws s3api put-bucket-encryption \
  --bucket "$PUBLIC_BUCKET" \
  --server-side-encryption-configuration file://bucket-encryption.json

aws s3api put-bucket-encryption \
  --bucket "$PRIVATE_BUCKET" \
  --server-side-encryption-configuration file://bucket-encryption.json
```

S3 Bucket Keys can substantially reduce KMS request volume and cost. Confirm their encryption-context implications with the security team.

Configure matching application headers:

```env
AWS_S3_SERVER_SIDE_ENCRYPTION=aws:kms
AWS_S3_KMS_KEY_ID=arn:aws:kms:ap-south-1:111122223333:key/00000000-0000-0000-0000-000000000000
```

Use the full key ARN. If the approved policy uses SSE-S3:

```env
AWS_S3_SERVER_SIDE_ENCRYPTION=AES256
AWS_S3_KMS_KEY_ID=
```

Do not leave encryption headers empty when bucket policy requires a specific algorithm or key.

## 8. Enable versioning

```bash
aws s3api put-bucket-versioning \
  --bucket "$PUBLIC_BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-versioning \
  --bucket "$PRIVATE_BUCKET" \
  --versioning-configuration Status=Enabled
```

Versioning aids recovery but is not a full backup or retention policy. The current service deletes without a version ID, so S3 creates a delete marker and retains older versions. Lifecycle, reconciliation, cost, and legal retention must account for noncurrent versions. Restrict and monitor `s3:PutBucketVersioning`.

## 9. Runtime role policy

Use ECS task roles, EKS workload identity/IRSA, EC2 instance profiles, or an equivalent. Do not create an IAM user or store long-lived AWS keys in `.env`.

Attach a policy like this after replacing all values:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BucketReadinessAndLocation",
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::acme-health-prod-file-public-111122223333",
        "arn:aws:s3:::acme-health-prod-file-private-111122223333"
      ]
    },
    {
      "Sid": "PublicObjectWorkflow",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::acme-health-prod-file-public-111122223333/production/public/*"
    },
    {
      "Sid": "PrivateObjectWorkflow",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::acme-health-prod-file-private-111122223333/production/private/*"
    },
    {
      "Sid": "UseFileServiceKmsKey",
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey*", "kms:DescribeKey"],
      "Resource": "arn:aws:kms:ap-south-1:111122223333:key/00000000-0000-0000-0000-000000000000",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "s3.ap-south-1.amazonaws.com"
        }
      }
    }
  ]
}
```

Important details:

- `HeadBucket` readiness requires `s3:ListBucket` on each bucket ARN; a restrictive prefix condition can break it.
- `HeadObject` is authorized by `s3:GetObject`; `s3:HeadObject` is not an IAM action.
- Batch deletion uses `s3:DeleteObject` authorization per key.
- Copy requires read on the source and write on the destination.
- Presigned URLs use the signer role’s permissions; clients need no IAM access.
- Do not grant `s3:*`, ACL actions, bucket administration, unrelated prefixes, or KMS administration.

Review effective permissions through IAM Access Analyzer, policy simulation, permissions boundaries, endpoint policies, and SCPs.

## 10. Defensive bucket policies

### Require TLS

Add this deny statement to both bucket policies:

```json
{
  "Sid": "DenyInsecureTransport",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": [
    "arn:aws:s3:::<bucket-name>",
    "arn:aws:s3:::<bucket-name>/*"
  ],
  "Condition": {
    "Bool": {"aws:SecureTransport": "false"}
  }
}
```

### Require the approved KMS key

When the application uses `aws:kms`, add these statements to each bucket:

```json
[
{
  "Sid": "DenyUploadsWithoutKms",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::<bucket-name>/*",
  "Condition": {
    "StringNotEquals": {"s3:x-amz-server-side-encryption": "aws:kms"}
  }
},
{
  "Sid": "DenyUploadsWithWrongKmsKey",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::<bucket-name>/*",
  "Condition": {
    "StringNotEquals": {
      "s3:x-amz-server-side-encryption-aws-kms-key-id": "arn:aws:kms:ap-south-1:111122223333:key/00000000-0000-0000-0000-000000000000"
    }
  }
}
]
```

Test server uploads, presigned PUTs, copy/move, scanners, replication, logging, and recovery tooling before enforcing explicit denies. If a client relies only on default encryption and omits headers, a header-requiring policy rejects it; this service sends the headers when configured.

## 11. CloudFront for public assets

Create a distribution with:

- the regular S3 regional endpoint as origin, not a website endpoint;
- Origin Access Control with `always` signing and `sigv4`;
- HTTPS-only or HTTP-to-HTTPS viewer policy;
- only `GET`, `HEAD`, and `OPTIONS` for the asset behavior;
- a minimal cache key without cookies or authorization;
- an ACM certificate and approved public domain;
- approved response headers, access logs, and WAF controls.

Grant only the specific distribution read access to the public prefix:

```json
{
  "Sid": "AllowCloudFrontReadPublicAssets",
  "Effect": "Allow",
  "Principal": {"Service": "cloudfront.amazonaws.com"},
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::acme-health-prod-file-public-111122223333/production/public/*",
  "Condition": {
    "StringEquals": {
      "AWS:SourceArn": "arn:aws:cloudfront::111122223333:distribution/E1234567890ABC"
    }
  }
}
```

If public objects use SSE-KMS, add the narrowly scoped CloudFront service-principal statement from AWS’s OAC guidance to the KMS key policy, conditioned on the same distribution ARN.

```env
AWS_CLOUDFRONT_PUBLIC_BASE_URL=https://files.example-health.com
AWS_S3_PUBLIC_BASE_URL=
```

Do not put the private bucket behind an unrestricted public behavior. Public keys are unique and use immutable cache control, so replacement should publish a new URL instead of overwriting keys or routinely invalidating CloudFront.

## 12. S3 CORS for browser PUT

Application CORS and S3 CORS are independent. NestJS CORS controls browser calls to the API; bucket CORS controls direct presigned `PUT` requests.

Create `bucket-cors.json` with exact approved origins:

```json
{
  "CORSRules": [
    {
      "ID": "HealthcareFileServicePresignedPut",
      "AllowedOrigins": [
        "https://app.example-health.com",
        "https://admin.example-health.com"
      ],
      "AllowedMethods": ["PUT"],
      "AllowedHeaders": [
        "content-type",
        "cache-control",
        "x-amz-meta-sha256",
        "x-amz-server-side-encryption",
        "x-amz-server-side-encryption-aws-kms-key-id"
      ],
      "ExposeHeaders": ["ETag", "x-amz-version-id"],
      "MaxAgeSeconds": 300
    }
  ]
}
```

```bash
aws s3api put-bucket-cors --bucket "$PUBLIC_BUCKET" --cors-configuration file://bucket-cors.json
aws s3api put-bucket-cors --bucket "$PRIVATE_BUCKET" --cors-configuration file://bucket-cors.json
```

Never use wildcard origins for healthcare workflows. Allow only required methods and signed headers. Do not add private-bucket `GET` unless browser JavaScript must read downloads cross-origin. The upload client must send the exact headers returned by the service.

## 13. Presigned URL policy

```env
PRESIGNED_UPLOAD_EXPIRY_SECONDS=900
PRESIGNED_DOWNLOAD_EXPIRY_SECONDS=300
```

Shorten these where user experience permits. Presigned URLs are bearer capabilities and inherit the signer’s permissions. Temporary workload credentials can make them expire before the requested lifetime when the role session ends.

Operational controls:

- authorize the resource before every reservation or download;
- rate-limit signing endpoints;
- require and persist idempotency keys;
- never expose private object keys outside trusted contracts;
- redact URLs and query strings from application, gateway, CDN, analytics, and support logs;
- synchronize clocks and prevent proxies from rewriting signed requests;
- consider an `s3:signatureAge` deny only after matching all configured lifetimes;
- do not require a VPC-only source when external clients use presigned URLs.

`x-amz-meta-sha256` is signed reservation metadata, not independent proof of the uploaded bytes. For cryptographic integrity, extend the request to use an S3-supported checksum header and/or have a trusted scanner stream and hash the object.

## 14. Lifecycle and deletion

Lifecycle rules must follow the approved healthcare records schedule. Database `retention_until` does not automatically control S3 Lifecycle; a reconciliation/records process must translate policy into storage action.

A safe baseline is aborting abandoned multipart uploads, even though the current service does not create multipart sessions:

```json
{
  "Rules": [
    {
      "ID": "AbortIncompleteMultipartUploads",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 1}
    }
  ]
}
```

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$PUBLIC_BUCKET" \
  --lifecycle-configuration file://public-lifecycle.json

aws s3api put-bucket-lifecycle-configuration \
  --bucket "$PRIVATE_BUCKET" \
  --lifecycle-configuration file://private-lifecycle.json
```

An approved public policy may remove noncurrent versions and expired delete markers after a recovery window. Do not apply generic private-object expiration: healthcare categories can have different retention, legal hold, deletion, and archive requirements.

Evaluate minimum storage duration, retrieval time/cost, scanner access, discovery, and recovery objectives before transitions. Bucket policies cannot prevent S3 Lifecycle actions, so lifecycle administration is a highly privileged control that must be monitored.

## 15. Object Lock and legal hold

S3 Object Lock supplies WORM protection on versioned objects. Enable it only for an approved requirement and after adapting the application:

- current deletes create markers while protected versions remain;
- compensation and cleanup may receive access denied;
- database soft deletion does not remove a locked version;
- the service does not set S3 retention mode, retain-until date, or legal hold;
- database `retention_until` is not S3 Object Lock state.

A records-management integration must coordinate both systems. Test governance mode first. Use compliance mode only after accepting that even the root user cannot delete a protected version before expiry.

## 16. Malware protection and quarantine

The included no-op scanner is blocked in production unless a risk override is set. That override is not a production solution.

Choose a reviewed pattern:

### Synchronous scanner

Stream small server uploads or private S3 objects to an isolated ClamAV-compatible service before availability. Enforce timeouts, file/decompression limits, signature freshness, and fail-closed behavior.

### Event-driven scanner

Use quarantine state, S3/EventBridge notification, a queue, idempotent worker, and an explicit clean/malicious/error result. Only clean objects become available or move to a serving prefix. Persist every transition to file and scan tables.

### GuardDuty Malware Protection for S3

Enable protection for the relevant bucket/prefix with a dedicated service role. GuardDuty can emit scan completion to EventBridge and optionally tag objects with `GuardDutyMalwareScanStatus`. Use tag-based access control or an event consumer so pending and malicious objects cannot be served.

GuardDuty does not automatically update this service’s PostgreSQL state. Implement and test an adapter or consumer before treating it as the application scan decision. Grant its dedicated role the required object and KMS permissions separately from the application role.

For all patterns: do not serve pending/error/malicious objects; quarantine failures; alert on backlog and engine failure; never treat MIME detection as malware scanning; and never log file contents.

## 17. Network configuration

- Run the API in private subnets without public IPs.
- Use an S3 gateway VPC endpoint for service-originated traffic where appropriate.
- Restrict its endpoint policy to the two buckets and required actions.
- Add private endpoints for KMS, secrets, and logging where required.
- Restrict workload egress according to platform policy.

Do not add a bucket `aws:SourceVpce` deny when external browsers use presigned uploads/downloads; the deny also applies to their signed requests. CloudFront reaches the origin through its OAC service identity, not the application endpoint.

## 18. Audit and detection

Configure:

- organization, multi-region CloudTrail management events;
- S3 object data events for reads and writes on both buckets;
- log validation and an immutable, restricted central archive;
- alerts for bucket policy, public access, ownership, encryption, versioning, lifecycle, CORS, replication, and logging changes;
- IAM Access Analyzer, AWS Config, and Security Hub posture controls;
- S3 Storage Lens/inventory and CloudWatch request metrics as approved;
- CloudFront security/access logs;
- application access events for every private signed-URL decision.

CloudTrail does not log S3 object data events by default. Select both production buckets explicitly and budget for their volume. Logs are sensitive because object keys include resource UUIDs; complete signed URLs must never be recorded.

If S3 server access logging is required, use a separate log bucket and validate its delivery encryption. AWS documents special constraints for an S3 access-log destination using default SSE-KMS.

## 19. Backup and disaster recovery

Versioning does not satisfy every recovery objective. Decide whether to add same-region or cross-region replication, cross-account backup, separate destination KMS keys, immutable vault policies, and periodic restore tests.

Replication requires versioning plus separate S3/KMS permissions. Restoring objects without matching PostgreSQL metadata, associations, and malware state is incomplete. Document recovery ordering for PostgreSQL, object versions, KMS, CloudFront, and scan decisions.

## 20. Application production settings

Use `.env.example` as the authoritative template. The AWS block should resemble:

```env
AWS_REGION=ap-south-1

# Empty: use temporary workload credentials.
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=

AWS_S3_PUBLIC_BUCKET=acme-health-prod-file-public-111122223333
AWS_S3_PRIVATE_BUCKET=acme-health-prod-file-private-111122223333
AWS_S3_PUBLIC_PREFIX=public
AWS_S3_PRIVATE_PREFIX=private

AWS_S3_ENDPOINT=
AWS_S3_FORCE_PATH_STYLE=false

AWS_CLOUDFRONT_PUBLIC_BASE_URL=https://files.example-health.com
AWS_S3_PUBLIC_BASE_URL=

AWS_S3_SERVER_SIDE_ENCRYPTION=aws:kms
AWS_S3_KMS_KEY_ID=arn:aws:kms:ap-south-1:111122223333:key/00000000-0000-0000-0000-000000000000

AWS_S3_MAX_ATTEMPTS=3
AWS_S3_CONNECTION_TIMEOUT_MS=3000
AWS_S3_REQUEST_TIMEOUT_MS=15000

PRESIGNED_UPLOAD_EXPIRY_SECONDS=900
PRESIGNED_DOWNLOAD_EXPIRY_SECONDS=300
```

| Variable | Production meaning |
|---|---|
| `AWS_REGION` | Signing region, SDK endpoint, and fallback URL region |
| `AWS_ACCESS_KEY_ID` | Empty with workload identity; local override only |
| `AWS_SECRET_ACCESS_KEY` | Empty with workload identity; never commit |
| `AWS_SESSION_TOKEN` | Only with explicitly supplied temporary credentials |
| `AWS_S3_PUBLIC_BUCKET` | Non-PHI CloudFront origin bucket |
| `AWS_S3_PRIVATE_BUCKET` | Private regulated-document bucket |
| `AWS_S3_PUBLIC_PREFIX` | Segment after environment in public keys |
| `AWS_S3_PRIVATE_PREFIX` | Segment after environment in private keys |
| `AWS_S3_ENDPOINT` | Empty for AWS; custom URL only for compatible storage |
| `AWS_S3_FORCE_PATH_STYLE` | `false` for standard AWS requests |
| `AWS_CLOUDFRONT_PUBLIC_BASE_URL` | Stable public delivery URL without trailing slash |
| `AWS_S3_PUBLIC_BASE_URL` | Compatible-store fallback; normally empty on AWS |
| `AWS_S3_SERVER_SIDE_ENCRYPTION` | `aws:kms` or `AES256`, matching policy |
| `AWS_S3_KMS_KEY_ID` | Full same-region key ARN for `aws:kms` |
| `AWS_S3_MAX_ATTEMPTS` | Total bounded SDK attempts |
| `AWS_S3_CONNECTION_TIMEOUT_MS` | Connection establishment timeout |
| `AWS_S3_REQUEST_TIMEOUT_MS` | Total storage request timeout |
| `PRESIGNED_UPLOAD_EXPIRY_SECONDS` | Direct PUT bearer lifetime |
| `PRESIGNED_DOWNLOAD_EXPIRY_SECONDS` | Private GET bearer lifetime |

Do not point `AWS_S3_PUBLIC_BASE_URL` at a raw S3 URL while the bucket is non-public; use CloudFront. Neither public URL setting applies to private delivery.

## 21. Verification

```bash
aws s3api get-public-access-block --bucket "$PUBLIC_BUCKET"
aws s3api get-public-access-block --bucket "$PRIVATE_BUCKET"
aws s3api get-bucket-ownership-controls --bucket "$PUBLIC_BUCKET"
aws s3api get-bucket-ownership-controls --bucket "$PRIVATE_BUCKET"
aws s3api get-bucket-encryption --bucket "$PUBLIC_BUCKET"
aws s3api get-bucket-encryption --bucket "$PRIVATE_BUCKET"
aws s3api get-bucket-versioning --bucket "$PUBLIC_BUCKET"
aws s3api get-bucket-versioning --bucket "$PRIVATE_BUCKET"
aws s3api get-bucket-cors --bucket "$PUBLIC_BUCKET"
aws s3api get-bucket-cors --bucket "$PRIVATE_BUCKET"
aws s3api get-bucket-lifecycle-configuration --bucket "$PUBLIC_BUCKET"
aws s3api get-bucket-lifecycle-configuration --bucket "$PRIVATE_BUCKET"
aws s3api get-bucket-policy-status --bucket "$PUBLIC_BUCKET"
aws s3api get-bucket-policy-status --bucket "$PRIVATE_BUCKET"
```

All public-access booleans must be true, ownership must be `BucketOwnerEnforced`, versioning must be enabled, encryption must match the approved key, and policy status must not report either bucket public.

Using the actual workload identity, verify:

```bash
curl --fail https://<internal-service-host>/health/ready
```

Then in an approved non-production environment:

1. Reserve an upload and send the exact returned PUT headers.
2. Complete it and confirm size, type, metadata, encryption, version ID, and scan state.
3. Confirm the public object works only through CloudFront.
4. Confirm the private object needs a short-lived signed URL.
5. Confirm CloudTrail object events and application access events.
6. Delete a disposable object and verify version/lifecycle behavior.

## 22. Production readiness checklist

- [ ] Account, region, classification, residency, BAA, and retention decisions approved
- [ ] Separate production buckets created through reviewed IaC
- [ ] Bucket owner enforced; ACLs disabled
- [ ] All four Block Public Access settings enabled at bucket and governing levels
- [ ] Default encryption and defensive policy use the approved key
- [ ] KMS administration and application use separated
- [ ] Versioning and noncurrent-version retention reviewed
- [ ] Runtime role limited to exact buckets, prefixes, and KMS key
- [ ] `HeadBucket` readiness works with `s3:ListBucket`
- [ ] CloudFront OAC always signs and reads only the public prefix
- [ ] Public bucket has no anonymous direct read or write
- [ ] S3 CORS allows only approved origins, PUT, and signed headers
- [ ] Presigned lifetimes and signing rate limits approved
- [ ] Real scanner/quarantine integration blocks unclean objects
- [ ] Lifecycle honors retention and legal holds
- [ ] CloudTrail S3 data events enabled and tested
- [ ] Access Analyzer, Config/Security Hub, alerts, and redaction enabled
- [ ] VPC endpoint policy does not break client presigned traffic
- [ ] Backup/replication restore covers S3 and PostgreSQL metadata
- [ ] Controlled public/private workflow smoke tests pass
- [ ] No credentials, signed URLs, PHI, or real object names exist in source or logs

## 23. Troubleshooting

### Readiness bucket failure

Confirm region, bucket spelling, attached workload role, and `s3:ListBucket`. Review bucket policy, permissions boundary, SCP, session policy, KMS policy, and endpoint policy. For AWS, keep `AWS_S3_ENDPOINT` empty and path-style mode false.

### Browser preflight failure

Match the exact browser origin, allow `PUT` and every signed header, and send the request to S3 rather than CloudFront. API CORS does not configure bucket CORS.

### `SignatureDoesNotMatch`

Use the unmodified method, query string, content type, cache control, metadata, encryption, and KMS headers. Check clock synchronization and proxy rewriting.

### KMS `AccessDenied`

Validate both IAM and key policy, key region/state, full ARN, and `kms:ViaService`. Add scanner, replication, or CloudFront access only when needed.

### Delete succeeds but versions remain

With versioning, simple delete creates a marker. Inspect object versions, lifecycle, retention, and Object Lock before permanent deletion. Do not grant broad version deletion to hide this expected behavior.

### CloudFront `403`

Use a regular S3 origin, attach always-sign OAC, match the exact distribution ARN and public prefix, and grant KMS access when applicable.

## 24. Official AWS references

- [S3 Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)
- [S3 Object Ownership and disabled ACLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html)
- [SSE-KMS for Amazon S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html)
- [S3 Bucket Keys](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html)
- [S3 CORS configuration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html)
- [S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [S3 Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html)
- [S3 Lifecycle](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html)
- [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html)
- [CloudFront OAC for S3](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- [S3 gateway VPC endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html)
- [S3 CloudTrail events](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cloudtrail-logging-s3-info.html)
- [GuardDuty Malware Protection for S3](https://docs.aws.amazon.com/guardduty/latest/ug/gdu-malware-protection-s3.html)
- [AWS HIPAA guidance](https://docs.aws.amazon.com/whitepapers/latest/architecting-hipaa-security-and-compliance-on-aws/architecting-hipaa-security-and-compliance-on-aws.html)
