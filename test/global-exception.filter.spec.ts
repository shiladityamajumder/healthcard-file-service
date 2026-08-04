import { Logger, type ArgumentsHost } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AppException } from '../src/common/exceptions/app.exception';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import type { RequestContextService } from '../src/common/middleware/request-context.service';

describe('GlobalExceptionFilter', () => {
  it('emits the auth-service-compatible error envelope', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ setHeader: jest.fn().mockReturnValue({ json }) });
    const host = {
      switchToHttp: (): { getResponse: () => { status: typeof status } } => ({
        getResponse: (): { status: typeof status } => ({ status }),
      }),
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

  it('does not include database credentials in logs or error responses', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ setHeader: jest.fn().mockReturnValue({ json }) });
    const host = {
      switchToHttp: (): { getResponse: () => { status: typeof status } } => ({
        getResponse: (): { status: typeof status } => ({ status }),
      }),
    } as unknown as ArgumentsHost;
    const context = {
      get: (): { requestId: string; correlationId: string } => ({
        requestId: 'request-id',
        correlationId: 'correlation-id',
      }),
    } as unknown as RequestContextService;
    const config = {
      get: (): string => 'v1',
    } as unknown as ConfigService;
    const databaseUrl =
      'postgresql://sensitive-user:sensitive-password@database.internal:5432/healthcare';
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    new GlobalExceptionFilter(context, config).catch(
      new Error(`Database connection failed: ${databaseUrl}`),
      host,
    );

    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('sensitive-user');
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('sensitive-password');
    expect(JSON.stringify(json.mock.calls)).not.toContain('database.internal');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected server error occurred.',
        }),
      }),
    );
    errorLog.mockRestore();
  });
});
