import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';

export interface ImageVariantResult {
  name: string;
  buffer: Buffer;
  contentType: 'image/webp';
  extension: '.webp';
  width: number;
  height: number;
  transformation: Record<string, unknown>;
}

@Injectable()
export class ImageProcessingService {
  constructor(private readonly config: ConfigService) {}

  enabled(): boolean {
    return this.config.get<boolean>('upload.imageProcessingEnabled') ?? false;
  }

  async createVariants(buffer: Buffer, contentType: string): Promise<ImageVariantResult[]> {
    if (!this.enabled() || !contentType.startsWith('image/')) return [];
    const maxWidth = this.config.getOrThrow<number>('upload.imageMaxWidth');
    const maxHeight = this.config.getOrThrow<number>('upload.imageMaxHeight');
    const thumbnailWidth = this.config.getOrThrow<number>('upload.imageThumbnailWidth');
    const quality = this.config.getOrThrow<number>('upload.imageWebpQuality');
    const metadata = await sharp(buffer, { animated: false }).metadata();
    if (!metadata.width || !metadata.height) return [];
    const safeWidth = Math.min(thumbnailWidth, maxWidth, metadata.width);
    const output = await sharp(buffer, { animated: false })
      .rotate()
      .resize({ width: safeWidth, height: maxHeight, fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    return [
      {
        name: 'thumbnail',
        buffer: output.data,
        contentType: 'image/webp',
        extension: '.webp',
        width: output.info.width,
        height: output.info.height,
        transformation: {
          format: 'webp',
          quality,
          maxWidth: safeWidth,
          maxHeight,
          sourceWidth: metadata.width,
          sourceHeight: metadata.height,
        },
      },
    ];
  }
}
