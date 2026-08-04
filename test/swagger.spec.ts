import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { FilesController } from '../src/modules/files/controllers/files.controller';
import { FilesService } from '../src/modules/files/services/files.service';

describe('Swagger document generation', () => {
  it('generates the API error response schema without circular references', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [
        { provide: FilesService, useValue: {} },
        { provide: ConfigService, useValue: {} },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();

    expect(() =>
      SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('test').build()),
    ).not.toThrow();

    await app.close();
  });
});
