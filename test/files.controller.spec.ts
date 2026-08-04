import type { ConfigService } from '@nestjs/config';
import { FileVisibility } from '../src/common/enums/file.enums';
import type { FileAssociationDto } from '../src/modules/files/dto/file-association.dto';
import { FilesController } from '../src/modules/files/controllers/files.controller';
import { FileCategory } from '../src/modules/files/enums/file-category.enum';
import { ResourceType } from '../src/modules/files/enums/resource-type.enum';
import type { FilesService } from '../src/modules/files/services/files.service';

describe('FilesController', () => {
  it('delegates single upload to the service', async () => {
    const result = { id: 'file-id' };
    const service = {
      upload: jest.fn().mockResolvedValue(result),
    } as unknown as FilesService;
    const config = {} as ConfigService;
    const controller = new FilesController(service, config);
    const file = { buffer: Buffer.from('x'), size: 1 } as Express.Multer.File;
    const dto: FileAssociationDto = {
      resourceType: ResourceType.PRESCRIPTION_DOCUMENT,
      resourceId: '4c454f02-c9d2-4c5b-8e1a-57a627e53d1b',
      fileCategory: FileCategory.PRESCRIPTION,
      visibility: FileVisibility.PRIVATE,
      replaceExisting: false,
      metadata: {},
    };
    await expect(controller.upload(file, dto)).resolves.toEqual(result);
    expect(service.upload).toHaveBeenCalledWith(file, dto);
  });
});
