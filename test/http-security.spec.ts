import express from 'express';
import helmet from 'helmet';
import request from 'supertest';
import { createHelmetOptions } from '../src/config/http-security.config';

const createApp = (nodeEnv: string): express.Express => {
  const app = express();
  app.use(helmet(createHelmetOptions(nodeEnv)));
  app.get('/docs', (_request, response) => response.type('html').send('<html></html>'));
  return app;
};

describe('HTTP security configuration', () => {
  it('does not upgrade Swagger HTTP assets to HTTPS during local development', async () => {
    // Local docs are served over HTTP; production keeps the stricter upgrade directive.
    const response = await request(createApp('development')).get('/docs').expect(200);
    expect(response.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
  });

  it('retains insecure-request upgrades in production', async () => {
    const response = await request(createApp('production')).get('/docs').expect(200);
    expect(response.headers['content-security-policy']).toContain('upgrade-insecure-requests');
  });
});
