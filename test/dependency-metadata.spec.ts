import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { InternalServiceGuard } from '../src/common/guards/internal-service.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { RequestContextMiddleware } from '../src/common/middleware/request-context.middleware';
import { RequestContextService } from '../src/common/middleware/request-context.service';
import { BulkDeleteFilesDto } from '../src/modules/files/dto/bulk-delete.dto';
import { FileAssociationDto } from '../src/modules/files/dto/file-association.dto';
import {
  CompletePresignedUploadDto,
  CreatePresignedUploadDto,
} from '../src/modules/files/dto/presigned-upload.dto';
import { FilesController } from '../src/modules/files/controllers/files.controller';
import { FileValidationService } from '../src/modules/files/services/file-validation.service';
import { FilesService } from '../src/modules/files/services/files.service';
import { ObjectKeyService } from '../src/modules/files/services/object-key.service';
import { ResourceMappingService } from '../src/modules/files/services/resource-mapping.service';
import { HealthController } from '../src/modules/health/health.controller';
import { ImageProcessingService } from '../src/modules/image-processing/image-processing.service';
import { S3StorageService } from '../src/modules/storage/providers/s3-storage.service';

const constructorTypes = (target: object): unknown[] =>
  (Reflect.getMetadata('design:paramtypes', target) as unknown[] | undefined) ?? [];

const methodTypes = (target: object, method: string): unknown[] =>
  (Reflect.getMetadata('design:paramtypes', target, method) as unknown[] | undefined) ?? [];

describe('Nest runtime dependency metadata', () => {
  it('retains runtime class tokens for constructor injection', () => {
    // Decorator metadata must retain value imports; type-only imports would break Nest resolution at runtime.
    expect(constructorTypes(ImageProcessingService)).toEqual([ConfigService]);
    expect(constructorTypes(RequestContextMiddleware)).toEqual([
      RequestContextService,
      ConfigService,
    ]);
    expect(constructorTypes(GlobalExceptionFilter)).toEqual([RequestContextService, ConfigService]);
    expect(constructorTypes(ResponseInterceptor)).toEqual([RequestContextService, ConfigService]);
    expect(constructorTypes(InternalServiceGuard)).toEqual([ConfigService]);
    expect(constructorTypes(FilesController)).toEqual([FilesService, ConfigService]);
    expect(constructorTypes(ObjectKeyService)).toEqual([ConfigService]);
    expect(constructorTypes(FileValidationService)).toEqual([ConfigService]);

    const fileServiceDependencies = constructorTypes(FilesService);
    expect(fileServiceDependencies[4]).toBe(DataSource);
    expect(fileServiceDependencies.slice(7)).toEqual([
      ImageProcessingService,
      FileValidationService,
      ObjectKeyService,
      ResourceMappingService,
      RequestContextService,
      ConfigService,
    ]);

    expect(constructorTypes(HealthController)[1]).toBe(S3StorageService);
  });

  it('retains runtime DTO metadata for decorated controller parameters', () => {
    expect(methodTypes(FilesController.prototype, 'upload')[1]).toBe(FileAssociationDto);
    expect(methodTypes(FilesController.prototype, 'uploadMultiple')[1]).toBe(FileAssociationDto);
    expect(methodTypes(FilesController.prototype, 'presignedUpload')[0]).toBe(
      CreatePresignedUploadDto,
    );
    expect(methodTypes(FilesController.prototype, 'completePresignedUpload')[0]).toBe(
      CompletePresignedUploadDto,
    );
    expect(methodTypes(FilesController.prototype, 'bulkDelete')[0]).toBe(BulkDeleteFilesDto);
  });
});
