import type { ConfigService } from '@nestjs/config';
import { S3StorageService } from '../src/modules/storage/providers/s3-storage.service';

function config(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    'aws.region': 'ap-south-1',
    'aws.publicBucket': 'public-files',
    'aws.privateBucket': 'private-files',
    'aws.forcePathStyle': false,
    'aws.maxAttempts': 3,
    'aws.connectionTimeoutMs': 1000,
    'aws.requestTimeoutMs': 1000,
    ...overrides,
  };
  return {
    get: <T>(key: string): T | undefined => values[key] as T | undefined,
    getOrThrow: <T>(key: string): T => values[key] as T,
  } as unknown as ConfigService;
}

describe('S3StorageService public URL', () => {
  it('prefers CloudFront and encodes key segments', () => {
    // URL construction is tested without contacting S3; the client is deliberately left unconfigured.
    const service = new S3StorageService(
      config({ 'aws.cloudFrontPublicBaseUrl': 'https://cdn.example.com/' }),
    );
    expect(service.getPublicUrl('prod/public/a file.webp')).toBe(
      'https://cdn.example.com/prod/public/a%20file.webp',
    );
  });

  it('supports path-style local endpoints', () => {
    // MinIO and LocalStack commonly require path-style addressing for local development.
    const service = new S3StorageService(
      config({ 'aws.endpoint': 'http://minio:9000', 'aws.forcePathStyle': true }),
    );
    expect(service.getPublicUrl('public/x.webp')).toBe(
      'http://minio:9000/public-files/public/x.webp',
    );
  });
});
