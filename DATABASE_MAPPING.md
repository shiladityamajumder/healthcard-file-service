# Database Mapping

## Authority and migration ownership

All mappings in this service were verified against `healthcare_db`. The Python project remains the only database/schema migration authority. This service connects to an already-existing database exclusively through `DATABASE_URL`. The database and every mapped object must exist before startup. TypeORM sets `synchronize: false`, `migrationsRun: false`, and `dropSchema: false`; the service contains no migration files and never creates or alters databases, schemas, or tables.

Entity and resource mappings below are intentionally unchanged. A runtime deployment should use a non-owner PostgreSQL role with `CONNECT`, schema `USAGE`, and only the table-level DML permissions shown by each mapping. It must not receive database/schema `CREATE`, object ownership, `CREATEDB`, superuser, or migration permissions.

Verified source locations:

- Shared mixins: `app/db/base.py`
- File enums: `app/models/enums.py`
- Canonical file models: `app/models/platform.py`
- Domain associations: the model files listed below

All identifiers used by the file workflow are PostgreSQL UUIDs. Shared mutable rows use `id`, `created_at`, `updated_at`, nullable `created_by`/`updated_by`, and `row_version`; `AuditMixin` additionally supplies `is_deleted`, `deleted_at`, and `deleted_by`.

## ORM entities

### `FileObjectEntity`

| Item                     | Mapping                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLAlchemy model         | `FileObjects`                                                                                                                                 |
| Python source            | `app/models/platform.py`                                                                                                                      |
| Database object          | `platform.file_objects`                                                                                                                       |
| NestJS source            | `src/database/entities/file-object.entity.ts`                                                                                                 |
| Primary key              | `id uuid`                                                                                                                                     |
| Foreign keys             | `uploaded_by_user_id -> identity.users.id` (`ON DELETE SET NULL`)                                                                             |
| Access                   | Read/write; soft delete                                                                                                                       |
| File reference semantics | Canonical object metadata. `object_key` is the persistent storage identifier; `public_url` is nullable and only populated for public objects. |

Columns mapped: all shared audit columns plus `storage_provider varchar(32)`, `bucket varchar(128)`, `object_key varchar(512)`, `owner_type varchar(64)`, `owner_id uuid`, `uploaded_by_user_id uuid nullable`, `original_filename varchar(255)`, `content_type varchar(128)`, `expected_size_bytes bigint`, `size_bytes bigint nullable`, `sha256 varchar(64) nullable`, `etag varchar(255) nullable`, `storage_version_id varchar(255) nullable`, `encryption_key_ref varchar(255) nullable`, `classification varchar(32)`, `access_type varchar(16)`, `status varchar(16)`, `malware_scan_status varchar(16)`, `public_url varchar(2048) nullable`, `available_at timestamptz nullable`, `retention_until timestamptz nullable`, and `metadata_json jsonb`.

Verified constraints relevant to the implementation:

- unique `(bucket, object_key)`;
- `expected_size_bytes > 0` and `size_bytes IS NULL OR size_bytes > 0`;
- `sha256` is null or 64 characters;
- `access_type` is `public` or `private`;
- `status` is `pending_upload`, `uploaded`, `scanning`, `available`, `quarantined`, `rejected`, or `deleted`;
- `malware_scan_status` is `pending`, `scanning`, `clean`, `infected`, or `failed`;
- an `available` row must have final size, SHA-256, and a clean malware status.

### `FileUploadSessionEntity`

| Item             | Mapping                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| SQLAlchemy model | `FileUploadSessions`                                                                                                                   |
| Python source    | `app/models/platform.py`                                                                                                               |
| Database object  | `platform.file_upload_sessions`                                                                                                        |
| NestJS source    | `src/database/entities/file-upload-session.entity.ts`                                                                                  |
| Primary key      | `id uuid`                                                                                                                              |
| Foreign keys     | `file_object_id -> platform.file_objects.id` (`ON DELETE CASCADE`); `requested_by_user_id -> identity.users.id` (`ON DELETE SET NULL`) |
| Access           | Read/write; no soft delete                                                                                                             |
| Purpose          | Persistent, scoped idempotency and lifecycle for presigned uploads                                                                     |

Columns mapped: all shared record columns plus `file_object_id`, `requested_by_user_id`, `scope varchar(128)`, `idempotency_key varchar(128)`, `upload_method varchar(32)`, `multipart_upload_id varchar(512) nullable`, `status varchar(16)`, `expires_at`, `completed_at`, `aborted_at`, and `failure_reason`.

