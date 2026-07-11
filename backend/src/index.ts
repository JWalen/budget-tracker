import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import {
  corsConfig,
  helmetConfig,
  apiRateLimiter,
  sanitizeInput,
  setCsrfToken,
  enforceHTTPS,
  securityHeaders
} from './middleware/security';
import { LoggerClass, requestLogger } from './services/logger';
import pool, { query } from './config/database';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import transactionRoutes from './routes/transactions';
import budgetRoutes from './routes/budgets';
import categoryRoutes from './routes/categories';
import recurringRoutes from './routes/recurring';
import dashboardRoutes from './routes/dashboard';
import adminRoutes from './routes/admin';
import debtRoutes from './routes/debts';
import billRoutes from './routes/bills';
import importRoutes from './routes/import';
import backupRoutes from './routes/backup';
import backupScheduleRoutes from './routes/backupSchedule';
import payPeriodRoutes from './routes/payPeriods';
import reportsRoutes from './routes/reports';
import accountsRoutes from './routes/accounts';
import adminEmailRoutes from './routes/adminEmail';
import familyRoutes from './routes/family';
import aiRoutes from './routes/ai';
import AIAssistant from './services/aiAssistant';
import { mapPgError } from './utils/apiError';
import organizationRoutes from './routes/organizations';
import analyticsRoutes from './routes/analytics';
import receiptsRoutes from './routes/receipts';
import budgetTemplatesRoutes from './routes/budgetTemplates';
import currencyRoutes from './routes/currency';
import notificationsRoutes from './routes/notifications';
import sharingRoutes from './routes/sharing';
import { apiLimiter, authLimiter, transactionLimiter, uploadLimiter, exportLimiter } from './middleware/rateLimiter';
import { initStorage } from './services/storage';
import { runMigrations } from './config/runMigrations';

// Swagger API documentation
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';

// Load environment variables
dotenv.config();

const logger = new LoggerClass('Server');

// Initialize Sentry for error tracking
import { initSentry } from './services/sentry';
initSentry();

// Initialize Redis for caching
import { initRedis } from './services/redis';
initRedis();

// Validate required environment variables
function validateEnvironment() {
  const required = {
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    logger.error(`❌ FATAL: Missing required environment variables: ${missing.join(', ')}`);
    logger.error('Please set these variables in your .env file or environment');
    process.exit(1);
  }

  // Check for insecure development defaults in production
  if (process.env.NODE_ENV === 'production') {
    const insecurePatterns = ['dev-', 'change_this', 'change-this', 'do-not-use-in-production'];
    const insecure = Object.entries(required)
      .filter(([, value]) => insecurePatterns.some(pattern => value?.includes(pattern)))
      .map(([key]) => key);

    if (insecure.length > 0) {
      logger.error(`❌ FATAL: Insecure development defaults detected in production: ${insecure.join(', ')}`);
      logger.error('Please generate proper production secrets');
      process.exit(1);
    }

    // Validate secret strength (minimum 32 characters for production)
    const weakSecrets = Object.entries(required)
      .filter(([, value]) => value && value.length < 32)
      .map(([key]) => key);

    if (weakSecrets.length > 0) {
      logger.error(`❌ FATAL: Weak secrets detected in production (< 32 chars): ${weakSecrets.join(', ')}`);
      logger.error('Generate strong secrets using: openssl rand -hex 32');
      process.exit(1);
    }
  }

  logger.info('✅ Environment validation passed');
}

validateEnvironment();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

// Security middleware (order matters!)
app.use(helmet()); // Security headers
app.use(compression()); // Gzip compression
app.use(enforceHTTPS); // Check HTTPS first
app.use(helmetConfig);
app.use(securityHeaders); // Additional security headers
app.use(corsConfig);
app.use(cookieParser());
app.use(setCsrfToken);

// Body parsing with reasonable limits
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// Request logging
app.use(requestLogger);

// Apply rate limiting to all API routes
app.use('/api', apiRateLimiter);

// Sanitize all inputs
app.use(sanitizeInput);

