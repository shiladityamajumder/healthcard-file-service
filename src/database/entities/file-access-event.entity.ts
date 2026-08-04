import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Append-only audit mapping for private download decisions and signed URL issuance.
@Entity({ schema: 'platform', name: 'file_access_events' })
@Index('ix_platform_file_access_events_file_time', ['fileObjectId', 'createdAt'])
@Index('ix_platform_file_access_events_actor_time', ['actorUserId', 'createdAt'])
@Index('ix_platform_file_access_events_request', ['requestId'])
export class FileAccessEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'file_object_id', type: 'uuid' })
  fileObjectId!: string;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  action!: string;

  @Column({ type: 'varchar', length: 16 })
  decision!: string;

  @Column({ type: 'varchar', length: 128 })
  purpose!: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ name: 'signed_url_expires_at', type: 'timestamptz', nullable: true })
  signedUrlExpiresAt!: Date | null;

  @Column({ name: 'metadata_json', type: 'jsonb', default: () => "'{}'::jsonb" })
  metadataJson!: Record<string, unknown> | unknown[];
}
