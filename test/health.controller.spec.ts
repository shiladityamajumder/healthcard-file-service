import type { DataSource } from 'typeorm';
import { HealthController } from '../src/modules/health/health.controller';
import type { S3StorageService } from '../src/modules/storage/providers/s3-storage.service';

describe('HealthController', () => {
  it('returns liveness without dependency access', () => {
    const controller = new HealthController({} as DataSource, {} as S3StorageService);
    expect(controller.liveness()).toEqual({ status: 'alive' });
  });

  it('returns readiness when database and buckets are healthy', async () => {
    // Mock S3 so this test isolates the read-only PostgreSQL probe and dependency aggregation.
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
    expect(database.query).toHaveBeenCalledTimes(1);
    expect(database.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('normalizes database connection failures and still checks S3 independently', async () => {
    // Include a credential-bearing failure internally to prove it never crosses the readiness boundary.
    const connectionUrl =
      'postgresql://sensitive-user:sensitive-password@database.internal/healthcare';
    const database = {
      query: jest.fn().mockRejectedValue(new Error(`connection failed for ${connectionUrl}`)),
    } as unknown as DataSource;
    const storage = {
      checkConnectivity: jest.fn().mockResolvedValue({ publicBucket: true, privateBucket: true }),
    } as unknown as S3StorageService;
    const controller = new HealthController(database, storage);
    const readiness = controller.readiness();
    await expect(readiness).rejects.toMatchObject({
      code: 'SERVICE_NOT_READY',
      message: 'One or more required dependencies are unavailable.',
      details: {
        ready: false,
        checks: { postgresql: false, publicBucket: true, privateBucket: true },
      },
    });
    await expect(readiness).rejects.not.toMatchObject({
      message: expect.stringContaining(connectionUrl),
    });
    expect(storage.checkConnectivity).toHaveBeenCalledTimes(1);
  });
});
