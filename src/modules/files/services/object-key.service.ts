import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extname } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { FileVisibility } from '../../../common/enums/file.enums';
import { sanitizeFilename } from '../../../common/utils/filename.util';
import { ResourceType } from '../enums/resource-type.enum';

@Injectable()
export class ObjectKeyService {
  constructor(private readonly config: ConfigService) {}

  generate(input: {
    visibility: FileVisibility;
    resourceType: ResourceType;
    resourceId: string;
    filename: string;
    now?: Date;
  }): string {
    const now = input.now ?? new Date();
    const environment = this.segment(this.config.get<string>('app.nodeEnv') ?? 'development');
    const prefix = this.segment(
      input.visibility === FileVisibility.PUBLIC
        ? this.config.get<string>('aws.publicPrefix') ?? 'public'
        : this.config.get<string>('aws.privatePrefix') ?? 'private',
    );
    const resourceType = this.segment(input.resourceType);
    const resourceId = this.segment(input.resourceId);
    const year = now.getUTCFullYear().toString();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const filename = sanitizeFilename(input.filename);
    const objectName =
      input.visibility === FileVisibility.PRIVATE
        ? `${uuidv4()}${extname(filename).toLowerCase()}`
        : `${uuidv4()}-${filename}`;
    return [environment, prefix, resourceType, resourceId, year, month, objectName].join('/');
  }

  variant(sourceKey: string, variantName: string, extension = '.webp'): string {
    const lastSlash = sourceKey.lastIndexOf('/');
    const directory = sourceKey.slice(0, lastSlash);
    const filename = sourceKey.slice(lastSlash + 1);
    const dot = filename.lastIndexOf('.');
    const stem = dot > 0 ? filename.slice(0, dot) : filename;
    return `${directory}/variants/${this.segment(variantName)}/${stem}-${this.segment(variantName)}${extension}`;
  }

  private segment(value: string): string {
    const sanitized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return sanitized || 'unknown';
  }
}
