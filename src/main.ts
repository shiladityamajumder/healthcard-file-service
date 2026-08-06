import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { createHelmetOptions } from './config/http-security.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.use(helmet(createHelmetOptions(config.getOrThrow<string>('app.nodeEnv'))));
  const maxBody = config.getOrThrow<number>('app.maxHttpBodySizeBytes');
  app.use(json({ limit: maxBody }));
  app.use(urlencoded({ extended: true, limit: maxBody }));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      stopAtFirstError: false,
    }),
  );

  if (config.get<boolean>('app.corsEnabled')) {
    const origins = config.get<string[]>('app.corsOrigins') ?? [];
    const headers = config.getOrThrow<Record<string, string>>('app.headers');
    app.enableCors({
      origin: origins.length ? origins : false,
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'content-type',
        headers.requestId,
        headers.correlationId,
        headers.userId,
        headers.actorId,
        headers.roles,
        headers.internalService,
        headers.idempotencyKey,
      ],
      exposedHeaders: [headers.requestId, headers.correlationId, 'X-API-Version'],
    });
  }

  const apiPrefix = config.getOrThrow<string>('app.apiPrefix');
  const apiVersion = config.getOrThrow<string>('app.apiVersion');
  app.setGlobalPrefix(`${apiPrefix}/${apiVersion}`, {
    exclude: ['health', 'ready', 'health/live', 'health/ready'],
  });

  if (config.get<boolean>('app.swaggerEnabled')) {
    const documentConfig = new DocumentBuilder()
      .setTitle(config.getOrThrow<string>('app.projectName'))
      .setDescription(
        'Internal healthcare file management service. Private deployment behind a trusted API Gateway is required.',
      )
      .setVersion(config.getOrThrow<string>('app.version'))
      .addTag('Files', 'Public/private S3 uploads, downloads, replacement, deletion, and metadata')
      .addTag('Health', 'Liveness and dependency readiness')
      .addApiKey(
        { type: 'apiKey', in: 'header', name: 'X-Internal-Service-Key' },
        'internal-service',
      )
      .build();
    const document = SwaggerModule.createDocument(app, documentConfig);
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'openapi.json',
      useGlobalPrefix: false,
      swaggerOptions: { persistAuthorization: false, displayRequestDuration: true, filter: true },
    });
  }

  await app.listen(config.getOrThrow<number>('app.port'), '0.0.0.0');
}

void bootstrap();
