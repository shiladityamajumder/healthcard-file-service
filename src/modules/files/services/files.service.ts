import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  QueryFailedError,
  type EntityManager,
  type QueryRunner,
  type Repository,
} from 'typeorm';
import {
  FileObjectStatus,
  FileUploadStatus,
  FileVisibility,
  MalwareScanStatus,
} from '../../../common/enums/file.enums';
import { AppException } from '../../../common/exceptions/app.exception';
import { sha256Hex } from '../../../common/utils/hash.util';
import { RequestContextService } from '../../../common/middleware/request-context.service';
import {
  FileAccessEventEntity,
  FileObjectEntity,
  FileUploadSessionEntity,
  FileVariantEntity,
} from '../../../database/entities';
import { FILE_SCANNER, type FileScanner } from '../../file-scanning/file-scanner.interface';
import {
  ImageProcessingService,
  type ImageVariantResult,
} from '../../image-processing/image-processing.service';
import {
  STORAGE_SERVICE,
  type StorageService,
  type UploadObjectResult,
} from '../../storage/interfaces/storage.interface';
import type { BulkDeleteFilesDto } from '../dto/bulk-delete.dto';
import type { FileAssociationDto } from '../dto/file-association.dto';
import type {
  CompletePresignedUploadDto,
  CreatePresignedUploadDto,
} from '../dto/presigned-upload.dto';
import { FileCategory } from '../enums/file-category.enum';
import type { ResourceType } from '../enums/resource-type.enum';
import type { ResourceAssociationInput } from '../interfaces/resource-mapping.interface';
import { FileValidationService } from './file-validation.service';
import { ObjectKeyService } from './object-key.service';
import { ResourceMappingService } from './resource-mapping.service';

interface UploadedObjectState {
  visibility: FileVisibility;
  key: string;
}

