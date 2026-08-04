import type { ConfigService } from '@nestjs/config';
import type { DataSource, Repository } from 'typeorm';
import { FileVisibility } from '../src/common/enums/file.enums';
import type { RequestContextService } from '../src/common/middleware/request-context.service';
import type {
  FileAccessEventEntity,
  FileObjectEntity,
  FileUploadSessionEntity,
  FileVariantEntity,
} from '../src/database/entities';
import type { FileScanner } from '../src/modules/file-scanning/file-scanner.interface';
import type { ImageProcessingService } from '../src/modules/image-processing/image-processing.service';
import type { StorageService } from '../src/modules/storage/interfaces/storage.interface';
import { FileCategory } from '../src/modules/files/enums/file-category.enum';
import { ResourceType } from '../src/modules/files/enums/resource-type.enum';
import type { FileValidationService } from '../src/modules/files/services/file-validation.service';
import { FilesService } from '../src/modules/files/services/files.service';
import type { ObjectKeyService } from '../src/modules/files/services/object-key.service';
import type { ResourceMappingService } from '../src/modules/files/services/resource-mapping.service';

describe('FilesService compensation', () => {
  it('deletes the S3 object when database persistence fails', async () => {
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      transaction: jest.fn().mockRejectedValue(new Error('database unavailable')),
    } as unknown as DataSource;
    const storage = {
      upload: jest.fn().mockResolvedValue({
        bucket: 'private-bucket',
        key: 'development/private/prescription_document/resource/2026/08/file.pdf',
        etag: 'etag',
        versionId: null,
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    } as unknown as StorageService;
    const validator = {
      validateBuffer: jest.fn().mockResolvedValue({
        sanitizedFilename: 'prescription.pdf',
        contentType: 'application/pdf',
      }),
    } as unknown as FileValidationService;
    const scanner = {
      scan: jest.fn().mockResolvedValue({
        clean: true,
        scanner: 'test',
        status: 'clean',
        findings: {},
      }),
    } as unknown as FileScanner;
    const resourceMapper = {
      validate: jest.fn(),
      definition: jest.fn().mockReturnValue({
        associationKind: 'link',
        ownerType: 'clinical.prescriptions',
      }),
      assertResourceExists: jest.fn().mockResolvedValue(undefined),
      currentFileId: jest.fn().mockResolvedValue(null),
    } as unknown as ResourceMappingService;
    const keyService = {
      generate: jest
        .fn()
        .mockReturnValue('development/private/prescription_document/resource/2026/08/file.pdf'),
    } as unknown as ObjectKeyService;
    const imageProcessing = {
      createVariants: jest.fn().mockResolvedValue([]),
    } as unknown as ImageProcessingService;

    const service = new FilesService(
      {} as Repository<FileObjectEntity>,
      {} as Repository<FileUploadSessionEntity>,
      {} as Repository<FileVariantEntity>,
      {} as Repository<FileAccessEventEntity>,
      dataSource,
      storage,
      scanner,
      imageProcessing,
      validator,
      keyService,
      resourceMapper,
      {} as RequestContextService,
      {} as ConfigService,
    );

    const file = {
      buffer: Buffer.from('%PDF-1.7 test'),
      size: 13,
    } as Express.Multer.File;

    await expect(
      service.upload(file, {
        resourceType: ResourceType.PRESCRIPTION_DOCUMENT,
        resourceId: '4c454f02-c9d2-4c5b-8e1a-57a627e53d1b',
        fileCategory: FileCategory.PRESCRIPTION,
        visibility: FileVisibility.PRIVATE,
        replaceExisting: false,
        metadata: {},
      }),
    ).rejects.toThrow('database unavailable');

    expect(storage.delete).toHaveBeenCalledWith(
      FileVisibility.PRIVATE,
      'development/private/prescription_document/resource/2026/08/file.pdf',
    );
    expect(queryRunner.release).toHaveBeenCalled();
  });
});
