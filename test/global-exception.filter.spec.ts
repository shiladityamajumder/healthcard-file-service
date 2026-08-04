import type { ArgumentsHost } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AppException } from '../src/common/exceptions/app.exception';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import type { RequestContextService } from '../src/common/middleware/request-context.service';

describe('GlobalExceptionFilter', () => {
  it('emits the auth-service-compatible error envelope', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ setHeader: jest.fn().mockReturnValue({ json }) });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
    const context = {
      get: () => ({ requestId: 'request-id', correlationId: 'correlation-id' }),
    } as unknown as RequestContextService;
    const config = {
      get: () => 'v1',
    } as unknown as ConfigService;
    new GlobalExceptionFilter(context, config).catch(
      new AppException('FILE_NOT_FOUND', 'The requested file was not found.', 404),
      host,
    );
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        data: null,
        error: expect.objectContaining({ code: 'FILE_NOT_FOUND' }),
        meta: expect.objectContaining({ api_version: 'v1' }),
      }),
    );
  });
});
