import type { Readable } from 'node:stream';
import type { FileVisibility } from '../../../common/enums/file.enums';

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface UploadObjectInput {
  visibility: FileVisibility;
  key: string;
  body: Buffer | Readable;
  contentType: string;
  contentLength: number;
  metadata?: Record<string, string>;
  cacheControl?: string;
}

export interface UploadObjectResult {
  bucket: string;
  key: string;
  etag: string | null;
  versionId: string | null;
}

export interface PresignedUploadInput {
  visibility: FileVisibility;
  key: string;
  contentType: string;
  contentLength: number;
  sha256: string;
  expiresInSeconds: number;
}

export interface PresignedUploadResult {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: Date;
  bucket: string;
  key: string;
}

export interface HeadObjectResult {
  bucket: string;
  key: string;
  contentLength: number;
  contentType: string | null;
  etag: string | null;
  versionId: string | null;
  metadata: Record<string, string>;
}

export interface StorageService {
  upload(input: UploadObjectInput): Promise<UploadObjectResult>;
  createPresignedUpload(input: PresignedUploadInput): Promise<PresignedUploadResult>;
  createPresignedDownload(
    visibility: FileVisibility,
    key: string,
    expiresInSeconds: number,
    responseFilename?: string,
  ): Promise<{ url: string; expiresAt: Date }>;
  headObject(visibility: FileVisibility, key: string): Promise<HeadObjectResult>;
  delete(visibility: FileVisibility, key: string): Promise<void>;
  deleteMany(visibility: FileVisibility, keys: string[]): Promise<{ deleted: string[]; failed: string[] }>;
  copy(
    sourceVisibility: FileVisibility,
    sourceKey: string,
    destinationVisibility: FileVisibility,
    destinationKey: string,
  ): Promise<void>;
  move(
    sourceVisibility: FileVisibility,
    sourceKey: string,
    destinationVisibility: FileVisibility,
    destinationKey: string,
  ): Promise<void>;
  getPublicUrl(key: string): string;
  getBucket(visibility: FileVisibility): string;
  checkConnectivity(): Promise<{ publicBucket: boolean; privateBucket: boolean }>;
}
