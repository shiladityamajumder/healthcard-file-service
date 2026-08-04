import { Transform, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsEnum, IsObject, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FileVisibility } from '../../../common/enums/file.enums';
import { parseBoolean, parseJsonObject } from '../../../common/utils/transform.util';
import { FileCategory } from '../enums/file-category.enum';
import { ResourceType } from '../enums/resource-type.enum';

export class FileAssociationDto {
  @ApiProperty({ enum: ResourceType, example: ResourceType.PRESCRIPTION_DOCUMENT })
  @IsEnum(ResourceType)
  resourceType!: ResourceType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  resourceId!: string;

  @ApiProperty({ enum: FileCategory, example: FileCategory.PRESCRIPTION })
  @IsEnum(FileCategory)
  fileCategory!: FileCategory;

  @ApiProperty({ enum: FileVisibility, example: FileVisibility.PRIVATE })
  @IsEnum(FileVisibility)
  visibility!: FileVisibility;

  @ApiPropertyOptional({ default: false })
  @Transform(({ value }: TransformFnParams) => parseBoolean(value))
  @IsOptional()
  @IsBoolean()
  replaceExisting = false;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { documentType: 'diagnostic_report' },
  })
  @Transform(({ value }: TransformFnParams) => parseJsonObject(value))
  @IsOptional()
  @IsObject()
  metadata: Record<string, unknown> = {};
}
