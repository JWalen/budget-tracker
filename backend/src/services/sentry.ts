import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

export const initSentry = () => {
  if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      
      // Performance Monitoring
      tracesSampleRate: 0.1, // 10% of transactions
      profilesSampleRate: 0.1, // 10% of transactions
      
      integrations: [
        nodeProfilingIntegration(),
        Sentry.httpIntegration({ tracing: true }),
        Sentry.expressIntegration(),
      ],

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
