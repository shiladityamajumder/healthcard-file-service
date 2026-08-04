import { registerAs } from '@nestjs/config';

export const awsConfig = registerAs('aws', () => ({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || undefined,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || undefined,
  sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
  publicBucket: process.env.AWS_S3_PUBLIC_BUCKET,
  privateBucket: process.env.AWS_S3_PRIVATE_BUCKET,
  publicPrefix: process.env.AWS_S3_PUBLIC_PREFIX ?? 'public',
  privatePrefix: process.env.AWS_S3_PRIVATE_PREFIX ?? 'private',
  endpoint: process.env.AWS_S3_ENDPOINT || undefined,
  forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === 'true',
  cloudFrontPublicBaseUrl: process.env.AWS_CLOUDFRONT_PUBLIC_BASE_URL || undefined,
  publicBaseUrl: process.env.AWS_S3_PUBLIC_BASE_URL || undefined,
  serverSideEncryption: process.env.AWS_S3_SERVER_SIDE_ENCRYPTION || undefined,
  kmsKeyId: process.env.AWS_S3_KMS_KEY_ID || undefined,
  maxAttempts: Number(process.env.AWS_S3_MAX_ATTEMPTS ?? 3),
  connectionTimeoutMs: Number(process.env.AWS_S3_CONNECTION_TIMEOUT_MS ?? 3000),
  requestTimeoutMs: Number(process.env.AWS_S3_REQUEST_TIMEOUT_MS ?? 15000),
  presignedUploadExpirySeconds: Number(process.env.PRESIGNED_UPLOAD_EXPIRY_SECONDS ?? 900),
  presignedDownloadExpirySeconds: Number(process.env.PRESIGNED_DOWNLOAD_EXPIRY_SECONDS ?? 300),
}));
