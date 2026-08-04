import { ApiProperty } from '@nestjs/swagger';

export class DownloadUrlResponseDto {
  @ApiProperty({ format: 'uri' })
  url!: string;

  @ApiProperty({ example: '2026-08-04T06:05:00.000Z' })
  expiresAt!: string;
}
