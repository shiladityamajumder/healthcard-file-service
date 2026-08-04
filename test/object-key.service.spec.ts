import type { ConfigService } from '@nestjs/config';
import { FileVisibility } from '../src/common/enums/file.enums';
import { ResourceType } from '../src/modules/files/enums/resource-type.enum';
import { ObjectKeyService } from '../src/modules/files/services/object-key.service';

function config(values: Record<string, unknown>): ConfigService {
  return {
    get: <T>(key: string): T | undefined => values[key] as T | undefined,
  } as unknown as ConfigService;
}

describe('ObjectKeyService', () => {
  it('creates structured non-PII keys', () => {
    const service = new ObjectKeyService(
      config({ 'app.nodeEnv': 'production', 'aws.privatePrefix': 'private' }),
    );
    const key = service.generate({
      visibility: FileVisibility.PRIVATE,
      resourceType: ResourceType.PRESCRIPTION_DOCUMENT,
      resourceId: '4c454f02-c9d2-4c5b-8e1a-57a627e53d1b',
      filename: '../../John Doe Prescription.pdf',
      now: new Date('2026-08-04T00:00:00Z'),
    });
    expect(key).toMatch(
      /^production\/private\/prescription_document\/4c454f02-c9d2-4c5b-8e1a-57a627e53d1b\/2026\/08\/[0-9a-f-]+\.pdf$/,
    );
    expect(key).not.toContain('..');
    expect(key.toLowerCase()).not.toContain('john');
  });

  it('creates predictable variant paths', () => {
    const service = new ObjectKeyService(config({}));
    expect(service.variant('a/b/file.jpg', 'thumbnail')).toBe(
      'a/b/variants/thumbnail/file-thumbnail.webp',
    );
  });
});
