import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkDeleteFilesDto {
  @ApiProperty({ type: [String], format: 'uuid', maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  fileIds!: string[];
}
