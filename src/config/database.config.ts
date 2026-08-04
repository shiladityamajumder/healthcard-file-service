import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  // This service connects to an existing database; healthcare_db owns its schema lifecycle.
  url: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true',
  sslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  poolMin: Number(process.env.DATABASE_POOL_MIN ?? 2),
  poolMax: Number(process.env.DATABASE_POOL_MAX ?? 10),
  connectionTimeoutMs: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? 10000),
}));
