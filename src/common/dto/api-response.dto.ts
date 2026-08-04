import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorBodyDto {
  @ApiProperty({ example: 'FILE_NOT_FOUND' })
  code!: string;

  @ApiProperty({ example: 'The requested file was not found.' })
  message!: string;

  @ApiPropertyOptional({ type: Object, nullable: true })
  details!: unknown;
}

export class ResponseMetaDto {
  @ApiProperty({
    type: String,
    example: '6c6f95f7-5750-4be9-9a92-a76c30d69f0b',
    nullable: true,
  })
  request_id!: string | null;

  @ApiProperty({
    type: String,
    example: '6c6f95f7-5750-4be9-9a92-a76c30d69f0b',
    nullable: true,
  })
  correlation_id!: string | null;

  @ApiProperty({ example: 'v1' })
  api_version!: string;

  @ApiProperty({ example: '2026-08-04T06:00:00.000Z' })
  timestamp!: string;
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: false })
  success!: false;

  // Errors intentionally carry no success payload; keeping this explicit avoids Swagger inferring a model.
  @ApiProperty({ type: Object, nullable: true, example: null })
  data!: null;

  @ApiProperty({ type: () => ErrorBodyDto })
  error!: ErrorBodyDto;

  @ApiProperty({ type: () => ResponseMetaDto })
  meta!: ResponseMetaDto;
}