The service uses the verified unique constraint `(scope, idempotency_key)`. Status values are `pending`, `uploading`, `completed`, `failed`, `expired`, and `aborted`.

### `FileVariantEntity`

| Item             | Mapping                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| SQLAlchemy model | `FileVariants`                                                                                                        |
| Python source    | `app/models/platform.py`                                                                                              |
| Database object  | `platform.file_variants`                                                                                              |
| NestJS source    | `src/database/entities/file-variant.entity.ts`                                                                        |
| Primary key      | `id uuid`                                                                                                             |
| Foreign keys     | `source_file_id -> platform.file_objects.id`; `variant_file_id -> platform.file_objects.id`, both `ON DELETE CASCADE` |
| Access           | Read/write; soft delete                                                                                               |
| Purpose          | Links generated renditions to the canonical source object                                                             |

The entity maps `source_file_id`, `variant_file_id`, `variant_name varchar(64)`, `transformation jsonb`, and all audit columns. It preserves the unique variant object constraint and the partial unique index on `(source_file_id, variant_name) WHERE is_deleted = false`.

### `FileAccessEventEntity`

| Item             | Mapping                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| SQLAlchemy model | `FileAccessEvents`                                                                                                               |
| Python source    | `app/models/platform.py`                                                                                                         |
| Database object  | `platform.file_access_events`                                                                                                    |
| NestJS source    | `src/database/entities/file-access-event.entity.ts`                                                                              |
| Primary key      | `id uuid`                                                                                                                        |
| Foreign keys     | `file_object_id -> platform.file_objects.id` (`ON DELETE RESTRICT`); `actor_user_id -> identity.users.id` (`ON DELETE SET NULL`) |
| Access           | Append-only insert/read                                                                                                          |
| Purpose          | Audit of signed private download URL issuance and access decisions                                                               |

Columns mapped: `id`, `created_at`, `file_object_id`, `actor_user_id`, `action varchar(32)`, `decision varchar(16)`, `purpose varchar(128)`, `request_id uuid`, `ip_address inet nullable`, `user_agent text nullable`, `signed_url_expires_at timestamptz nullable`, and `metadata_json jsonb`.

## Existing table used without a TypeORM entity

`platform.file_scan_events` is written through a fixed, parameterized SQL statement because the service only appends scanner results and does not need repository behavior. The source model is `FileScanEvents` in `app/models/platform.py`. Its file foreign key points to `platform.file_objects.id` with `ON DELETE CASCADE`. No dynamic identifier is accepted.

`platform.file_access_grants` was detected but is not mapped or modified. Gateway/domain authorization is outside this service's current scope.

## Controlled domain associations

The following allowlist is implemented in `src/modules/files/services/resource-mapping.service.ts`. The client supplies only the `resourceType` enum and resource UUID; schema, table, and column names are never accepted from input.

