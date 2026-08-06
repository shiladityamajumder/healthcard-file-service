import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Injectable, type NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RequestContextService } from '../middleware/request-context.service';

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  error: null;
  meta: {
    requestId: string | null;
    correlationId: string | null;
    apiVersion: string;
    timestamp: string;
  };
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiSuccessEnvelope<T>> {
  constructor(
    private readonly contextService: RequestContextService,
    private readonly config: ConfigService,
  ) {}

  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessEnvelope<T>> {
    return next.handle().pipe(
      map((data: T) => {
        const requestContext = this.contextService.get();
        // Keep operational IDs in the envelope without exposing dependency credentials or file contents.
        return {
          success: true,
          data,
          error: null,
          meta: {
            requestId: requestContext?.requestId ?? null,
            correlationId: requestContext?.correlationId ?? null,
            apiVersion: this.config.get<string>('app.apiVersion') ?? 'v1',
            timestamp: new Date().toISOString(),
          },
        };
      }),
    );
  }
}
