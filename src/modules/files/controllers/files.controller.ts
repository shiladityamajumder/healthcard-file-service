import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/dto/api-response.dto';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AppHeaders } from '../../../config/app.config';
import { InternalServiceGuard } from '../../../common/guards/internal-service.guard';
import { BulkDeleteFilesDto } from '../dto/bulk-delete.dto';
import { FileAssociationDto } from '../dto/file-association.dto';
import { FileResponseDto } from '../dto/file-response.dto';
import { CompletePresignedUploadDto, CreatePresignedUploadDto } from '../dto/presigned-upload.dto';
import { FilesService } from '../services/files.service';

@ApiTags('Files')
@ApiHeader({
  name: 'X-Internal-Service-Key',
  required: false,
  description: 'Trusted gateway/service secret when configured.',
})
@ApiHeader({
  name: 'X-Request-ID',
  required: false,
  description: 'UUID request identifier; generated when omitted.',
})
@ApiHeader({
  name: 'X-Correlation-ID',
  required: false,
  description: 'Cross-service correlation identifier.',
})
@ApiHeader({
  name: 'X-User-ID',
  required: false,
  description: 'Trusted user UUID injected by the API Gateway.',
})
@ApiHeader({
  name: 'X-Actor-ID',
  required: false,
  description: 'Trusted acting user/service UUID.',
})
// This service is intended to sit behind the internal gateway; identity headers are not client authentication.
@UseGuards(InternalServiceGuard)
@Controller('files')
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly config: ConfigService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload one file through the service' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'resourceType', 'resourceId', 'fileCategory', 'visibility'],
      properties: {
        file: { type: 'string', format: 'binary' },
        resourceType: { type: 'string', example: 'prescription_document' },
        resourceId: { type: 'string', format: 'uuid' },
        fileCategory: { type: 'string', example: 'prescription' },
        visibility: { type: 'string', enum: ['public', 'private'] },
        replaceExisting: { type: 'boolean', default: false },
        metadata: { type: 'string', example: '{"documentType":"diagnostic_report"}' },
      },
    },
  })
  @ApiCreatedResponse({ type: FileResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: FileAssociationDto,
  ): Promise<Record<string, unknown>> {
    if (!file) throw new AppException('FILE_REQUIRED', 'A multipart file is required.', 422);
    return this.filesService.upload(file, dto);
  }

  @Post('upload-multiple')
  @UseInterceptors(FilesInterceptor('files'))
  @ApiOperation({ summary: 'Upload multiple files through the service' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files', 'resourceType', 'resourceId', 'fileCategory', 'visibility'],
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
        resourceType: { type: 'string' },
        resourceId: { type: 'string', format: 'uuid' },
        fileCategory: { type: 'string' },
        visibility: { type: 'string', enum: ['public', 'private'] },
        metadata: { type: 'string', example: '{}' },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Files uploaded. Each file has canonical metadata.' })
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body() dto: FileAssociationDto,
  ): Promise<Record<string, unknown>> {
    return this.filesService.uploadMultiple(files ?? [], dto);
  }

  @Post('presigned-upload')
  @ApiOperation({ summary: 'Reserve an object and create a presigned S3 PUT URL' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique retry key within the resource scope.',
  })
  @ApiCreatedResponse({
    description: 'Presigned request created. Do not log or persist the returned URL.',
    schema: {
      example: {
        uploadSessionId: '5f95cf7b-c6e9-40b5-a36e-5b91f874d99d',
        fileId: '8226d071-061c-4c61-ae74-603606cd654f',
        method: 'PUT',
        uploadUrl: 'https://signed-url.example',
        requiredHeaders: {
          'content-type': 'application/pdf',
          'x-amz-meta-sha256': '8f14e45fceea167a5a36dedd4bea2543fcd2f8c7c453c7f5cf4193f90e84d73d',
        },
        expiresAt: '2026-08-04T06:15:00.000Z',
      },
    },
  })
  async presignedUpload(
    @Body() dto: CreatePresignedUploadDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<Record<string, unknown>> {
    // The gateway supplies the idempotency header; the client cannot choose a storage key directly.
    const name = this.config.getOrThrow<AppHeaders>('app.headers').idempotencyKey;
    const raw = headers[name];
    const key = Array.isArray(raw) ? raw[0] : raw;
    return this.filesService.createPresignedUpload(dto, key ?? '');
  }

  @Post('presigned-upload/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify and finalize a direct-to-S3 upload' })
  @ApiOkResponse({ description: 'Completion is idempotent.' })
  async completePresignedUpload(
    @Body() dto: CompletePresignedUploadDto,
  ): Promise<Record<string, unknown>> {
    return this.filesService.completePresignedUpload(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve canonical file metadata' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: FileResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async getFile(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<Record<string, unknown>> {
    return this.filesService.getFile(id);
  }

  @Get(':id/download-url')
  @ApiOperation({ summary: 'Create a short-lived download URL for a private file' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    schema: {
      example: { url: 'https://signed-url.example', expiresAt: '2026-08-04T06:05:00.000Z' },
    },
  })
  async downloadUrl(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<Record<string, unknown>> {
    return this.filesService.getDownloadUrl(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a file and clear its domain association' })
  async deleteFile(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<Record<string, unknown>> {
    return this.filesService.deleteFile(id);
  }

  @Put(':id/replace')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Safely replace an existing file object' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async replaceFile(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<Record<string, unknown>> {
    if (!file) throw new AppException('FILE_REQUIRED', 'A multipart file is required.', 422);
    return this.filesService.replaceFile(id, file);
  }

  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete multiple files with per-file results' })
  async bulkDelete(@Body() dto: BulkDeleteFilesDto): Promise<Record<string, unknown>> {
    return this.filesService.bulkDelete(dto);
  }
}
