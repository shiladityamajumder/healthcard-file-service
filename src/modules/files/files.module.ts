import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestContextService } from '../../common/middleware/request-context.service';
import {
  FileAccessEventEntity,
  FileObjectEntity,
  FileUploadSessionEntity,
  FileVariantEntity,
} from '../../database/entities';
import { FileScanningModule } from '../file-scanning/file-scanning.module';
import { ImageProcessingModule } from '../image-processing/image-processing.module';
import { StorageModule } from '../storage/storage.module';
import { FilesController } from './controllers/files.controller';
import { FileValidationService } from './services/file-validation.service';
import { FilesService } from './services/files.service';
import { ObjectKeyService } from './services/object-key.service';
import { ResourceMappingService } from './services/resource-mapping.service';

@Module({
  imports: [
    // These entities map to tables provisioned by healthcare_db; TypeORM only uses them at runtime.
    TypeOrmModule.forFeature([
      FileObjectEntity,
      FileUploadSessionEntity,
      FileVariantEntity,
      FileAccessEventEntity,
    ]),
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: config.getOrThrow<number>('upload.maxSingleFileSizeBytes'),
          files: config.getOrThrow<number>('upload.maxMultipleFileCount'),
          fields: 20,
          fieldNameSize: 100,
          fieldSize: 1024 * 1024,
          parts: config.getOrThrow<number>('upload.maxMultipleFileCount') + 20,
        },
      }),
    }),
    StorageModule,
    FileScanningModule,
    ImageProcessingModule,
  ],
  controllers: [FilesController],
  providers: [
    // Keep one request-context store shared by controllers and services in this module.
    RequestContextService,
    FilesService,
    FileValidationService,
    ObjectKeyService,
    ResourceMappingService,
  ],
  exports: [RequestContextService, FilesService, ResourceMappingService],
})
export class FilesModule {}
