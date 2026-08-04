import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import {
  FileAccessEventEntity,
  FileObjectEntity,
  FileUploadSessionEntity,
  FileVariantEntity,
} from './entities';

export const createTypeOrmOptions = (config: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  // Pass the validated URL through unchanged; credentials must never be reconstructed or logged here.
  url: config.getOrThrow<string>('database.url'),
  ssl: config.getOrThrow<boolean>('database.ssl')
    ? { rejectUnauthorized: config.getOrThrow<boolean>('database.sslRejectUnauthorized') }
    : false,
  autoLoadEntities: true,
  // healthcare_db is the sole migration authority; this service must never change database objects.
  synchronize: false,
  migrationsRun: false,
  dropSchema: false,
  logging: false,
  retryAttempts: 5,
  retryDelay: 2000,
  extra: {
    min: config.getOrThrow<number>('database.poolMin'),
    max: config.getOrThrow<number>('database.poolMax'),
    connectionTimeoutMillis: config.getOrThrow<number>('database.connectionTimeoutMs'),
  },
});

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createTypeOrmOptions,
    }),
    TypeOrmModule.forFeature([
      FileObjectEntity,
      FileUploadSessionEntity,
      FileVariantEntity,
      FileAccessEventEntity,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
