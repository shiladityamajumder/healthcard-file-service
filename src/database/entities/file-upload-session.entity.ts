import { Column, Entity, Index, Unique } from 'typeorm';
import { FileUploadStatus } from '../../common/enums/file.enums';
import { RecordColumns } from './base-columns';

@Entity({ schema: 'platform', name: 'file_upload_sessions' })
@Unique('file_upload_scope_key', ['scope', 'idempotencyKey'])
@Index('ix_platform_file_upload_sessions_file', ['fileObjectId'])
@Index('ix_platform_file_upload_sessions_status_expiry', ['status', 'expiresAt'])
export class FileUploadSessionEntity extends RecordColumns {
  @Column({ name: 'file_object_id', type: 'uuid' })
  fileObjectId!: string;

  @Column({ name: 'requested_by_user_id', type: 'uuid', nullable: true })
  requestedByUserId!: string | null;

  @Column({ type: 'varchar', length: 128 })
  scope!: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128 })
  idempotencyKey!: string;

  @Column({ name: 'upload_method', type: 'varchar', length: 32, default: 'single' })
  uploadMethod!: string;

  @Column({ name: 'multipart_upload_id', type: 'varchar', length: 512, nullable: true })
  multipartUploadId!: string | null;

  @Column({ type: 'varchar', length: 16, default: FileUploadStatus.PENDING })
  status!: FileUploadStatus;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'aborted_at', type: 'timestamptz', nullable: true })
  abortedAt!: Date | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;
}
