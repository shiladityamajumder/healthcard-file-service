import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileAccessEventEntity, FileObjectEntity, FileUploadSessionEntity, FileVariantEntity } from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.getOrThrow<string>('database.host'),
        port: config.getOrThrow<number>('database.port'),
        database: config.getOrThrow<string>('database.name'),
        username: config.getOrThrow<string>('database.username'),
        password: config.getOrThrow<string>('database.password'),
        ssl: config.get<boolean>('database.ssl') ? { rejectUnauthorized: false } : false,
        entities: [FileObjectEntity, FileUploadSessionEntity, FileVariantEntity, FileAccessEventEntity],
        synchronize: false,
        migrationsRun: false,
        logging: false,
        retryAttempts: 5,
        retryDelay: 2000,
        connectTimeoutMS: config.getOrThrow<number>('database.connectTimeoutMs'),
        extra: {
          max: config.getOrThrow<number>('database.poolMax'),
          min: config.getOrThrow<number>('database.poolMin'),
        },
      }),
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
