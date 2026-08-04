import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fromBuffer } from 'file-type';
import { AppException } from '../../../common/exceptions/app.exception';
import { getExtension, sanitizeFilename } from '../../../common/utils/filename.util';
import { FileCategory } from '../enums/file-category.enum';

interface CategoryPolicy {
  maxSizeBytes: number;
  mimeTypes: string[];
  extensions: string[];
}

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const DOCUMENT_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];
const DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt'];

@Injectable()
export class FileValidationService {
  private readonly policies: Record<FileCategory, CategoryPolicy>;

  constructor(private readonly config: ConfigService) {
    const max = config.getOrThrow<number>('upload.maxSingleFileSizeBytes');
    const globalMimes = config.get<string[]>('upload.allowedMimeTypes') ?? [
      ...IMAGE_MIMES,
      ...DOCUMENT_MIMES,
    ];
    const defaults: Record<FileCategory, CategoryPolicy> = {
      [FileCategory.PRODUCT_IMAGE]: this.policy(max, IMAGE_MIMES, IMAGE_EXTENSIONS),
      [FileCategory.BRAND_LOGO]: this.policy(max, IMAGE_MIMES, IMAGE_EXTENSIONS),
      [FileCategory.PROFILE_IMAGE]: this.policy(max, IMAGE_MIMES, IMAGE_EXTENSIONS),
      [FileCategory.PRESCRIPTION]: this.policy(
        max,
        [...IMAGE_MIMES, 'application/pdf'],
        [...IMAGE_EXTENSIONS, '.pdf'],
      ),
      [FileCategory.MEDICAL_REPORT]: this.policy(max, DOCUMENT_MIMES, DOCUMENT_EXTENSIONS),
      [FileCategory.LABORATORY_REPORT]: this.policy(max, DOCUMENT_MIMES, DOCUMENT_EXTENSIONS),
      [FileCategory.ORGANIZATION_DOCUMENT]: this.policy(max, DOCUMENT_MIMES, DOCUMENT_EXTENSIONS),
      [FileCategory.INVOICE_DOCUMENT]: this.policy(max, DOCUMENT_MIMES, DOCUMENT_EXTENSIONS),
      [FileCategory.SHIPPING_DOCUMENT]: this.policy(
        max,
        [...IMAGE_MIMES, 'application/pdf'],
        [...IMAGE_EXTENSIONS, '.pdf'],
      ),
      [FileCategory.SUPPORT_ATTACHMENT]: this.policy(max, globalMimes, [
        ...IMAGE_EXTENSIONS,
        ...DOCUMENT_EXTENSIONS,
      ]),
      [FileCategory.NOTIFICATION_ATTACHMENT]: this.policy(max, globalMimes, [
        ...IMAGE_EXTENSIONS,
        ...DOCUMENT_EXTENSIONS,
      ]),
    };
    this.policies = this.applyOverrides(
      defaults,
      config.get<string>('upload.categoryPoliciesJson') ?? '{}',
      max,
      new Set(globalMimes),
    );
  }

  async validateBuffer(
    file: Express.Multer.File,
    category: FileCategory,
  ): Promise<{ sanitizedFilename: string; contentType: string; extension: string }> {
    if (!file?.buffer || file.size <= 0) {
      throw new AppException('EMPTY_FILE', 'The uploaded file is empty.', 422);
    }
    const basic = this.validateMetadata(file.originalname, file.mimetype, file.size, category);
    // Declared MIME metadata is not trusted; inspect the bytes before persistence or S3 upload.
    const detected = await fromBuffer(file.buffer);
    if (detected) {
      const detectedMime = this.detectedMimeForExtension(
        detected.mime.toLowerCase(),
        basic.extension,
      );
      const compatible = this.mimeCompatible(basic.contentType, detectedMime);
      if (!compatible || !this.policies[category].mimeTypes.includes(detectedMime)) {
        throw new AppException(
          'MIME_EXTENSION_MISMATCH',
          'The file content does not match the declared type or allowed category.',
          415,
          { declared: basic.contentType, detected: detectedMime },
        );
      }
      const detectedExtension =
        basic.extension === '.docx' && detected.ext === 'zip'
          ? '.docx'
          : `.${detected.ext.toLowerCase()}`;
      if (!this.extensionCompatible(basic.extension, detectedExtension)) {
        throw new AppException(
          'MIME_EXTENSION_MISMATCH',
          'The file extension does not match the detected content.',
          415,
        );
      }
      return { ...basic, contentType: this.canonicalMime(detectedMime) };
    }

    // Plain text has no reliable magic signature, so retain the explicit allowlisted exception.
    if (basic.contentType !== 'text/plain') {
      throw new AppException(
        'FILE_CONTENT_UNRECOGNIZED',
        'The file content type could not be verified.',
        415,
      );
    }
    return basic;
  }

