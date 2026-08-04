import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { MulterError } from 'multer';
import { QueryFailedError } from 'typeorm';
import { AppException } from '../exceptions/app.exception';
import { RequestContextService } from '../middleware/request-context.service';

interface ValidationMessage {
  property?: string;
  constraints?: Record<string, string>;
  children?: ValidationMessage[];
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(
    private readonly contextService: RequestContextService,
    private readonly config: ConfigService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const context = this.contextService.get();
    const mapped = this.mapException(exception);

    if (mapped.statusCode >= 500) {
      this.logger.error({
        message: 'Request failed',
        requestId: context?.requestId,
        errorCode: mapped.code,
        exceptionType: exception instanceof Error ? exception.constructor.name : typeof exception,
      });
    } else {
      this.logger.warn({
        message: 'Request rejected',
        requestId: context?.requestId,
        errorCode: mapped.code,
        statusCode: mapped.statusCode,
      });
    }

    response.status(mapped.statusCode).setHeader('Cache-Control', 'no-store').json({
      success: false,
      data: null,
      error: {
        code: mapped.code,
        message: mapped.message,
        details: mapped.details,
      },
      meta: {
        request_id: context?.requestId ?? null,
        correlation_id: context?.correlationId ?? null,
        api_version: this.config.get<string>('app.apiVersion') ?? 'v1',
        timestamp: new Date().toISOString(),
      },
    });
  }

  private mapException(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
    details: unknown;
  } {
    if (exception instanceof AppException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof MulterError) {
      const fileLimitCodes = new Set(['LIMIT_FILE_SIZE', 'LIMIT_PART_COUNT', 'LIMIT_FIELD_VALUE']);
      const countLimitCodes = new Set(['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE']);
      return {
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        code: fileLimitCodes.has(exception.code)
          ? 'FILE_TOO_LARGE'
          : countLimitCodes.has(exception.code)
            ? 'TOO_MANY_FILES'
            : 'MULTIPART_REQUEST_INVALID',
        message: fileLimitCodes.has(exception.code)
          ? 'The multipart payload exceeds the configured limit.'
          : countLimitCodes.has(exception.code)
            ? 'The multipart request contains too many or unexpected files.'
            : 'The multipart request is invalid.',
        details: { multipartCode: exception.code },
      };
    }

    if (exception instanceof BadRequestException) {
      const response = exception.getResponse();
      const rawMessages =
        typeof response === 'object' && response !== null && 'message' in response
          ? (response as { message?: unknown }).message
          : null;
      const details = Array.isArray(rawMessages)
        ? rawMessages.flatMap((item) => this.flattenValidation(item as ValidationMessage))
        : null;
      return {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'REQUEST_VALIDATION_ERROR',
        message: 'The request contains invalid input.',
        details,
      };
    }

    if (exception instanceof QueryFailedError) {
      const driverCode = this.queryDriverCode(exception);
      if (
        driverCode.startsWith('08') ||
        ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P01', '57P02', '57P03'].includes(
          driverCode,
        )
      ) {
        return {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          code: 'DATABASE_UNAVAILABLE',
          message: 'The database dependency is unavailable.',
          details: null,
        };
      }
      if (['3F000', '42P01', '42704'].includes(driverCode)) {
        return {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          code: 'DATABASE_SCHEMA_UNAVAILABLE',
          message: 'The required database schema has not been applied.',
          details: null,
        };
      }
      return {
        statusCode: driverCode.startsWith('23') ? HttpStatus.CONFLICT : HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'DATABASE_OPERATION_FAILED',
        message: 'The persistence operation could not be completed.',
        details: null,
      };
    }

    if (exception instanceof HttpException) {
      return {
        statusCode: exception.getStatus(),
        code: this.httpCode(exception.getStatus()),
        message: exception.message || 'The request could not be processed.',
        details: null,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected server error occurred.',
      details: null,
    };
  }

  private flattenValidation(item: ValidationMessage, prefix = ''): Array<Record<string, string>> {
    const field = prefix ? `${prefix}.${item.property ?? ''}` : (item.property ?? 'request');
    const own = Object.entries(item.constraints ?? {}).map(([type, message]) => ({ field, message, type }));
    const child = (item.children ?? []).flatMap((value) => this.flattenValidation(value, field));
    return [...own, ...child];
  }

  private httpCode(statusCode: number): string {
    return (
      {
        400: 'BAD_REQUEST',
        401: 'AUTHENTICATION_REQUIRED',
        403: 'PERMISSION_DENIED',
        404: 'ROUTE_NOT_FOUND',
        405: 'METHOD_NOT_ALLOWED',
        413: 'PAYLOAD_TOO_LARGE',
        415: 'UNSUPPORTED_MEDIA_TYPE',
        429: 'RATE_LIMITED',
        503: 'SERVICE_UNAVAILABLE',
      }[statusCode] ?? 'HTTP_ERROR'
    );
  }

  private queryDriverCode(exception: QueryFailedError): string {
    const driverError = exception.driverError as { code?: unknown } | undefined;
    return typeof driverError?.code === 'string' ? driverError.code : '';
  }
}
