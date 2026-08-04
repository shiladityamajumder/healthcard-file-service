import { registerAs } from '@nestjs/config';

export const uploadConfig = registerAs('upload', () => ({
  maxSingleFileSizeBytes: Number(process.env.MAX_SINGLE_FILE_SIZE_BYTES ?? 10_485_760),
  maxMultipleFileCount: Number(process.env.MAX_MULTIPLE_FILE_COUNT ?? 10),
  maxTotalUploadSizeBytes: Number(process.env.MAX_TOTAL_UPLOAD_SIZE_BYTES ?? 52_428_800),
  allowedMimeTypes: (process.env.ALLOWED_MIME_TYPES ?? '')
    .split(',')
    .map((value: string) => value.trim().toLowerCase())
    .filter(Boolean),
  categoryPoliciesJson: process.env.UPLOAD_CATEGORY_POLICIES_JSON ?? '{}',
  imageProcessingEnabled: process.env.IMAGE_PROCESSING_ENABLED !== 'false',
  imageThumbnailWidth: Number(process.env.IMAGE_THUMBNAIL_WIDTH ?? 512),
  imageWebpQuality: Number(process.env.IMAGE_WEBP_QUALITY ?? 82),
  imageMaxWidth: Number(process.env.IMAGE_MAX_WIDTH ?? 4096),
  imageMaxHeight: Number(process.env.IMAGE_MAX_HEIGHT ?? 4096),
}));