| Resource type                      | SQLAlchemy source                                       | Existing table / column                                                              | Association        | Visibility | Service access            | Stored value                                                               |
| ---------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------ | ---------- | ------------------------- | -------------------------------------------------------------------------- |
| `brand_logo`                       | `Brands`, `app/models/catalog.py`                       | `catalog.brands.logo_file_id`                                                        | Direct nullable FK | Public     | Read/write reference      | File object UUID; public URL remains in `platform.file_objects.public_url` |
| `user_avatar`                      | `UserProfiles`, `app/models/identity.py`                | `identity.user_profiles.avatar_file_id`                                              | Direct nullable FK | Public     | Read/write reference      | File object UUID                                                           |
| `customer_avatar`                  | `Profiles`, `app/models/customer.py`                    | `customer.profiles.avatar_file_id`                                                   | Direct nullable FK | Public     | Read/write reference      | File object UUID                                                           |
| `product_media`                    | `ProductMedia`, `app/models/catalog.py`                 | `catalog.product_media.file_object_id`; parent `catalog.products.id`                 | Link row           | Public     | Insert/update/delete link | File object UUID plus allowlisted media metadata                           |
| `prescription_document`            | `PrescriptionDocuments`, `app/models/clinical.py`       | `clinical.prescription_documents.file_object_id`; parent `clinical.prescriptions.id` | Link row           | Private    | Insert/update/delete link | File object UUID                                                           |
| `diagnostic_report`                | `DiagnosticReports`, `app/models/diagnostics.py`        | `diagnostics.diagnostic_reports.file_object_id`                                      | Direct nullable FK | Private    | Read/write reference      | File object UUID                                                           |
| `organization_license_document`    | `Licenses`, `app/models/organization.py`                | `organization.licenses.document_file_id`                                             | Direct nullable FK | Private    | Read/write reference      | File object UUID                                                           |
| `regulatory_registration_document` | `RegulatoryRegistrations`, `app/models/compliance.py`   | `compliance.regulatory_registrations.document_file_id`                               | Direct nullable FK | Private    | Read/write reference      | File object UUID                                                           |
| `insurance_claim_document`         | `ClaimDocuments`, `app/models/insurance.py`             | `insurance.claim_documents.file_object_id`; parent `insurance.claims.id`             | Link row           | Private    | Insert/update/delete link | File UUID plus required `document_type`                                    |
| `support_ticket_attachment`        | `TicketAttachments`, `app/models/support.py`            | `support.ticket_attachments.file_object_id`; parent `support.tickets.id`             | Link row           | Private    | Insert/update/delete link | File UUID plus optional ticket message UUID                                |
| `finance_invoice_document`         | `Invoices`, `app/models/finance.py`                     | `finance.invoices.document_file_id`                                                  | Direct nullable FK | Private    | Read/write reference      | File object UUID                                                           |
| `finance_credit_note_document`     | `CreditNotes`, `app/models/finance.py`                  | `finance.credit_notes.document_file_id`                                              | Direct nullable FK | Private    | Read/write reference      | File object UUID                                                           |
| `shipment_label`                   | `Shipments`, `app/models/logistics.py`                  | `logistics.shipments.shipping_label_file_id`                                         | Direct nullable FK | Private    | Read/write reference      | File object UUID                                                           |
| `delivery_proof`                   | `DeliveryAttempts`, `app/models/logistics.py`           | `logistics.delivery_attempts.proof_file_id`                                          | Direct nullable FK | Private    | Read/write reference      | File object UUID                                                           |
| `teleconsultation_recording`       | `TeleconsultationSessions`, `app/models/appointment.py` | `appointment.teleconsultation_sessions.recording_file_id`                            | Direct nullable FK | Private    | Read/write reference      | File object UUID                                                           |
| `payment_reconciliation_source`    | `ReconciliationRuns`, `app/models/payment.py`           | `payment.reconciliation_runs.source_file_id`                                         | Direct nullable FK | Private    | Read/write reference      | File object UUID                                                           |
| `supplier_license_document`        | `SupplierLicenses`, `app/models/procurement.py`         | `procurement.supplier_licenses.document_file_id`                                     | Direct nullable FK | Private    | Read/write reference      | File object UUID                                                           |
| `supplier_invoice_document`        | `SupplierInvoices`, `app/models/procurement.py`         | `procurement.supplier_invoices.document_file_id`                                     | Direct nullable FK | Private    | Read/write reference      | File object UUID                                                           |
| `notification_attachment`          | `MessageAttachments`, `app/models/notification.py`      | `notification.message_attachments.file_object_id`; parent `notification.messages.id` | Link row           | Private    | Insert/update/delete link | File UUID plus allowlisted disposition/display metadata                    |
| `in_app_notification_image`        | `InAppNotifications`, `app/models/notification.py`      | `notification.in_app_notifications.image_file_id`                                    | Direct nullable FK | Public     | Read/write reference      | File object UUID                                                           |

For direct mappings, an existing reference cannot be overwritten unless replacement is explicitly requested. Multiple upload is restricted to link-table mappings. Replacements use the old file UUID as an optimistic predicate to prevent a stale request from overwriting a newer association.

## Detected but intentionally not enabled in the API allowlist

Additional file references were found, including `compliance.evidence.file_object_id`. They were not enabled because the current endpoint metadata and ownership semantics are not sufficiently defined for safe generic writes. Adding one requires verification of its parent-resource lifecycle, visibility policy, required columns, and authorization contract, followed by an explicit allowlist entry and tests.

## Mapping uncertainties and schema changes

No canonical metadata table is missing, and no database change is required for the implemented capabilities. Persistent idempotency is available for presigned upload sessions only. Server-side upload, replacement, delete, and bulk-delete retries use state checks and optimistic association updates but do not have a dedicated operation-idempotency table. A future reconciliation/outbox table could improve cleanup retries and operation-level idempotency, but it was intentionally not proposed or applied by this service.

Readiness does not use these mapped tables and runs only `SELECT 1`. A missing/unreachable database therefore produces a sanitized unavailable response; schema compatibility remains an external deployment prerequisite owned by `healthcare_db`.
