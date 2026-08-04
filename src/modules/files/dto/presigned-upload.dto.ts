import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, IsUUID, Length, Matches, MaxLength, Min } from 'class-validator';
import { FileAssociationDto } from './file-association.dto';

export class CreatePresignedUploadDto extends FileAssociationDto {
  @ApiProperty({ example: 'prescription.pdf', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  filename!: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @MaxLength(128)
  contentType!: string;

  @ApiProperty({ example: 524288 })
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @ApiProperty({ example: '8f14e45fceea167a5a36dedd4bea2543fcd2f8c7c453c7f5cf4193f90e84d73d' })
  @IsString()
  @Length(64, 64)
  @Matches(/^[a-f0-9]{64}$/i)
  sha256!: string;
}

export class CompletePresignedUploadDto {
  // Completion accepts only the server-issued session; object keys remain server-controlled.
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  uploadSessionId!: string;
}