interface FileMetadataJson extends Record<string, unknown> {
  resourceType: ResourceType;
  fileCategory: FileCategory;
  resourceId: string;
  associationMetadata: Record<string, unknown>;
  replaceExisting: boolean;
  visibility: FileVisibility;
  expectedOldFileId?: string;
  expectedSha256?: string;
  idempotencyFingerprint?: string;
  scan?: Record<string, unknown>;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @InjectRepository(FileObjectEntity)
    private readonly files: Repository<FileObjectEntity>,
    @InjectRepository(FileUploadSessionEntity)
    private readonly uploadSessions: Repository<FileUploadSessionEntity>,
    @InjectRepository(FileVariantEntity)
    private readonly variants: Repository<FileVariantEntity>,
    @InjectRepository(FileAccessEventEntity)
    private readonly accessEvents: Repository<FileAccessEventEntity>,
    private readonly dataSource: DataSource,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @Inject(FILE_SCANNER) private readonly scanner: FileScanner,
    private readonly imageProcessing: ImageProcessingService,
    private readonly validator: FileValidationService,
    private readonly keyService: ObjectKeyService,
    private readonly resourceMapper: ResourceMappingService,
    private readonly contextService: RequestContextService,
    private readonly config: ConfigService,
  ) {}

  async upload(
    file: Express.Multer.File,
    dto: FileAssociationDto,
  ): Promise<Record<string, unknown>> {
    return this.performServerUpload(file, dto);
  }

  async uploadMultiple(
    files: Express.Multer.File[],
    dto: FileAssociationDto,
  ): Promise<Record<string, unknown>> {
    const maxCount = this.config.getOrThrow<number>('upload.maxMultipleFileCount');
    if (!files.length) {
      throw new AppException('FILES_REQUIRED', 'At least one file is required.', 422);
    }
    if (files.length > maxCount) {
      throw new AppException('TOO_MANY_FILES', 'The request contains too many files.', 413, {
        maxFileCount: maxCount,
      });
    }
    const totalSize = files.reduce((total, file) => total + file.size, 0);
    const maxTotal = this.config.getOrThrow<number>('upload.maxTotalUploadSizeBytes');
    if (totalSize > maxTotal) {
      throw new AppException(
        'TOTAL_UPLOAD_TOO_LARGE',
        'The combined upload size is too large.',
        413,
        {
          maxTotalUploadSizeBytes: maxTotal,
        },
      );
    }

    const definition = this.resourceMapper.definition(dto.resourceType);
    if (definition.associationKind !== 'link') {
      throw new AppException(
        'MULTIPLE_FILES_NOT_ALLOWED',
        'Multiple uploads are only supported for resources with link-table associations.',
        409,
      );
    }

    const results: Array<Record<string, unknown>> = [];
    for (const file of files) {
      results.push(await this.performServerUpload(file, { ...dto, replaceExisting: false }));
    }
    return { files: results, count: results.length };
  }

  async createPresignedUpload(
    dto: CreatePresignedUploadDto,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    // Reserve metadata first; the client receives only a server-generated key and signed request.
    if (!idempotencyKey || idempotencyKey.length > 128) {
      throw new AppException(
        'IDEMPOTENCY_KEY_REQUIRED',
        'A valid idempotency key header is required.',
        422,
      );
    }
    this.resourceMapper.validate({
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      visibility: dto.visibility,
      category: dto.fileCategory,
      metadata: dto.metadata,
    });
    const validated = this.validator.validateMetadata(
      dto.filename,
      dto.contentType,
      dto.sizeBytes,
      dto.fileCategory,
    );
    const definition = this.resourceMapper.definition(dto.resourceType);
    const idempotencyFingerprint = this.presignedRequestFingerprint(dto, validated);
    let expectedOldFileId: string | null = null;
    await this.withRunner(async (runner) => {
      await this.resourceMapper.assertResourceExists(runner, dto.resourceType, dto.resourceId);
      expectedOldFileId = await this.resourceMapper.currentFileId(
        runner,
        dto.resourceType,
        dto.resourceId,
      );
    });
    if (definition.associationKind === 'link' && dto.replaceExisting) {
      throw new AppException(
        'REPLACE_REQUIRES_FILE_ENDPOINT',
        'Replace a linked file through PUT /files/:id/replace.',
        409,
      );
    }
    if (definition.associationKind === 'direct' && expectedOldFileId && !dto.replaceExisting) {
      throw new AppException(
        'FILE_ASSOCIATION_EXISTS',
        'The resource already has a file. Set replaceExisting or use the replace endpoint.',
        409,
      );
    }

    const scope = `files:${dto.resourceType}:${dto.resourceId}`;
    const existing = await this.uploadSessions.findOne({
      where: { scope, idempotencyKey },
    });
    if (existing) {
      const existingFile = await this.files.findOne({ where: { id: existing.fileObjectId } });
      if (!existingFile) {
        throw new AppException('UPLOAD_SESSION_CORRUPT', 'The upload session is invalid.', 409);
      }
      this.assertIdempotencyFingerprint(existingFile, idempotencyFingerprint);
      // Reusing a key is safe only when the complete request fingerprint matches.
      if (existing.status === FileUploadStatus.COMPLETED) {
        return {
          uploadSessionId: existing.id,
          alreadyCompleted: true,
          file: await this.mapFile(existingFile),
        };
      }
      if (existing.expiresAt <= new Date()) {
        await this.expirePresignedUpload(existing, existingFile);
        throw new AppException('PRESIGNED_URL_EXPIRED', 'The upload session has expired.', 410);
      }
      if (![FileUploadStatus.PENDING, FileUploadStatus.UPLOADING].includes(existing.status)) {
        throw new AppException(
          'UPLOAD_SESSION_NOT_REUSABLE',
          'The idempotent upload session is no longer reusable.',
          409,
        );
      }
      return this.buildPresignedResponse(existing, existingFile);
    }

    const objectKey = this.keyService.generate({
      visibility: dto.visibility,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      filename: validated.sanitizedFilename,
    });
    const context = this.contextService.get();
    const expiresAt = new Date(
      Date.now() + this.config.getOrThrow<number>('aws.presignedUploadExpirySeconds') * 1000,
    );
    const metadataJson: FileMetadataJson = {
      resourceType: dto.resourceType,
      fileCategory: dto.fileCategory,
      resourceId: dto.resourceId,
      associationMetadata: dto.metadata,
      replaceExisting: dto.replaceExisting,
      visibility: dto.visibility,
      expectedOldFileId: expectedOldFileId ?? undefined,
      expectedSha256: dto.sha256.toLowerCase(),
      idempotencyFingerprint,
    };

    let created: { file: FileObjectEntity; session: FileUploadSessionEntity };
    // S3 is outside the transaction, so completion failures must transition both records explicitly.
    try {
      created = await this.dataSource.transaction(async (manager: EntityManager) => {
        const fileEntity = manager.create(FileObjectEntity, {
          storageProvider: 's3',
          bucket: this.storage.getBucket(dto.visibility),
          objectKey,
          ownerType: definition.ownerType,
          ownerId: dto.resourceId,
          uploadedByUserId: context?.userId ?? context?.actorId ?? null,
          originalFilename: validated.sanitizedFilename,
          contentType: validated.contentType,
          expectedSizeBytes: String(dto.sizeBytes),
          sizeBytes: null,
          sha256: null,
          etag: null,
          storageVersionId: null,
          encryptionKeyRef: this.config.get<string>('aws.kmsKeyId') ?? null,
          classification: this.classification(dto.visibility, dto.fileCategory),
          accessType: dto.visibility,
          status: FileObjectStatus.PENDING_UPLOAD,
          malwareScanStatus: MalwareScanStatus.PENDING,
          publicUrl: null,
          availableAt: null,
          retentionUntil: null,
          metadataJson,
          createdBy: context?.actorId ?? context?.userId ?? null,
          updatedBy: context?.actorId ?? context?.userId ?? null,
        });
        const savedFile = await manager.save(fileEntity);
        const session = manager.create(FileUploadSessionEntity, {
          fileObjectId: savedFile.id,
          requestedByUserId: context?.userId ?? context?.actorId ?? null,
          scope,
          idempotencyKey,
          uploadMethod: 'single',
          multipartUploadId: null,
          status: FileUploadStatus.PENDING,
          expiresAt,
          completedAt: null,
          abortedAt: null,
          failureReason: null,
          createdBy: context?.actorId ?? context?.userId ?? null,
          updatedBy: context?.actorId ?? context?.userId ?? null,
        });
        const savedSession = await manager.save(session);
        return { file: savedFile, session: savedSession };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const concurrent = await this.uploadSessions.findOne({
          where: { scope, idempotencyKey },
        });
        if (concurrent) {
          const concurrentFile = await this.files.findOne({
            where: { id: concurrent.fileObjectId },
          });
          if (!concurrentFile) {
            throw new AppException('UPLOAD_SESSION_CORRUPT', 'The upload session is invalid.', 409);
          }
          this.assertIdempotencyFingerprint(concurrentFile, idempotencyFingerprint);
          if (concurrent.status === FileUploadStatus.COMPLETED) {
            return {
              uploadSessionId: concurrent.id,
              alreadyCompleted: true,
              file: await this.mapFile(concurrentFile),
            };
          }
          if (concurrent.expiresAt <= new Date()) {
            await this.expirePresignedUpload(concurrent, concurrentFile);
            throw new AppException('PRESIGNED_URL_EXPIRED', 'The upload session has expired.', 410);
          }
          if (![FileUploadStatus.PENDING, FileUploadStatus.UPLOADING].includes(concurrent.status)) {
            throw new AppException(
              'UPLOAD_SESSION_NOT_REUSABLE',
              'The idempotent upload session is no longer reusable.',
              409,
            );
          }
          return this.buildPresignedResponse(concurrent, concurrentFile);
        }
      }
      throw error;
    }

    try {
      return await this.buildPresignedResponse(created.session, created.file);
    } catch (error) {
      await this.uploadSessions.update(created.session.id, {
        status: FileUploadStatus.FAILED,
        failureReason: 'presign_failed',
      });
      await this.files.update(created.file.id, { status: FileObjectStatus.REJECTED });
      throw error;
    }
  }

  async completePresignedUpload(dto: CompletePresignedUploadDto): Promise<Record<string, unknown>> {
    const session = await this.uploadSessions.findOne({ where: { id: dto.uploadSessionId } });
    if (!session) {
      throw new AppException('UPLOAD_SESSION_NOT_FOUND', 'The upload session was not found.', 404);
    }
    const file = await this.files.findOne({ where: { id: session.fileObjectId } });
    if (!file) {
      throw new AppException('UPLOAD_SESSION_CORRUPT', 'The upload session is invalid.', 409);
    }
    if (session.status === FileUploadStatus.COMPLETED) {
      return { alreadyCompleted: true, file: await this.mapFile(file) };
    }
    if (session.expiresAt <= new Date()) {
      await this.expirePresignedUpload(session, file);
      throw new AppException('PRESIGNED_URL_EXPIRED', 'The upload session has expired.', 410);
    }
    if (![FileUploadStatus.PENDING, FileUploadStatus.UPLOADING].includes(session.status)) {
      throw new AppException(
        'UPLOAD_SESSION_NOT_COMPLETABLE',
        'The upload session cannot be completed.',
        409,
      );
    }

    const metadata = this.readMetadata(file);
    // HeadObject revalidates size, content type, and checksum before metadata becomes available.
    const head = await this.storage.headObject(file.accessType, file.objectKey);
    const expectedSha256 = metadata.expectedSha256;
    if (
      head.contentLength !== Number(file.expectedSizeBytes) ||
      head.contentType?.toLowerCase() !== file.contentType.toLowerCase() ||
      !expectedSha256 ||
      head.metadata.sha256?.toLowerCase() !== expectedSha256.toLowerCase()
    ) {
      const failed = await this.failPresignedUpload(
        session.id,
        file.id,
        file.accessType,
        file.objectKey,
        'verification_mismatch',
      );
      if (!failed) {
        return {
          alreadyCompleted: true,
          file: await this.mapFile(await this.getFileEntity(file.id)),
        };
      }
      throw new AppException(
        'UPLOAD_COMPLETION_MISMATCH',
        'The uploaded object does not match the reserved metadata.',
        409,
      );
    }

    const scan = await this.scanner.scan({
      bucket: head.bucket,
      objectKey: head.key,
      contentType: file.contentType,
      sha256: expectedSha256,
    });
    if (!scan.clean) {
      const failed = await this.failPresignedUpload(
        session.id,
        file.id,
        file.accessType,
        file.objectKey,
        'malware_detected',
      );
      if (!failed) {
        return {
          alreadyCompleted: true,
          file: await this.mapFile(await this.getFileEntity(file.id)),
        };
      }
      throw new AppException(
        'MALWARE_DETECTED',
        'The uploaded file failed security scanning.',
        422,
      );
    }

    const replacementState: { oldFile: FileObjectEntity | null } = { oldFile: null };
    let alreadyCompletedInsideTransaction = false;
    try {
      await this.dataSource.transaction(async (manager: EntityManager) => {
        const runner = manager.queryRunner!;
        const lockedSession = await manager.findOne(FileUploadSessionEntity, {
          where: { id: session.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!lockedSession) {
          throw new AppException(
            'UPLOAD_SESSION_NOT_FOUND',
            'The upload session was not found.',
            404,
          );
        }
        if (lockedSession.status === FileUploadStatus.COMPLETED) {
          alreadyCompletedInsideTransaction = true;
          return;
        }
        if (lockedSession.expiresAt <= new Date()) {
          throw new AppException('PRESIGNED_URL_EXPIRED', 'The upload session has expired.', 410);
        }
        if (
          ![FileUploadStatus.PENDING, FileUploadStatus.UPLOADING].includes(lockedSession.status)
        ) {
          throw new AppException(
            'UPLOAD_SESSION_NOT_COMPLETABLE',
            'The upload session cannot be completed.',
            409,
          );
        }
        await this.resourceMapper.assertResourceExists(
          runner,
          metadata.resourceType,
          metadata.resourceId,
        );
        if (metadata.replaceExisting && metadata.expectedOldFileId) {
          replacementState.oldFile = await manager.findOne(FileObjectEntity, {
            where: { id: metadata.expectedOldFileId, isDeleted: false },
          });
          if (!replacementState.oldFile) {
            throw new AppException(
              'FILE_ALREADY_REPLACED',
              'The original file is no longer available for replacement.',
              409,
            );
          }
          await this.resourceMapper.replaceAssociation(
            runner,
            metadata.resourceType,
            metadata.resourceId,
            metadata.expectedOldFileId,
            file.id,
            metadata.associationMetadata,
            this.actorId(),
          );
          await this.markDeleted(manager, replacementState.oldFile, this.actorId());
          await this.markSourceVariantsDeleted(
            manager,
            replacementState.oldFile.id,
            this.actorId(),
          );
        } else {
          const definition = this.resourceMapper.definition(metadata.resourceType);
          if (definition.associationKind === 'direct') {
            const currentFileId = await this.resourceMapper.currentFileId(
              runner,
              metadata.resourceType,
              metadata.resourceId,
            );
            if (currentFileId) {
              throw new AppException(
                'FILE_ASSOCIATION_EXISTS',
                'The resource already has a file association.',
                409,
              );
            }
          }
          await this.resourceMapper.associate(runner, this.associationInput(file.id, metadata));
        }

        const publicUrl =
          file.accessType === FileVisibility.PUBLIC
            ? this.storage.getPublicUrl(file.objectKey)
            : null;
        await manager.update(FileObjectEntity, file.id, {
          sizeBytes: String(head.contentLength),
          sha256: expectedSha256,
          etag: head.etag,
          storageVersionId: head.versionId,
          status: FileObjectStatus.AVAILABLE,
          malwareScanStatus: MalwareScanStatus.CLEAN,
          publicUrl,
          availableAt: new Date(),
          metadataJson: { ...metadata, scan },
          updatedBy: this.actorId(),
        });
        await manager.update(FileUploadSessionEntity, session.id, {
          status: FileUploadStatus.COMPLETED,
          completedAt: new Date(),
          updatedBy: this.actorId(),
        });
        await this.insertScanEvent(runner, file.id, scan);
      });
    } catch (error) {
      if (error instanceof AppException && error.code === 'PRESIGNED_URL_EXPIRED') {
        await this.expirePresignedUpload(session, file);
        throw error;
      }
      await this.compensateDelete([{ visibility: file.accessType, key: file.objectKey }]);
      await this.uploadSessions.update(session.id, {
        status: FileUploadStatus.FAILED,
        failureReason: 'database_finalization_failed',
      });
      await this.files.update(file.id, { status: FileObjectStatus.REJECTED });
      throw error;
    }

    if (alreadyCompletedInsideTransaction) {
      return {
        alreadyCompleted: true,
        file: await this.mapFile(await this.getFileEntity(file.id)),
      };
    }

    if (replacementState.oldFile) {
      await this.deleteStorageAfterReplacement(replacementState.oldFile);
    }
    const completed = await this.getFileEntity(file.id);
    return { alreadyCompleted: false, file: await this.mapFile(completed) };
  }

  async getFile(id: string): Promise<Record<string, unknown>> {
    return this.mapFile(await this.getFileEntity(id));
  }

  async getDownloadUrl(id: string): Promise<Record<string, unknown>> {
    const file = await this.getFileEntity(id);
    if (file.accessType !== FileVisibility.PRIVATE) {
      throw new AppException(
        'PRIVATE_FILE_REQUIRED',
        'A presigned download URL is only created for private files.',
        409,
      );
    }
    if (
      file.status !== FileObjectStatus.AVAILABLE ||
      file.malwareScanStatus !== MalwareScanStatus.CLEAN
    ) {
      throw new AppException('FILE_NOT_AVAILABLE', 'The file is not available for download.', 409);
    }
    const expirySeconds = this.config.getOrThrow<number>('aws.presignedDownloadExpirySeconds');
    // Signed URLs are generated only for clean private files and are never persisted or logged.
    const signed = await this.storage.createPresignedDownload(
      file.accessType,
      file.objectKey,
      expirySeconds,
      file.originalFilename,
    );
    const context = this.contextService.getRequired();
    await this.accessEvents.save(
      this.accessEvents.create({
        fileObjectId: file.id,
        actorUserId: context.userId ?? context.actorId,
        action: 'signed_url',
        decision: 'allowed',
        purpose: 'download',
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        signedUrlExpiresAt: signed.expiresAt,
        metadataJson: {},
      }),
    );
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }

  async deleteFile(id: string): Promise<Record<string, unknown>> {
    const file = await this.files.findOne({ where: { id } });
    if (!file) {
      throw new AppException('FILE_NOT_FOUND', 'The requested file was not found.', 404);
    }
    const metadata = this.readMetadata(file);
    const activeVariantLink = await this.variants.findOne({
      where: { variantFileId: file.id, isDeleted: false },
    });
    // Database association/soft-delete happens first; S3 cleanup is a separate, retryable step.
    if (!file.isDeleted) {
      await this.dataSource.transaction(async (manager: EntityManager) => {
        if (activeVariantLink) {
          await manager.update(FileVariantEntity, activeVariantLink.id, {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: this.actorId(),
            updatedBy: this.actorId(),
          });
        } else {
          const runner = manager.queryRunner!;
          await this.resourceMapper.clearAssociation(
            runner,
            metadata.resourceType,
            file.id,
            this.actorId(),
          );
        }
        await this.markDeleted(manager, file, this.actorId());
        if (!activeVariantLink) {
          const linkedVariants = await manager.find(FileVariantEntity, {
            where: { sourceFileId: file.id, isDeleted: false },
          });
          for (const link of linkedVariants) {
            const variant = await manager.findOne(FileObjectEntity, {
              where: { id: link.variantFileId },
            });
            if (variant) await this.markDeleted(manager, variant, this.actorId());
            await manager.update(FileVariantEntity, link.id, {
              isDeleted: true,
              deletedAt: new Date(),
              deletedBy: this.actorId(),
              updatedBy: this.actorId(),
            });
          }
        }
      });
    }

    const variantFiles = await this.variantFileEntities(file.id, true);
    try {
      await this.storage.delete(file.accessType, file.objectKey);
      for (const variant of variantFiles) {
        await this.storage.delete(variant.accessType, variant.objectKey);
      }
    } catch {
      throw new AppException(
        'FILE_DELETE_PARTIAL_FAILURE',
        'The database reference was removed, but storage cleanup must be retried.',
        503,
        { fileId: file.id, retryable: true },
      );
    }
    return {
      id: file.id,
      deleted: true,
      alreadyDeleted: file.isDeleted,
      variant: Boolean(activeVariantLink),
    };
  }

  async replaceFile(id: string, upload: Express.Multer.File): Promise<Record<string, unknown>> {
    const oldFile = await this.getFileEntity(id);
    const activeVariantLink = await this.variants.findOne({
      where: { variantFileId: oldFile.id, isDeleted: false },
    });
    if (activeVariantLink) {
      throw new AppException(
        'FILE_VARIANT_REPLACE_NOT_ALLOWED',
        'Replace the source file instead of replacing a generated variant directly.',
        409,
      );
    }
    const metadata = this.readMetadata(oldFile);
    const dto: FileAssociationDto = {
      resourceType: metadata.resourceType,
      resourceId: metadata.resourceId,
      fileCategory: metadata.fileCategory,
      visibility: oldFile.accessType,
      replaceExisting: true,
      metadata: metadata.associationMetadata,
    };
    // The new object is committed before the old object is deleted; cleanup cannot undo a valid swap.
    return this.performServerUpload(upload, dto, oldFile);
  }

  async bulkDelete(dto: BulkDeleteFilesDto): Promise<Record<string, unknown>> {
    const results: Array<Record<string, unknown>> = [];
    for (const id of [...new Set(dto.fileIds)]) {
      try {
        results.push({ id, success: true, result: await this.deleteFile(id) });
      } catch (error) {
        const appError = error instanceof AppException ? error : null;
        results.push({
          id,
          success: false,
          error: {
            code: appError?.code ?? 'FILE_DELETE_FAILED',
            message: appError?.message ?? 'The file could not be deleted.',
          },
        });
      }
    }
    return {
      results,
      succeeded: results.filter((result) => result.success === true).length,
      failed: results.filter((result) => result.success === false).length,
    };
  }

  private async performServerUpload(
    upload: Express.Multer.File,
    dto: FileAssociationDto,
    explicitOldFile: FileObjectEntity | null = null,
  ): Promise<Record<string, unknown>> {
    // Validate resource policy, file bytes, and malware status before creating any S3 object.
    this.resourceMapper.validate({
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      visibility: dto.visibility,
      category: dto.fileCategory,
      metadata: dto.metadata,
    });
    const validated = await this.validator.validateBuffer(upload, dto.fileCategory);
    const definition = this.resourceMapper.definition(dto.resourceType);
    let preflightFileId: string | null = null;
    await this.withRunner(async (runner) => {
      await this.resourceMapper.assertResourceExists(runner, dto.resourceType, dto.resourceId);
      preflightFileId = await this.resourceMapper.currentFileId(
        runner,
        dto.resourceType,
        dto.resourceId,
      );
    });
    if (!explicitOldFile && definition.associationKind === 'link' && dto.replaceExisting) {
      throw new AppException(
        'REPLACE_REQUIRES_FILE_ENDPOINT',
        'Replace a linked file through PUT /files/:id/replace.',
        409,
      );
    }
    if (
      !explicitOldFile &&
      definition.associationKind === 'direct' &&
      preflightFileId &&
      !dto.replaceExisting
    ) {
      throw new AppException(
        'FILE_ASSOCIATION_EXISTS',
        'The resource already has a file. Set replaceExisting or use the replace endpoint.',
        409,
      );
    }
    const sha256 = sha256Hex(upload.buffer);
    const scan = await this.scanner.scan({
      buffer: upload.buffer,
      contentType: validated.contentType,
      sha256,
    });
    if (!scan.clean) {
      throw new AppException(
        'MALWARE_DETECTED',
        'The uploaded file failed security scanning.',
        422,
      );
    }
    const objectKey = this.keyService.generate({
      visibility: dto.visibility,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      filename: validated.sanitizedFilename,
    });
    const generatedVariants =
      dto.visibility === FileVisibility.PUBLIC
        ? await this.imageProcessing.createVariants(upload.buffer, validated.contentType)
        : [];
    const uploadedObjects: UploadedObjectState[] = [];
    let databaseCommitted = false;

    // S3 cannot participate in the database transaction; compensate uploaded objects on failure.
    try {
      const sourceUpload = await this.storage.upload({
        visibility: dto.visibility,
        key: objectKey,
        body: upload.buffer,
        contentType: validated.contentType,
        contentLength: upload.size,
        metadata: { sha256 },
      });
      uploadedObjects.push({ visibility: dto.visibility, key: objectKey });

      const variantUploads: Array<{
        variant: ImageVariantResult;
        key: string;
        hash: string;
        result: UploadObjectResult;
      }> = [];
      for (const variant of generatedVariants) {
        const key = this.keyService.variant(objectKey, variant.name, variant.extension);
        const variantHash = sha256Hex(variant.buffer);
        const result = await this.storage.upload({
          visibility: dto.visibility,
          key,
          body: variant.buffer,
          contentType: variant.contentType,
          contentLength: variant.buffer.length,
          metadata: { sha256: variantHash, source_sha256: sha256 },
        });
        uploadedObjects.push({ visibility: dto.visibility, key });
        variantUploads.push({ variant, key, hash: variantHash, result });
      }

      let oldFile = explicitOldFile;
      const saved = await this.dataSource.transaction(async (manager: EntityManager) => {
        const runner = manager.queryRunner!;
        if (!oldFile && dto.replaceExisting) {
          const existingId = await this.resourceMapper.currentFileId(
            runner,
            dto.resourceType,
            dto.resourceId,
          );
          if (existingId) {
            oldFile = await manager.findOne(FileObjectEntity, {
              where: { id: existingId, isDeleted: false },
            });
          }
        }
        if (!oldFile && definition.associationKind === 'direct') {
          const currentFileId = await this.resourceMapper.currentFileId(
            runner,
            dto.resourceType,
            dto.resourceId,
          );
          if (currentFileId) {
            throw new AppException(
              'FILE_ASSOCIATION_EXISTS',
              'The resource already has a file association.',
              409,
            );
          }
        }

        const metadataJson: FileMetadataJson = {
          resourceType: dto.resourceType,
          fileCategory: dto.fileCategory,
          resourceId: dto.resourceId,
          associationMetadata: dto.metadata,
          replaceExisting: dto.replaceExisting,
          visibility: dto.visibility,
          expectedOldFileId: oldFile?.id,
          scan,
        };
        const sourceEntity = await manager.save(
          manager.create(FileObjectEntity, {
            storageProvider: 's3',
            bucket: sourceUpload.bucket,
            objectKey,
            ownerType: this.resourceMapper.definition(dto.resourceType).ownerType,
            ownerId: dto.resourceId,
            uploadedByUserId: this.userId(),
            originalFilename: validated.sanitizedFilename,
            contentType: validated.contentType,
            expectedSizeBytes: String(upload.size),
            sizeBytes: String(upload.size),
            sha256,
            etag: sourceUpload.etag,
            storageVersionId: sourceUpload.versionId,
            encryptionKeyRef: this.config.get<string>('aws.kmsKeyId') ?? null,
            classification: this.classification(dto.visibility, dto.fileCategory),
            accessType: dto.visibility,
            status: FileObjectStatus.AVAILABLE,
            malwareScanStatus: MalwareScanStatus.CLEAN,
            publicUrl:
              dto.visibility === FileVisibility.PUBLIC
                ? this.storage.getPublicUrl(objectKey)
                : null,
            availableAt: new Date(),
            retentionUntil: null,
            metadataJson,
            createdBy: this.actorId(),
            updatedBy: this.actorId(),
          }),
        );

        if (oldFile) {
          await this.resourceMapper.replaceAssociation(
            runner,
            dto.resourceType,
            dto.resourceId,
            oldFile.id,
            sourceEntity.id,
            dto.metadata,
            this.actorId(),
          );
          await this.markDeleted(manager, oldFile, this.actorId());
          await this.markSourceVariantsDeleted(manager, oldFile.id, this.actorId());
        } else {
          await this.resourceMapper.associate(
            runner,
            this.associationInput(sourceEntity.id, metadataJson),
          );
        }
        await this.insertScanEvent(runner, sourceEntity.id, scan);

        for (const item of variantUploads) {
          const variantEntity = await manager.save(
            manager.create(FileObjectEntity, {
              storageProvider: 's3',
              bucket: item.result.bucket,
              objectKey: item.key,
              ownerType: this.resourceMapper.definition(dto.resourceType).ownerType,
              ownerId: dto.resourceId,
              uploadedByUserId: this.userId(),
              originalFilename: `${validated.sanitizedFilename}-${item.variant.name}.webp`,
              contentType: item.variant.contentType,
              expectedSizeBytes: String(item.variant.buffer.length),
              sizeBytes: String(item.variant.buffer.length),
              sha256: item.hash,
              etag: item.result.etag,
              storageVersionId: item.result.versionId,
              encryptionKeyRef: this.config.get<string>('aws.kmsKeyId') ?? null,
              classification: 'public',
              accessType: FileVisibility.PUBLIC,
              status: FileObjectStatus.AVAILABLE,
              malwareScanStatus: MalwareScanStatus.CLEAN,
              publicUrl: this.storage.getPublicUrl(item.key),
              availableAt: new Date(),
              retentionUntil: null,
              metadataJson: { ...metadataJson, variantName: item.variant.name },
              createdBy: this.actorId(),
              updatedBy: this.actorId(),
            }),
          );
          await manager.save(
            manager.create(FileVariantEntity, {
              sourceFileId: sourceEntity.id,
              variantFileId: variantEntity.id,
              variantName: item.variant.name,
              transformation: item.variant.transformation,
              createdBy: this.actorId(),
              updatedBy: this.actorId(),
            }),
          );
        }
        return sourceEntity;
      });

      databaseCommitted = true;
      // Old-object cleanup is intentionally after commit; a cleanup failure must not roll back the replacement.
      if (oldFile) await this.deleteStorageAfterReplacement(oldFile);
      return this.mapFile(await this.getFileEntity(saved.id));
    } catch (error) {
      if (!databaseCommitted) {
        await this.compensateDelete(uploadedObjects);
      } else {
        this.logger.error({
          message: 'Post-commit upload response failed; active object was not compensated',
          errorCode: 'POST_COMMIT_RESPONSE_FAILED',
          exceptionType: error instanceof Error ? error.constructor.name : typeof error,
        });
      }
      throw error;
    }
  }

  private async buildPresignedResponse(
    session: FileUploadSessionEntity,
    file: FileObjectEntity,
  ): Promise<Record<string, unknown>> {
    const metadata = this.readMetadata(file);
    const signed = await this.storage.createPresignedUpload({
      visibility: file.accessType,
      key: file.objectKey,
      contentType: file.contentType,
      contentLength: Number(file.expectedSizeBytes),
      sha256: metadata.expectedSha256!,
      expiresInSeconds: Math.max(1, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)),
    });
    return {
      uploadSessionId: session.id,
      fileId: file.id,
      method: signed.method,
      uploadUrl: signed.url,
      requiredHeaders: signed.headers,
      expiresAt: signed.expiresAt.toISOString(),
      objectKey: file.objectKey,
      visibility: file.accessType,
      completionEndpoint: `/${this.config.get<string>('app.apiPrefix')}/${this.config.get<string>('app.apiVersion')}/files/presigned-upload/complete`,
    };
  }

  private associationInput(fileId: string, metadata: FileMetadataJson): ResourceAssociationInput {
    return {
      resourceType: metadata.resourceType,
      resourceId: metadata.resourceId,
      fileId,
      visibility: metadata.visibility,
      category: metadata.fileCategory,
      metadata: metadata.associationMetadata,
      actorId: this.actorId(),
    };
  }

  private async getFileEntity(id: string): Promise<FileObjectEntity> {
    const file = await this.files.findOne({ where: { id, isDeleted: false } });
    if (!file) {
      throw new AppException('FILE_NOT_FOUND', 'The requested file was not found.', 404);
    }
    return file;
  }

  private async mapFile(file: FileObjectEntity): Promise<Record<string, unknown>> {
    const metadata = this.readMetadata(file);
    const variantRows = (await this.dataSource.query(
      `SELECT fv.variant_name, fo.id, fo.public_url FROM platform.file_variants fv JOIN platform.file_objects fo ON fo.id = fv.variant_file_id WHERE fv.source_file_id = $1 AND fv.is_deleted = false AND fo.is_deleted = false ORDER BY fv.variant_name`,
      [file.id],
    )) as Array<{ variant_name: string; id: string; public_url: string | null }>;
    return {
      id: file.id,
      resourceType: metadata.resourceType,
      resourceId: metadata.resourceId,
      fileCategory: metadata.fileCategory,
      visibility: file.accessType,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes ? Number(file.sizeBytes) : null,
      originalFilename: file.originalFilename,
      objectKey: file.accessType === FileVisibility.PRIVATE ? file.objectKey : undefined,
      publicUrl: file.accessType === FileVisibility.PUBLIC ? file.publicUrl : null,
      status: file.status,
      malwareScanStatus: file.malwareScanStatus,
      sha256: file.sha256,
      variants: variantRows.map((row) => ({
        name: row.variant_name,
        fileId: row.id,
        publicUrl: row.public_url,
      })),
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
    };
  }

  private readMetadata(file: FileObjectEntity): FileMetadataJson {
    const value = file.metadataJson;
    if (!value || Array.isArray(value)) {
      throw new AppException('FILE_METADATA_INVALID', 'The file metadata is invalid.', 409);
    }
    const metadata = value as Partial<FileMetadataJson>;
    if (!metadata.resourceType || !metadata.fileCategory || !metadata.resourceId) {
      throw new AppException('FILE_METADATA_INVALID', 'The file metadata is invalid.', 409);
    }
    return {
      resourceType: metadata.resourceType,
      fileCategory: metadata.fileCategory,
      resourceId: metadata.resourceId,
      associationMetadata: metadata.associationMetadata ?? {},
      replaceExisting: metadata.replaceExisting ?? false,
      visibility: metadata.visibility ?? file.accessType,
      expectedOldFileId: metadata.expectedOldFileId,
      expectedSha256: metadata.expectedSha256,
      idempotencyFingerprint: metadata.idempotencyFingerprint,
      scan: metadata.scan,
    };
  }

  private async markDeleted(
    manager: EntityManager,
    file: FileObjectEntity,
    actorId: string | null,
  ): Promise<void> {
    await manager.update(FileObjectEntity, file.id, {
      status: FileObjectStatus.DELETED,
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: actorId,
      updatedBy: actorId,
    });
  }

  private async deleteStorageAfterReplacement(file: FileObjectEntity): Promise<void> {
    try {
      await this.storage.delete(file.accessType, file.objectKey);
      const variants = await this.variantFileEntities(file.id, true);
      for (const variant of variants) {
        await this.storage.delete(variant.accessType, variant.objectKey);
      }
    } catch (error) {
      // The replacement is already valid; log cleanup failure for reconciliation instead of undoing it.
      this.logger.warn({
        message: 'Old object cleanup failed after successful replacement',
        fileId: file.id,
        errorCode: 'REPLACED_FILE_CLEANUP_FAILED',
        exceptionType: error instanceof Error ? error.constructor.name : typeof error,
      });
    }
  }

  private async variantFileEntities(
    sourceFileId: string,
    includeDeleted: boolean,
  ): Promise<FileObjectEntity[]> {
    const rows = (await this.dataSource.query(
      `SELECT fv.variant_file_id FROM platform.file_variants fv JOIN platform.file_objects fo ON fo.id = fv.variant_file_id WHERE fv.source_file_id = $1${includeDeleted ? '' : ' AND fv.is_deleted = false AND fo.is_deleted = false'}`,
      [sourceFileId],
    )) as Array<{ variant_file_id: string }>;
    const ids = rows.map((row) => row.variant_file_id);
    return ids.length ? this.files.find({ where: { id: In(ids) } }) : [];
  }

  private async markSourceVariantsDeleted(
    manager: EntityManager,
    sourceFileId: string,
    actorId: string | null,
  ): Promise<void> {
    const links = await manager.find(FileVariantEntity, {
      where: { sourceFileId, isDeleted: false },
    });
    for (const link of links) {
      const variant = await manager.findOne(FileObjectEntity, {
        where: { id: link.variantFileId },
      });
      if (variant) await this.markDeleted(manager, variant, actorId);
      await manager.update(FileVariantEntity, link.id, {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: actorId,
        updatedBy: actorId,
      });
    }
  }

  private async failPresignedUpload(
    sessionId: string,
    fileId: string,
    visibility: FileVisibility,
    key: string,
    reason: string,
  ): Promise<boolean> {
    let shouldDelete = false;
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const lockedSession = await manager.findOne(FileUploadSessionEntity, {
        where: { id: sessionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedSession || lockedSession.status === FileUploadStatus.COMPLETED) {
        return;
      }
      await manager.update(FileUploadSessionEntity, sessionId, {
        status: FileUploadStatus.FAILED,
        failureReason: reason,
        updatedBy: this.actorId(),
      });
      await manager.update(FileObjectEntity, fileId, {
        status: FileObjectStatus.REJECTED,
        malwareScanStatus:
          reason === 'malware_detected' ? MalwareScanStatus.INFECTED : MalwareScanStatus.FAILED,
        updatedBy: this.actorId(),
      });
      shouldDelete = true;
    });
    if (!shouldDelete) return false;
    // Locking makes completion idempotent under concurrent retries; only the winner deletes the object.
    try {
      await this.storage.delete(visibility, key);
    } catch (error) {
      this.logger.warn({
        message: 'Presigned upload compensation failed',
        fileId,
        errorCode: 'COMPENSATION_FAILED',
        exceptionType: error instanceof Error ? error.constructor.name : typeof error,
      });
    }
    return true;
  }

  private async expirePresignedUpload(
    session: FileUploadSessionEntity,
    file: FileObjectEntity,
  ): Promise<void> {
    let shouldDelete = false;
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const lockedSession = await manager.findOne(FileUploadSessionEntity, {
        where: { id: session.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !lockedSession ||
        lockedSession.status === FileUploadStatus.COMPLETED ||
        lockedSession.expiresAt > new Date()
      ) {
        return;
      }
      await manager.update(FileUploadSessionEntity, session.id, {
        status: FileUploadStatus.EXPIRED,
        failureReason: 'expired',
        updatedBy: this.actorId(),
      });
      await manager.update(FileObjectEntity, file.id, {
        status: FileObjectStatus.REJECTED,
        updatedBy: this.actorId(),
      });
      shouldDelete = true;
    });
    if (!shouldDelete) return;
    try {
      await this.storage.delete(file.accessType, file.objectKey);
    } catch (error) {
      this.logger.warn({
        message: 'Expired presigned object cleanup failed',
        fileId: file.id,
        errorCode: 'EXPIRED_UPLOAD_CLEANUP_FAILED',
        exceptionType: error instanceof Error ? error.constructor.name : typeof error,
      });
    }
  }

  private async compensateDelete(objects: UploadedObjectState[]): Promise<void> {
    // Compensation is best-effort because S3 and PostgreSQL cannot share one atomic transaction.
    for (const object of objects.reverse()) {
      try {
        await this.storage.delete(object.visibility, object.key);
      } catch (error) {
        this.logger.error({
          message: 'S3 compensation failed',
          objectKey: object.key,
          errorCode: 'UPLOAD_COMPENSATION_FAILED',
          exceptionType: error instanceof Error ? error.constructor.name : typeof error,
        });
      }
    }
  }

  private async insertScanEvent(
    runner: QueryRunner,
    fileId: string,
    scan: { scanner: string; status: string; findings: Record<string, unknown> },
  ): Promise<void> {
    await runner.query(
      `INSERT INTO platform.file_scan_events (file_object_id, scanner, status, findings) VALUES ($1,$2,$3,$4::jsonb)`,
      [fileId, scan.scanner, scan.status, JSON.stringify(scan.findings)],
    );
  }

  private async withRunner<T>(callback: (runner: QueryRunner) => Promise<T>): Promise<T> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    try {
      return await callback(runner);
    } finally {
      await runner.release();
    }
  }

  private actorId(): string | null {
    const context = this.contextService.get();
    return context?.actorId ?? context?.userId ?? null;
  }

  private userId(): string | null {
    const context = this.contextService.get();
    return context?.userId ?? context?.actorId ?? null;
  }

  private classification(visibility: FileVisibility, category: FileCategory): string {
    if (visibility === FileVisibility.PUBLIC) return 'public';
    if (
      [
        FileCategory.PRESCRIPTION,
        FileCategory.MEDICAL_REPORT,
        FileCategory.LABORATORY_REPORT,
      ].includes(category)
    ) {
      return 'sensitive';
    }
    return 'internal';
  }

  private presignedRequestFingerprint(
    dto: CreatePresignedUploadDto,
    validated: { sanitizedFilename: string; contentType: string },
  ): string {
    const associationMetadata = Object.fromEntries(
      Object.entries(dto.metadata).sort(([left], [right]) => left.localeCompare(right)),
    );
    return sha256Hex(
      Buffer.from(
        JSON.stringify({
          resourceType: dto.resourceType,
          resourceId: dto.resourceId,
          fileCategory: dto.fileCategory,
          visibility: dto.visibility,
          replaceExisting: dto.replaceExisting,
          filename: validated.sanitizedFilename,
          contentType: validated.contentType,
          sizeBytes: dto.sizeBytes,
          sha256: dto.sha256.toLowerCase(),
          associationMetadata,
        }),
      ),
    );
  }

  private assertIdempotencyFingerprint(file: FileObjectEntity, expected: string): void {
    const metadata = this.readMetadata(file);
    if (metadata.idempotencyFingerprint !== expected) {
      throw new AppException(
        'IDEMPOTENCY_KEY_CONFLICT',
        'The idempotency key was already used for a different upload request.',
        409,
      );
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: unknown } | undefined;
    return driverError?.code === '23505';
  }
}
