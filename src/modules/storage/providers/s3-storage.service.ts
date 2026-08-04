import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type ServerSideEncryption,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { FileVisibility } from '../../../common/enums/file.enums';
import { AppException } from '../../../common/exceptions/app.exception';
import type {
  HeadObjectResult,
  PresignedUploadInput,
  PresignedUploadResult,
  StorageService,
  UploadObjectInput,
  UploadObjectResult,
} from '../interfaces/storage.interface';

@Injectable()
export class S3StorageService implements StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly client: S3Client;
  private readonly publicBucket: string;
  private readonly privateBucket: string;
  private readonly region: string;
  private readonly endpoint?: string;
  private readonly forcePathStyle: boolean;
  private readonly cloudFrontBaseUrl?: string;
  private readonly publicBaseUrl?: string;
  private readonly encryption?: ServerSideEncryption;
  private readonly kmsKeyId?: string;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.region = config.getOrThrow<string>('aws.region');
    this.publicBucket = config.getOrThrow<string>('aws.publicBucket');
    this.privateBucket = config.getOrThrow<string>('aws.privateBucket');
    this.endpoint = config.get<string>('aws.endpoint');
    this.forcePathStyle = config.get<boolean>('aws.forcePathStyle') ?? false;
    this.cloudFrontBaseUrl = config.get<string>('aws.cloudFrontPublicBaseUrl');
    this.publicBaseUrl = config.get<string>('aws.publicBaseUrl');
    this.encryption = (config.get<string>('aws.serverSideEncryption') || undefined) as
      | ServerSideEncryption
      | undefined;
    this.kmsKeyId = config.get<string>('aws.kmsKeyId');
    const accessKeyId = config.get<string>('aws.accessKeyId');
    const secretAccessKey = config.get<string>('aws.secretAccessKey');
    const sessionToken = config.get<string>('aws.sessionToken');

    this.client = new S3Client({
      region: this.region,
      endpoint: this.endpoint,
      forcePathStyle: this.forcePathStyle,
      maxAttempts: config.getOrThrow<number>('aws.maxAttempts'),
      requestHandler: new NodeHttpHandler({
        connectionTimeout: config.getOrThrow<number>('aws.connectionTimeoutMs'),
        requestTimeout: config.getOrThrow<number>('aws.requestTimeoutMs'),
      }),
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey, sessionToken: sessionToken || undefined }
          : undefined,
    });
  }

  async upload(input: UploadObjectInput): Promise<UploadObjectResult> {
    try {
      const bucket = this.getBucket(input.visibility);
      const result = await this.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          ContentLength: input.contentLength,
          Metadata: input.metadata,
          CacheControl:
            input.cacheControl ??
            (input.visibility === FileVisibility.PRIVATE
              ? 'private, no-store, max-age=0'
              : 'public, max-age=31536000, immutable'),
          ServerSideEncryption: this.encryption,
          SSEKMSKeyId: this.encryption === 'aws:kms' ? this.kmsKeyId : undefined,
        }),
      );
      return {
        bucket,
        key: input.key,
        etag: result.ETag?.replaceAll('"', '') ?? null,
        versionId: result.VersionId ?? null,
      };
    } catch (error) {
      throw this.storageError('FILE_UPLOAD_FAILED', 'The file could not be uploaded.', error);
    }
  }

  async createPresignedUpload(input: PresignedUploadInput): Promise<PresignedUploadResult> {
    const bucket = this.getBucket(input.visibility);
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);
    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.contentLength,
        Metadata: { sha256: input.sha256 },
        CacheControl:
          input.visibility === FileVisibility.PRIVATE
            ? 'private, no-store, max-age=0'
            : 'public, max-age=31536000, immutable',
        ServerSideEncryption: this.encryption,
        SSEKMSKeyId: this.encryption === 'aws:kms' ? this.kmsKeyId : undefined,
      });
      const url = await getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds });
      const cacheControl =
        input.visibility === FileVisibility.PRIVATE
          ? 'private, no-store, max-age=0'
          : 'public, max-age=31536000, immutable';
      const headers: Record<string, string> = {
        'content-type': input.contentType,
        'cache-control': cacheControl,
        'x-amz-meta-sha256': input.sha256,
      };
      if (this.encryption) {
        headers['x-amz-server-side-encryption'] = this.encryption;
      }
      if (this.encryption === 'aws:kms' && this.kmsKeyId) {
        headers['x-amz-server-side-encryption-aws-kms-key-id'] = this.kmsKeyId;
      }
      return { url, method: 'PUT', headers, expiresAt, bucket, key: input.key };
    } catch (error) {
      throw this.storageError(
        'PRESIGNED_UPLOAD_CREATION_FAILED',
        'The upload request could not be created.',
        error,
      );
    }
  }

  async createPresignedDownload(
    visibility: FileVisibility,
    key: string,
    expiresInSeconds: number,
    responseFilename?: string,
  ): Promise<{ url: string; expiresAt: Date }> {
    if (visibility !== FileVisibility.PRIVATE) {
      throw new AppException(
        'PRESIGNED_DOWNLOAD_NOT_REQUIRED',
        'Public files use their stable public URL.',
        409,
      );
    }
    try {
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
      const url = await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.privateBucket,
          Key: key,
          ResponseCacheControl: 'private, no-store, max-age=0',
          ResponseContentDisposition: responseFilename
            ? `attachment; filename="${this.safeDispositionFilename(responseFilename)}"`
            : undefined,
        }),
        { expiresIn: expiresInSeconds },
      );
      return { url, expiresAt };
    } catch (error) {
      throw this.storageError(
        'PRESIGNED_DOWNLOAD_CREATION_FAILED',
        'The download URL could not be created.',
        error,
      );
    }
  }

  async headObject(visibility: FileVisibility, key: string): Promise<HeadObjectResult> {
    try {
      const bucket = this.getBucket(visibility);
      const result = await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return {
        bucket,
        key,
        contentLength: Number(result.ContentLength ?? 0),
        contentType: result.ContentType ?? null,
        etag: result.ETag?.replaceAll('"', '') ?? null,
        versionId: result.VersionId ?? null,
        metadata: result.Metadata ?? {},
      };
    } catch (error) {
      const httpStatus =
        typeof error === 'object' && error !== null && '$metadata' in error
          ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
          : undefined;
      if (httpStatus === 404) {
        throw this.storageError(
          'S3_OBJECT_NOT_FOUND',
          'The storage object was not found.',
          error,
          404,
        );
      }
      throw this.storageError(
        'S3_HEAD_OBJECT_FAILED',
        'The storage object could not be verified.',
        error,
      );
    }
  }

  async delete(visibility: FileVisibility, key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.getBucket(visibility), Key: key }),
      );
    } catch (error) {
      throw this.storageError('FILE_DELETE_FAILED', 'The storage object could not be deleted.', error);
    }
  }

  async deleteMany(
    visibility: FileVisibility,
    keys: string[],
  ): Promise<{ deleted: string[]; failed: string[] }> {
    if (keys.length === 0) {
      return { deleted: [], failed: [] };
    }
    try {
      const result = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.getBucket(visibility),
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: false },
        }),
      );
      return {
        deleted: (result.Deleted ?? []).flatMap((item: { Key?: string }) =>
          item.Key ? [item.Key] : [],
        ),
        failed: (result.Errors ?? []).flatMap((item: { Key?: string }) =>
          item.Key ? [item.Key] : [],
        ),
      };
    } catch (error) {
      throw this.storageError(
        'BULK_FILE_DELETE_FAILED',
        'The storage objects could not be deleted.',
        error,
      );
    }
  }

  async copy(
    sourceVisibility: FileVisibility,
    sourceKey: string,
    destinationVisibility: FileVisibility,
    destinationKey: string,
  ): Promise<void> {
    try {
      const sourceBucket = this.getBucket(sourceVisibility);
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.getBucket(destinationVisibility),
          Key: destinationKey,
          CopySource: `${sourceBucket}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`,
          ServerSideEncryption: this.encryption,
          SSEKMSKeyId: this.encryption === 'aws:kms' ? this.kmsKeyId : undefined,
        }),
      );
    } catch (error) {
      throw this.storageError('FILE_COPY_FAILED', 'The storage object could not be copied.', error);
    }
  }

  async move(
    sourceVisibility: FileVisibility,
    sourceKey: string,
    destinationVisibility: FileVisibility,
    destinationKey: string,
  ): Promise<void> {
    await this.copy(sourceVisibility, sourceKey, destinationVisibility, destinationKey);
    await this.delete(sourceVisibility, sourceKey);
  }

  getPublicUrl(key: string): string {
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    const configured = this.cloudFrontBaseUrl || this.publicBaseUrl;
    if (configured) {
      return `${configured.replace(/\/$/, '')}/${encodedKey}`;
    }
    if (this.endpoint && this.forcePathStyle) {
      return `${this.endpoint.replace(/\/$/, '')}/${this.publicBucket}/${encodedKey}`;
    }
    return `https://${this.publicBucket}.s3.${this.region}.amazonaws.com/${encodedKey}`;
  }

  getBucket(visibility: FileVisibility): string {
    return visibility === FileVisibility.PUBLIC ? this.publicBucket : this.privateBucket;
  }

  async checkConnectivity(): Promise<{ publicBucket: boolean; privateBucket: boolean }> {
    const check = async (bucket: string): Promise<boolean> => {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
        return true;
      } catch {
        return false;
      }
    };
    const [publicBucket, privateBucket] = await Promise.all([
      check(this.publicBucket),
      this.publicBucket === this.privateBucket ? Promise.resolve(true) : check(this.privateBucket),
    ]);
    return { publicBucket, privateBucket };
  }

  private safeDispositionFilename(filename: string): string {
    return filename.replace(/["\\\r\n]/g, '_').slice(0, 180);
  }

  private storageError(
    code: string,
    message: string,
    error: unknown,
    statusCode = 503,
  ): AppException {
    this.logger.error({
      message,
      errorCode: code,
      exceptionType: error instanceof Error ? error.constructor.name : typeof error,
    });
    return new AppException(code, message, statusCode);
  }
}
