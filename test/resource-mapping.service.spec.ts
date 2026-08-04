import { FileVisibility } from '../src/common/enums/file.enums';
import { AppException } from '../src/common/exceptions/app.exception';
import { FileCategory } from '../src/modules/files/enums/file-category.enum';
import { ResourceType } from '../src/modules/files/enums/resource-type.enum';
import { ResourceMappingService } from '../src/modules/files/services/resource-mapping.service';

describe('ResourceMappingService', () => {
  const service = new ResourceMappingService();

  it('maps brand logos to the verified catalog field', () => {
    const definition = service.definition(ResourceType.BRAND_LOGO);
    expect(definition).toMatchObject({
      sourceModel: 'Brands',
      sourceFile: 'app/models/catalog.py',
      schema: 'catalog',
      table: 'brands',
      fileColumn: 'logo_file_id',
      associationKind: 'direct',
    });
  });

  it('rejects private product media', () => {
    expect(() =>
      service.validate({
        resourceType: ResourceType.PRODUCT_MEDIA,
        resourceId: '4c454f02-c9d2-4c5b-8e1a-57a627e53d1b',
        visibility: FileVisibility.PRIVATE,
        category: FileCategory.PRODUCT_IMAGE,
        metadata: {},
      }),
    ).toThrow(AppException);
  });

  it('requires claim documentType metadata', () => {
    expect(() =>
      service.validate({
        resourceType: ResourceType.INSURANCE_CLAIM_DOCUMENT,
        resourceId: '4c454f02-c9d2-4c5b-8e1a-57a627e53d1b',
        visibility: FileVisibility.PRIVATE,
        category: FileCategory.MEDICAL_REPORT,
        metadata: {},
      }),
    ).toThrow('documentType');
  });

  it('rejects unknown association metadata fields', () => {
    // Request metadata cannot smuggle SQL identifiers or select an unapproved association target.
    expect(() =>
      service.validate({
        resourceType: ResourceType.BRAND_LOGO,
        resourceId: '4c454f02-c9d2-4c5b-8e1a-57a627e53d1b',
        visibility: FileVisibility.PUBLIC,
        category: FileCategory.BRAND_LOGO,
        metadata: { tableName: 'users' },
      }),
    ).toThrow('unsupported fields');
  });
});
