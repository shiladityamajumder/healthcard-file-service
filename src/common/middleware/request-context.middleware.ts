import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { validate as isUuid, v4 as uuidv4 } from 'uuid';
import type { RequestContext } from '../interfaces/request-context.interface';
import { RequestContextService } from './request-context.service';

function headerValue(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly contextService: RequestContextService,
    private readonly config: ConfigService,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const headers = this.config.getOrThrow<Record<string, string>>('app.headers');
    const incomingRequestId = headerValue(request, headers.requestId);
    const incomingCorrelationId = headerValue(request, headers.correlationId);
    const pinoRequestId = (request as Request & { id?: string }).id;
    const requestId =
      incomingRequestId && isUuid(incomingRequestId)
        ? incomingRequestId
        : pinoRequestId && isUuid(pinoRequestId)
          ? pinoRequestId
          : uuidv4();
    const correlationId =
      incomingCorrelationId && isUuid(incomingCorrelationId) ? incomingCorrelationId : requestId;
    const incomingUserId = headerValue(request, headers.userId);
    const incomingActorId = headerValue(request, headers.actorId);
    const rolesHeader = headerValue(request, headers.roles) ?? '';
    const roles = rolesHeader
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    (request as Request & { requestContext?: RequestContext }).requestContext = {
      requestId,
      correlationId,
      userId: incomingUserId && isUuid(incomingUserId) ? incomingUserId : null,
      actorId: incomingActorId && isUuid(incomingActorId) ? incomingActorId : null,
      roles,
      ipAddress: request.ip || null,
      userAgent: request.get('user-agent') ?? null,
    };

    response.setHeader(headers.requestId, requestId);
    response.setHeader(headers.correlationId, correlationId);
    response.setHeader('X-API-Version', this.config.get<string>('app.apiVersion') ?? 'v1');

    if (incomingRequestId && !isUuid(incomingRequestId)) {
      this.sendInvalidHeader(
        response,
        requestId,
        correlationId,
        'INVALID_REQUEST_ID',
        `${headers.requestId} must be a valid UUID.`,
      );
      return;
    }
    if (incomingCorrelationId && !isUuid(incomingCorrelationId)) {
      this.sendInvalidHeader(
        response,
        requestId,
        correlationId,
        'INVALID_CORRELATION_ID',
        `${headers.correlationId} must be a valid UUID.`,
      );
      return;
    }
    if (incomingUserId && !isUuid(incomingUserId)) {
      this.sendInvalidHeader(
        response,
        requestId,
        correlationId,
        'INVALID_USER_ID',
        `${headers.userId} must be a valid UUID.`,
      );
      return;
    }
    if (incomingActorId && !isUuid(incomingActorId)) {
      this.sendInvalidHeader(
        response,
        requestId,
        correlationId,
        'INVALID_ACTOR_ID',
        `${headers.actorId} must be a valid UUID.`,
      );
      return;
    }
    if (
      rolesHeader.length > 2048 ||
      /[\u0000-\u001f\u007f]/.test(rolesHeader) ||
      roles.length > 100 ||
      roles.some((role) => role.length > 128)
    ) {
      this.sendInvalidHeader(
        response,
        requestId,
        correlationId,
        'INVALID_ROLES_HEADER',
        `${headers.roles} contains invalid or excessive role values.`,
      );
      return;
    }

    this.contextService.run(
      (request as Request & { requestContext: RequestContext }).requestContext,
      next,
    );
  }

  private sendInvalidHeader(
    response: Response,
    requestId: string,
    correlationId: string,
    code: string,
    message: string,
  ): void {
    response.status(400).setHeader('Cache-Control', 'no-store').json({
      success: false,
      data: null,
      error: { code, message, details: null },
      meta: {
        request_id: requestId,
        correlation_id: correlationId,
        api_version: this.config.get<string>('app.apiVersion') ?? 'v1',
        timestamp: new Date().toISOString(),
      },
    });
  }
}
