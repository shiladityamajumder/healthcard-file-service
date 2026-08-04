import type { DataSource } from 'typeorm';
import { HealthController } from '../src/modules/health/health.controller';
import type { S3StorageService } from '../src/modules/storage/providers/s3-storage.service';

describe('HealthController', () => {
  it('returns liveness without dependency access', () => {
    const controller = new HealthController({} as DataSource, {} as S3StorageService);
    expect(controller.liveness()).toEqual({ status: 'alive' });
  });

  it('returns readiness when database and buckets are healthy', async () => {
    const database = {
      query: jest.fn().mockResolvedValue([{ value: 1 }]),
    } as unknown as DataSource;
    const storage = {
      checkConnectivity: jest.fn().mockResolvedValue({ publicBucket: true, privateBucket: true }),
    } as unknown as S3StorageService;
    const controller = new HealthController(database, storage);
    await expect(controller.readiness()).resolves.toEqual({
      ready: true,
      checks: { postgresql: true, publicBucket: true, privateBucket: true },
    });
  });


  it('returns the auth-service-compatible readiness error code', async () => {
    const database = {
      query: jest.fn().mockRejectedValue(new Error('database unavailable')),
    } as unknown as DataSource;
    const storage = {
      checkConnectivity: jest.fn().mockResolvedValue({ publicBucket: false, privateBucket: false }),
    } as unknown as S3StorageService;
    const controller = new HealthController(database, storage);
    await expect(controller.readiness()).rejects.toMatchObject({ code: 'SERVICE_NOT_READY' });
  });
});