  validateMetadata(
    filename: string,
    mimeType: string,
    sizeBytes: number,
    category: FileCategory,
  ): { sanitizedFilename: string; contentType: string; extension: string } {
    const policy = this.policies[category];
    if (!policy) {
      throw new AppException('INVALID_FILE_CATEGORY', 'The file category is not supported.', 422);
    }
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
      throw new AppException('INVALID_FILE_SIZE', 'The declared file size is invalid.', 422);
    }
    if (sizeBytes > policy.maxSizeBytes) {
      throw new AppException(
        'FILE_TOO_LARGE',
        'The file exceeds the configured category limit.',
        413,
        {
          maxSizeBytes: policy.maxSizeBytes,
        },
      );
    }
    const contentType = mimeType.trim().toLowerCase().split(';')[0] ?? '';
    if (!policy.mimeTypes.includes(contentType)) {
      throw new AppException('UNSUPPORTED_FILE_TYPE', 'The file MIME type is not allowed.', 415, {
        allowedMimeTypes: policy.mimeTypes,
      });
    }
    // Normalize names before deriving extensions; raw client filenames must not become object keys.
    const sanitizedFilename = sanitizeFilename(filename);
    const extension = getExtension(sanitizedFilename);
    if (!extension || !policy.extensions.includes(extension)) {
      throw new AppException(
        'UNSUPPORTED_FILE_EXTENSION',
        'The file extension is not allowed.',
        415,
        {
          allowedExtensions: policy.extensions,
        },
      );
    }
    if (!this.mimeExtensionAllowed(contentType, extension)) {
      throw new AppException(
        'MIME_EXTENSION_MISMATCH',
        'The declared MIME type does not match the file extension.',
        415,
      );
    }
    return { sanitizedFilename, contentType, extension };
  }

  maxFileSize(category: FileCategory): number {
    return this.policies[category].maxSizeBytes;
  }

  private policy(maxSizeBytes: number, mimeTypes: string[], extensions: string[]): CategoryPolicy {
    return {
      maxSizeBytes,
      mimeTypes: [...new Set(mimeTypes.map((value) => value.toLowerCase()))],
      extensions: [...new Set(extensions.map((value) => value.toLowerCase()))],
    };
  }

  private applyOverrides(
    defaults: Record<FileCategory, CategoryPolicy>,
    json: string,
    globalMaxSizeBytes: number,
    globalMimeTypes: Set<string>,
  ): Record<FileCategory, CategoryPolicy> {
    const parsed = JSON.parse(json) as Partial<Record<FileCategory, Partial<CategoryPolicy>>>;
    for (const [category, override] of Object.entries(parsed)) {
      if (!(category in defaults) || !override || Array.isArray(override)) {
        throw new AppException(
          'INVALID_UPLOAD_POLICY_CONFIGURATION',
          `Upload policy category ${category} is not supported.`,
          500,
        );
      }
      const unknownFields = Object.keys(override).filter(
        (field) => !['maxSizeBytes', 'mimeTypes', 'extensions'].includes(field),
      );
      if (unknownFields.length > 0) {
        throw new AppException(
          'INVALID_UPLOAD_POLICY_CONFIGURATION',
          `Upload policy category ${category} contains unsupported fields.`,
          500,
          { fields: unknownFields },
        );
      }
      const key = category as FileCategory;
      const maxSizeBytes = override.maxSizeBytes ?? defaults[key].maxSizeBytes;
      if (
        !Number.isSafeInteger(maxSizeBytes) ||
        maxSizeBytes <= 0 ||
        maxSizeBytes > globalMaxSizeBytes
      ) {
        throw new AppException(
          'INVALID_UPLOAD_POLICY_CONFIGURATION',
          `Upload policy category ${category} has an invalid maxSizeBytes.`,
          500,
        );
      }
      if (
        override.mimeTypes !== undefined &&
        (!Array.isArray(override.mimeTypes) ||
          override.mimeTypes.length === 0 ||
          override.mimeTypes.some((value) => typeof value !== 'string'))
      ) {
        throw new AppException(
          'INVALID_UPLOAD_POLICY_CONFIGURATION',
          `Upload policy category ${category} has invalid MIME types.`,
          500,
        );
      }
      const mimeTypes =
        override.mimeTypes?.map((value) => value.toLowerCase()) ?? defaults[key].mimeTypes;
      if (mimeTypes.length === 0 || mimeTypes.some((value) => !globalMimeTypes.has(value))) {
        throw new AppException(
          'INVALID_UPLOAD_POLICY_CONFIGURATION',
          `Upload policy category ${category} has invalid MIME types.`,
          500,
        );
      }
      if (
        override.extensions !== undefined &&
        (!Array.isArray(override.extensions) ||
          override.extensions.length === 0 ||
          override.extensions.some((value) => typeof value !== 'string'))
      ) {
        throw new AppException(
          'INVALID_UPLOAD_POLICY_CONFIGURATION',
          `Upload policy category ${category} has invalid extensions.`,
          500,
        );
      }
      const extensions =
        override.extensions?.map((value) => value.toLowerCase()) ?? defaults[key].extensions;
      if (
        extensions.length === 0 ||
        extensions.some((value) => !/^\.[a-z0-9]{1,10}$/.test(value))
      ) {
        throw new AppException(
          'INVALID_UPLOAD_POLICY_CONFIGURATION',
          `Upload policy category ${category} has invalid extensions.`,
          500,
        );
      }
      defaults[key] = {
        maxSizeBytes,
        mimeTypes: [...new Set(mimeTypes)],
        extensions: [...new Set(extensions)],
      };
    }
    return defaults;
  }

  private mimeExtensionAllowed(mime: string, extension: string): boolean {
    const map: Record<string, string[]> = {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    };
    return map[mime]?.includes(extension) ?? false;
  }
  private detectedMimeForExtension(detectedMime: string, extension: string): string {
    if (extension === '.docx' && detectedMime === 'application/zip') {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (extension === '.doc' && detectedMime === 'application/x-cfb') {
      return 'application/msword';
    }
    return detectedMime;
  }

  private mimeCompatible(declared: string, detected: string): boolean {
    return this.canonicalMime(declared) === this.canonicalMime(detected);
  }

  private canonicalMime(mime: string): string {
    if (mime === 'application/x-cfb') return 'application/msword';
    return mime;
  }

  private extensionCompatible(declared: string, detected: string): boolean {
    if (['.jpg', '.jpeg'].includes(declared) && ['.jpg', '.jpeg'].includes(detected)) return true;
    if (declared === '.doc' && detected === '.cfb') return true;
    return declared === detected;
  }
}
