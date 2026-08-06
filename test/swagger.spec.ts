import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { FilesController } from '../src/modules/files/controllers/files.controller';
import { FilesService } from '../src/modules/files/services/files.service';

describe('Swagger document generation', () => {
  it('generates the API error response schema without circular references', async () => {
    // Use the real controller decorators so DTO regressions fail before the docs UI is served.
    const moduleRef = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [
        { provide: FilesService, useValue: {} },
        { provide: ConfigService, useValue: {} },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('test').build(),
    );

    expect(document.components?.schemas?.ResponseMetaDto).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          requestId: expect.any(Object),
          correlationId: expect.any(Object),
          apiVersion: expect.any(Object),
        }),
      }),
    );
    for (const path of Object.keys(document.paths)) expect(path).not.toContain('_');

    await app.close();
  });
});
