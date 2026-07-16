import * as Sentry from '@sentry/node';

// Sentry server-side init. Must be the FIRST import of server/index.ts so the
// SDK is live before any other module can throw. With no SENTRY_DSN (local
// dev, CI, tests) every capture is a silent no-op. tracesSampleRate 0 =
// error monitoring only, no performance tracing. Uncaught exceptions and
// unhandled rejections are captured by the SDK's default integrations.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  sendDefaultPii: false,
  tracesSampleRate: 0,
});
