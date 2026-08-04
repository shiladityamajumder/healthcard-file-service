import { Column, Entity, Index, Unique } from 'typeorm';
import { AuditColumns } from './base-columns';

@Entity({ schema: 'platform', name: 'file_variants' })
@Index('uq_platform_file_variants_source_name_active', ['sourceFileId', 'variantName'], {
  unique: true,
  where: 'is_deleted = false',
})
@Unique('file_variant_object', ['variantFileId'])
export class FileVariantEntity extends AuditColumns {
  @Column({ name: 'source_file_id', type: 'uuid' })
  sourceFileId!: string;

  @Column({ name: 'variant_file_id', type: 'uuid' })
  variantFileId!: string;

  @Column({ name: 'variant_name', type: 'varchar', length: 64 })
  variantName!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  transformation!: Record<string, unknown> | unknown[];
}
