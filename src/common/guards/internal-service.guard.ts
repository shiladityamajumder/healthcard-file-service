import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AppException } from '../exceptions/app.exception';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('app.internalServiceSecret') ?? '';
    if (!expected) {
      return true;
    }

    const headerName = this.config.getOrThrow<Record<string, string>>('app.headers').internalService;
    const request = context.switchToHttp().getRequest<Request>();
    const supplied = request.headers[headerName];
    const value = Array.isArray(supplied) ? supplied[0] : supplied;
    if (!value || !this.secureEqual(value, expected)) {
      throw new AppException('INTERNAL_SERVICE_AUTH_FAILED', 'Internal service authentication failed.', 401);
    }
    return true;
  }

  private secureEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}
