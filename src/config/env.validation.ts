import Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'staging', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  PROJECT_NAME: Joi.string().default('Healthcare File Service'),
  APP_VERSION: Joi.string().default('1.0.0'),
  API_PREFIX: Joi.string().default('api'),
  API_VERSION: Joi.string().default('v1'),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent').default('info'),

  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().port().default(5432),
  DATABASE_NAME: Joi.string().required(),
  DATABASE_USERNAME: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().allow('').required(),
  DATABASE_SSL: Joi.boolean().truthy('true').falsy('false').default(false),
  DATABASE_POOL_MIN: Joi.number().integer().min(0).default(2),
  DATABASE_POOL_MAX: Joi.number().integer().min(1).default(10),
  DATABASE_CONNECT_TIMEOUT_MS: Joi.number().integer().min(100).default(5000),

  AWS_REGION: Joi.string().required(),
  AWS_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
  AWS_SESSION_TOKEN: Joi.string().allow('').optional(),
  AWS_S3_PUBLIC_BUCKET: Joi.string().required(),
  AWS_S3_PRIVATE_BUCKET: Joi.string().required(),
  AWS_S3_PUBLIC_PREFIX: Joi.string().default('public'),
  AWS_S3_PRIVATE_PREFIX: Joi.string().default('private'),
  AWS_S3_ENDPOINT: Joi.string().uri({ allowRelative: false }).allow('').optional(),
  AWS_S3_FORCE_PATH_STYLE: Joi.boolean().truthy('true').falsy('false').default(false),
  AWS_CLOUDFRONT_PUBLIC_BASE_URL: Joi.string().uri({ allowRelative: false }).allow('').optional(),
  AWS_S3_PUBLIC_BASE_URL: Joi.string().uri({ allowRelative: false }).allow('').optional(),
  AWS_S3_SERVER_SIDE_ENCRYPTION: Joi.string().valid('', 'AES256', 'aws:kms').default('AES256'),
  AWS_S3_KMS_KEY_ID: Joi.string().allow('').optional(),
  AWS_S3_MAX_ATTEMPTS: Joi.number().integer().min(1).max(10).default(3),
  AWS_S3_CONNECTION_TIMEOUT_MS: Joi.number().integer().min(100).default(3000),
  AWS_S3_REQUEST_TIMEOUT_MS: Joi.number().integer().min(500).default(15000),

  PRESIGNED_UPLOAD_EXPIRY_SECONDS: Joi.number().integer().min(60).max(3600).default(900),
  PRESIGNED_DOWNLOAD_EXPIRY_SECONDS: Joi.number().integer().min(30).max(3600).default(300),
  MAX_SINGLE_FILE_SIZE_BYTES: Joi.number().integer().min(1).default(10485760),
  MAX_MULTIPLE_FILE_COUNT: Joi.number().integer().min(1).max(100).default(10),
  MAX_TOTAL_UPLOAD_SIZE_BYTES: Joi.number().integer().min(1).default(52428800),
  ALLOWED_MIME_TYPES: Joi.string().default(
    'image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain',
  ),
  UPLOAD_CATEGORY_POLICIES_JSON: Joi.string().default('{}'),
  IMAGE_PROCESSING_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  IMAGE_THUMBNAIL_WIDTH: Joi.number().integer().min(64).max(4096).default(512),
  IMAGE_WEBP_QUALITY: Joi.number().integer().min(1).max(100).default(82),
  IMAGE_MAX_WIDTH: Joi.number().integer().min(64).max(12000).default(4096),
  IMAGE_MAX_HEIGHT: Joi.number().integer().min(64).max(12000).default(4096),
  ALLOW_NOOP_SCANNER_IN_PRODUCTION: Joi.boolean().truthy('true').falsy('false').default(false),

  INTERNAL_SERVICE_SECRET: Joi.string().allow('').optional(),
  TRUSTED_GATEWAY_HEADER_NAME: Joi.string().pattern(/^[a-z0-9-]+$/i).default('x-internal-service-key'),
  REQUEST_ID_HEADER_NAME: Joi.string().pattern(/^[a-z0-9-]+$/i).default('x-request-id'),
  CORRELATION_ID_HEADER_NAME: Joi.string().pattern(/^[a-z0-9-]+$/i).default('x-correlation-id'),
  USER_ID_HEADER_NAME: Joi.string().pattern(/^[a-z0-9-]+$/i).default('x-user-id'),
  ACTOR_ID_HEADER_NAME: Joi.string().pattern(/^[a-z0-9-]+$/i).default('x-actor-id'),
  ROLES_HEADER_NAME: Joi.string().pattern(/^[a-z0-9-]+$/i).default('x-roles'),
  IDEMPOTENCY_KEY_HEADER_NAME: Joi.string().pattern(/^[a-z0-9-]+$/i).default('idempotency-key'),

  CORS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  CORS_ORIGINS: Joi.string().allow('').default(''),
  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  MAX_HTTP_BODY_SIZE_BYTES: Joi.number().integer().min(1024).default(62914560),
}).custom((value: Record<string, unknown>, helpers: Joi.CustomHelpers) => {
  const min = Number(value.DATABASE_POOL_MIN);
  const max = Number(value.DATABASE_POOL_MAX);
  if (min > max) {
    return helpers.error('any.custom', { message: 'DATABASE_POOL_MIN cannot exceed DATABASE_POOL_MAX' });
  }
  if (value.AWS_S3_SERVER_SIDE_ENCRYPTION === 'aws:kms' && !value.AWS_S3_KMS_KEY_ID) {
    return helpers.error('any.custom', { message: 'AWS_S3_KMS_KEY_ID is required for aws:kms' });
  }
  try {
    const parsed = JSON.parse(String(value.UPLOAD_CATEGORY_POLICIES_JSON)) as unknown;
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      return helpers.error('any.custom', {
        message: 'UPLOAD_CATEGORY_POLICIES_JSON must be a JSON object',
      });
    }
  } catch {
    return helpers.error('any.custom', { message: 'UPLOAD_CATEGORY_POLICIES_JSON must be valid JSON' });
  }
  if (
    value.AWS_S3_PUBLIC_BUCKET === value.AWS_S3_PRIVATE_BUCKET &&
    value.AWS_S3_PUBLIC_PREFIX === value.AWS_S3_PRIVATE_PREFIX
  ) {
    return helpers.error('any.custom', {
      message: 'Public and private storage must use different buckets or different prefixes',
    });
  }
  const headerNames = [
    'TRUSTED_GATEWAY_HEADER_NAME',
    'REQUEST_ID_HEADER_NAME',
    'CORRELATION_ID_HEADER_NAME',
    'USER_ID_HEADER_NAME',
    'ACTOR_ID_HEADER_NAME',
    'ROLES_HEADER_NAME',
    'IDEMPOTENCY_KEY_HEADER_NAME',
  ].map((name) => String(value[name]).toLowerCase());
  if (new Set(headerNames).size !== headerNames.length) {
    return helpers.error('any.custom', {
      message: 'Configured trusted header names must be unique',
    });
  }
  if (value.NODE_ENV === 'production' && value.ALLOW_NOOP_SCANNER_IN_PRODUCTION !== true) {
    return helpers.error('any.custom', {
      message:
        'The development no-op scanner is blocked in production; integrate a real scanner or explicitly acknowledge the risk',
    });
  }
  return value;
});
