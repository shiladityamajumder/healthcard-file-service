import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  projectName: process.env.PROJECT_NAME ?? 'Healthcare File Service',
  version: process.env.APP_VERSION ?? '1.0.0',
  apiPrefix: process.env.API_PREFIX ?? 'api',
  apiVersion: process.env.API_VERSION ?? 'v1',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  corsEnabled: process.env.CORS_ENABLED === 'true',
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((value: string) => value.trim())
    .filter(Boolean),
  swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
  maxHttpBodySizeBytes: Number(process.env.MAX_HTTP_BODY_SIZE_BYTES ?? 62_914_560),
  allowNoopScannerInProduction: process.env.ALLOW_NOOP_SCANNER_IN_PRODUCTION === 'true',
  headers: {
    internalService: (process.env.TRUSTED_GATEWAY_HEADER_NAME ?? 'x-internal-service-key').toLowerCase(),
    requestId: (process.env.REQUEST_ID_HEADER_NAME ?? 'x-request-id').toLowerCase(),
    correlationId: (process.env.CORRELATION_ID_HEADER_NAME ?? 'x-correlation-id').toLowerCase(),
    userId: (process.env.USER_ID_HEADER_NAME ?? 'x-user-id').toLowerCase(),
    actorId: (process.env.ACTOR_ID_HEADER_NAME ?? 'x-actor-id').toLowerCase(),
    roles: (process.env.ROLES_HEADER_NAME ?? 'x-roles').toLowerCase(),
    idempotencyKey: (process.env.IDEMPOTENCY_KEY_HEADER_NAME ?? 'idempotency-key').toLowerCase(),
  },
  internalServiceSecret: process.env.INTERNAL_SERVICE_SECRET ?? '',
}));
