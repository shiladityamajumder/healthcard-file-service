import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 5432),
  name: process.env.DATABASE_NAME,
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  ssl: process.env.DATABASE_SSL === 'true',
  poolMin: Number(process.env.DATABASE_POOL_MIN ?? 2),
  poolMax: Number(process.env.DATABASE_POOL_MAX ?? 10),
  connectTimeoutMs: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 5000),
}));
