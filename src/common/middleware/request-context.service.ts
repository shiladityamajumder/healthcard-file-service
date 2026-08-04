import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestContext } from '../interfaces/request-context.interface';

@Injectable()
export class RequestContextService {
  // AsyncLocalStorage keeps trusted request metadata available across async service calls.
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  getRequired(): RequestContext {
    const context = this.get();
    if (!context) {
      throw new Error('Request context is unavailable');
    }
    return context;
  }
}