// Routes
// Strict brute-force protection on credential submission only. Do NOT apply it
// to the whole /api/auth router — that would throttle /auth/me and /auth/refresh
// (which the SPA calls on every load), locking legitimate users out. Those still
// fall under the general apiRateLimiter mounted on /api.
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionLimiter, transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/debts', debtRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/import', importRoutes);
// backupRoutes (SQL export / restore / admin) is mounted first so its /export,
// /restore and /admin/* handlers take precedence; backupScheduleRoutes then
// serves the scheduling endpoints (/history, /schedules, /config, /create,
// /download-now, /:id/download).
app.use('/api/backup', backupRoutes);
app.use('/api/backup', backupScheduleRoutes);
app.use('/api/pay-periods', payPeriodRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/admin/email', adminEmailRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/receipts', uploadLimiter, receiptsRoutes); // Rate limit file uploads
app.use('/api/budget-templates', budgetTemplatesRoutes);
app.use('/api/currency', currencyRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/sharing', sharingRoutes);

// NOTE: Uploaded receipt files are NOT served via a public static mount (that
// exposed financial PII with no auth). They are served through the authenticated,
// ownership-checked route GET /api/receipts/:id/file instead.

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Budget Tracker API Docs',
}));

// Health check
app.get('/api/health', async (req, res) => {
  const checks: any = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: 'unknown',
    ai: 'unknown',
  };

  try {
    // Check database connectivity
    const dbStart = Date.now();
    await query('SELECT 1');
    checks.database = 'connected';
    checks.databaseResponseTime = `${Date.now() - dbStart}ms`;
  } catch (error) {
    checks.database = 'disconnected';
    checks.status = 'degraded';
    logger.error('Health check: Database connection failed', error as Error);
  }

  // Check AI provider availability (enabled + API key configured).
  // Not critical to overall health — never degrades status.
  try {
    checks.ai = (await AIAssistant.isAvailable()) ? 'configured' : 'disabled';
  } catch (error) {
    checks.ai = 'disabled';
  }

  const statusCode = checks.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(checks);
});

// Readiness probe for Kubernetes/container orchestration
app.get('/api/ready', async (req, res) => {
  try {
    await query('SELECT 1');
    res.status(200).json({ ready: true });
  } catch (error) {
    logger.error('Readiness check failed', error as Error);
    res.status(503).json({ ready: false, error: 'Database not ready' });
  }
});

// JSON 404 for unmatched API routes (otherwise Express returns an HTML page the
// frontend can't parse, collapsing to a generic "Request failed").
app.use('/api', (req: any, res: any) => {
  res.status(404).json({
    error: `No such endpoint: ${req.method} ${req.originalUrl}`,
    ...(req.requestId ? { requestId: req.requestId } : {}),
  });
});

// Global error handler — catches anything thrown/propagated out of a route.
app.use((err: any, req: any, res: any, next: any) => {
  logger.error('Unhandled error', err, {
    requestId: req.requestId,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  // Multer (file upload) errors have friendly, specific messages worth surfacing.
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File is too large. Please upload a file under 10 MB.', requestId: req.requestId });
  }

  // Recognized database constraint errors -> actionable 4xx.
  const mapped = mapPgError(err);
  if (mapped) {
    return res.status(mapped.status).json({ error: mapped.message, requestId: req.requestId });
  }

  res.status(err.status || 500).json({
    // In production, don't leak internals — but still give the user a request id
    // to quote to support, and the raw message in non-production for debugging.
    error: process.env.NODE_ENV === 'production'
      ? 'Something went wrong on our end. Please try again.'
      : (err?.message || 'Internal server error'),
    ...(req.requestId ? { requestId: req.requestId } : {}),
  });
});

async function start() {
  try {
    // Ensure the database schema is present/up to date before serving traffic.
    await runMigrations();
  } catch (error) {
    logger.error('Database schema bootstrap failed — refusing to start', error as Error);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info(`Server started successfully`, {
      port: PORT,
      environment: process.env.NODE_ENV,
      nodeVersion: process.version,
    });
  });

  // Graceful shutdown: stop accepting new connections, let in-flight requests
  // finish, close the DB pool, then exit. A hard timeout guards against hangs.
  // Without this, every deploy SIGKILLs mid-request after the orchestrator's grace period.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received — draining connections`);
    const forced = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
    forced.unref();

    server.close(async () => {
      try {
        await pool.end();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown', err as Error);
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
