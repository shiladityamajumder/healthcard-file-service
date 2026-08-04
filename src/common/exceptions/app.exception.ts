import { HttpException } from '@nestjs/common';

export class AppException extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    statusCode: number,
    readonly details: unknown = null,
  ) {
    super({ code, message, details }, statusCode);
  }
}
