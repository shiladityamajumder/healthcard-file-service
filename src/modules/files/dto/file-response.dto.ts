import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FileVisibility } from '../../../common/enums/file.enums';
import { FileCategory } from '../enums/file-category.enum';
import { ResourceType } from '../enums/resource-type.enum';

export class FileVariantResponseDto {
  @ApiProperty()
  name!: string;

  @ApiProperty({ format: 'uuid' })
  fileId!: string;

  @ApiPropertyOptional({ nullable: true })
  publicUrl!: string | null;
}

export class FileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ResourceType })
  resourceType!: ResourceType;

  @ApiProperty({ format: 'uuid' })
  resourceId!: string;

  @ApiProperty({ enum: FileCategory })
  fileCategory!: FileCategory;

  @ApiProperty({ enum: FileVisibility })
  visibility!: FileVisibility;

  @ApiProperty({ example: 'application/pdf' })
  contentType!: string;

  @ApiProperty({ example: 524288 })
  sizeBytes!: number;

  @ApiProperty({ example: 'prescription.pdf' })
  originalFilename!: string;

  @ApiPropertyOptional({ nullable: true })
  publicUrl!: string | null;

  @ApiProperty({ example: 'available' })
  status!: string;

  @ApiProperty({ example: 'clean' })
  malwareScanStatus!: string;

  @ApiProperty({ type: [FileVariantResponseDto] })
  variants!: FileVariantResponseDto[];

  @ApiProperty()
  createdAt!: string;
}
