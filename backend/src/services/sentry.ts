import * as Sentry from '@sentry/node';

export const initSentry = () => {
  if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    // Load the profiling integration lazily and defensively: it pulls in a
    // native binding that isn't present on every platform/Node build, and a
    // top-level import would crash the whole app at startup even when Sentry is
    // disabled. If it can't load, run Sentry without CPU profiling.
    const integrations: any[] = [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
    ];
    try {
      const { nodeProfilingIntegration } = require('@sentry/profiling-node');
      integrations.unshift(nodeProfilingIntegration());
    } catch (e) {
      console.warn('Sentry CPU profiling unavailable — continuing without it:', (e as Error).message);
    }

    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,

      // Performance Monitoring
      tracesSampleRate: 0.1, // 10% of transactions
      profilesSampleRate: 0.1, // 10% of transactions

      integrations,

      // Error filtering
      beforeSend(event, hint) {
        // Don't send errors from development
        if (process.env.NODE_ENV === 'development') {
          return null;
        }

        // Filter out known benign errors
        const error = hint.originalException;
        if (error && typeof error === 'object' && 'code' in error) {
          // Ignore client disconnects
          if (error.code === 'ECONNRESET' || error.code === 'EPIPE') {
            return null;
          }
        }

        return event;
      },
    });
  }
};

export const captureException = (error: Error, context?: Record<string, any>) => {
  if (process.env.NODE_ENV === 'production') {
    Sentry.captureException(error, { extra: context });
  } else {
    console.error('Exception:', error, context);
  }
};

export const captureMessage = (message: string, level: Sentry.SeverityLevel = 'info') => {
  if (process.env.NODE_ENV === 'production') {
    Sentry.captureMessage(message, level);
  } else {
    console.log(`[${level}]`, message);
  }
};

export const addBreadcrumb = (breadcrumb: Sentry.Breadcrumb) => {
  Sentry.addBreadcrumb(breadcrumb);
};

export { Sentry };
