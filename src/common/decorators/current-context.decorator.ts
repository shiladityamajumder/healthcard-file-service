import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestContext } from '../interfaces/request-context.interface';

export const CurrentContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestContext => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { requestContext?: RequestContext }>();
    const value = request.requestContext;
    if (!value) {
      throw new Error('Request context was not attached');
    }
    return value;
  },
);
