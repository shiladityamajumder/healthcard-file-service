import type { ConfigService } from '@nestjs/config';
import { AppException } from '../src/common/exceptions/app.exception';
import { FileCategory } from '../src/modules/files/enums/file-category.enum';
import { FileValidationService } from '../src/modules/files/services/file-validation.service';

function config(): ConfigService {
  const values: Record<string, unknown> = {
    'upload.maxSingleFileSizeBytes': 1024,
    'upload.allowedMimeTypes': ['image/jpeg', 'application/pdf', 'text/plain'],
    'upload.categoryPoliciesJson': '{}',
  };
  return {
    get: <T>(key: string): T | undefined => values[key] as T | undefined,
    getOrThrow: <T>(key: string): T => values[key] as T,
  } as unknown as ConfigService;
}

describe('FileValidationService', () => {
  const service = new FileValidationService(config());

  it('accepts matching PDF metadata', () => {
    expect(
      service.validateMetadata('report.pdf', 'application/pdf', 512, FileCategory.MEDICAL_REPORT),
    ).toEqual({
      sanitizedFilename: 'report.pdf',
      contentType: 'application/pdf',
      extension: '.pdf',
    });
  });

  it('rejects MIME-extension mismatches', () => {
    // Client-provided MIME and extension must agree before content inspection or persistence.
    expect(() =>
      service.validateMetadata('report.jpg', 'application/pdf', 512, FileCategory.MEDICAL_REPORT),
    ).toThrow(AppException);
  });

  it('rejects category size overflow', () => {
    expect(() =>
      service.validateMetadata('report.pdf', 'application/pdf', 2048, FileCategory.MEDICAL_REPORT),
    ).toThrow('The file exceeds the configured category limit.');
  });
});
