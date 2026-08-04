import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule, type Params } from 'nestjs-pino';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { InternalServiceGuard } from './common/guards/internal-service.guard';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import {
  appConfig,
  awsConfig,
  databaseConfig,
  environmentValidationSchema,
  uploadConfig,
} from './config';
import type { AppHeaders } from './config/app.config';
import { DatabaseModule } from './database/database.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, databaseConfig, awsConfig, uploadConfig],
      validationSchema: environmentValidationSchema,
      validationOptions: { abortEarly: false, allowUnknown: true },
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): Params => {
        const headers = config.getOrThrow<AppHeaders>('app.headers');
        return {
          pinoHttp: {
            level: config.get<string>('app.logLevel') ?? 'info',
            autoLogging: true,
            quietReqLogger: true,
            genReqId: (request: IncomingMessage): string => {
              const supplied = request.headers[headers.requestId];
              const value = Array.isArray(supplied) ? supplied[0] : supplied;
              const uuidPattern =
                /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
              return value && uuidPattern.test(value) ? value : randomUUID();
            },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers.x-internal-service-key',
                'res.headers.set-cookie',
                '*.uploadUrl',
                '*.url',
                '*.presignedUrl',
                '*.originalFilename',
                'DATABASE_URL',
                '*.DATABASE_URL',
                'database.url',
                '*.database.url',
              ],
              censor: '[REDACTED]',
            },
            customProps: (request: IncomingMessage): Record<string, unknown> => {
              const contextualRequest = request as IncomingMessage & {
                requestContext?: { requestId?: string; correlationId?: string };
              };
              return {
                service: 'healthcare-file-service',
                requestId: contextualRequest.requestContext?.requestId,
                correlationId: contextualRequest.requestContext?.correlationId,
              };
            },
            serializers: {
              req: (request: IncomingMessage & { id?: string }): Record<string, unknown> => ({
                id: request.id,
                method: request.method,
                url: request.url,
              }),
              res: (response: ServerResponse): Record<string, unknown> => ({
                statusCode: response.statusCode,
              }),
            },
          },
        };
      },
    }),
    DatabaseModule,
    FilesModule,
    HealthModule,
  ],
  providers: [
    RequestContextMiddleware,
    InternalServiceGuard,
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('{*path}');
  }
}
