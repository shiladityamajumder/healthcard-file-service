import type { HelmetOptions } from 'helmet';

export const createHelmetOptions = (nodeEnv: string): HelmetOptions => ({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      // Keep HTTPS upgrades in production, but allow Swagger's local HTTP assets in development.
      'upgrade-insecure-requests': nodeEnv === 'production' ? [] : null,
    },
  },
});
