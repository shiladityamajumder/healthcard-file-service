import { ConfigService } from '@nestjs/config';
import { createTypeOrmOptions } from '../src/database/database.module';

describe('database TypeORM configuration', () => {
  const createConfig = (overrides: Record<string, unknown> = {}): ConfigService =>
    new ConfigService({
      database: {
        url: 'postgresql://app_user:secret@localhost:5432/healthcare',
        ssl: false,
        sslRejectUnauthorized: true,
        poolMin: 2,
        poolMax: 10,
        connectionTimeoutMs: 10000,
        ...overrides,
      },
    });

  it('passes the URL and pool settings directly to the PostgreSQL driver', () => {
    const options = createTypeOrmOptions(createConfig());
    expect(options).toMatchObject({
      type: 'postgres',
      url: 'postgresql://app_user:secret@localhost:5432/healthcare',
      ssl: false,
      autoLoadEntities: true,
      synchronize: false,
      migrationsRun: false,
      dropSchema: false,
      logging: false,
      extra: { min: 2, max: 10, connectionTimeoutMillis: 10000 },
    });
  });

  it('enables SSL with certificate verification by default', () => {
    const options = createTypeOrmOptions(createConfig({ ssl: true }));
    expect(options).toMatchObject({ ssl: { rejectUnauthorized: true } });
  });

  it('supports explicitly disabling SSL certificate verification', () => {
    const options = createTypeOrmOptions(createConfig({ ssl: true, sslRejectUnauthorized: false }));
    expect(options).toMatchObject({ ssl: { rejectUnauthorized: false } });
  });

  it('does not expose or invoke schema-management callbacks', () => {
    const synchronize = jest.fn();
    const runMigrations = jest.fn();
    const options = createTypeOrmOptions(createConfig());
    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
    expect(options.dropSchema).toBe(false);
    expect(synchronize).not.toHaveBeenCalled();
    expect(runMigrations).not.toHaveBeenCalled();
  });
});
