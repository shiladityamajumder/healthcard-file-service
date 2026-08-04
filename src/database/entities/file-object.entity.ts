import { Column, Entity, Index, Unique } from 'typeorm';
import { FileObjectStatus, FileVisibility, MalwareScanStatus } from '../../common/enums/file.enums';
import { AuditColumns } from './base-columns';

@Entity({ schema: 'platform', name: 'file_objects' })
@Unique('file_bucket_object_key', ['bucket', 'objectKey'])
@Index('ix_platform_file_objects_owner', ['ownerType', 'ownerId'])
@Index('ix_platform_file_objects_sha256', ['sha256'])
@Index('ix_platform_file_objects_status', ['status', 'createdAt'])
@Index('ix_platform_file_objects_uploaded_by', ['uploadedByUserId'])
export class FileObjectEntity extends AuditColumns {
  @Column({ name: 'storage_provider', type: 'varchar', length: 32, default: 's3' })
  storageProvider!: string;

  @Column({ type: 'varchar', length: 128 })
  bucket!: string;

  @Column({ name: 'object_key', type: 'varchar', length: 512 })
  objectKey!: string;

  @Column({ name: 'owner_type', type: 'varchar', length: 64 })
  ownerType!: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @Column({ name: 'uploaded_by_user_id', type: 'uuid', nullable: true })
  uploadedByUserId!: string | null;

  @Column({ name: 'original_filename', type: 'varchar', length: 255 })
  originalFilename!: string;

  @Column({ name: 'content_type', type: 'varchar', length: 128 })
  contentType!: string;

  @Column({ name: 'expected_size_bytes', type: 'bigint' })
  expectedSizeBytes!: string;

  @Column({ name: 'size_bytes', type: 'bigint', nullable: true })
  sizeBytes!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  sha256!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  etag!: string | null;

  @Column({ name: 'storage_version_id', type: 'varchar', length: 255, nullable: true })
  storageVersionId!: string | null;

  @Column({ name: 'encryption_key_ref', type: 'varchar', length: 255, nullable: true })
  encryptionKeyRef!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'internal' })
  classification!: string;

  @Column({ name: 'access_type', type: 'varchar', length: 16, default: FileVisibility.PRIVATE })
  accessType!: FileVisibility;

  @Column({ type: 'varchar', length: 16, default: FileObjectStatus.PENDING_UPLOAD })
  status!: FileObjectStatus;

  @Column({ name: 'malware_scan_status', type: 'varchar', length: 16, default: MalwareScanStatus.PENDING })
  malwareScanStatus!: MalwareScanStatus;

  @Column({ name: 'public_url', type: 'varchar', length: 2048, nullable: true })
  publicUrl!: string | null;

  @Column({ name: 'available_at', type: 'timestamptz', nullable: true })
  availableAt!: Date | null;

  @Column({ name: 'retention_until', type: 'timestamptz', nullable: true })
  retentionUntil!: Date | null;

  @Column({ name: 'metadata_json', type: 'jsonb', default: () => "'{}'::jsonb" })
  metadataJson!: Record<string, unknown> | unknown[];
}
