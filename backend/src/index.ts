import express from 'express';
import dotenv from 'dotenv';
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
import sharingRoutes from './routes/sharing';
import backupRoutes from './routes/backup';
import backupScheduleRoutes from './routes/backupSchedule';
import payPeriodRoutes from './routes/payPeriods';
import reportsRoutes from './routes/reports';
import accountsRoutes from './routes/accounts';
import adminEmailRoutes from './routes/adminEmail';
import familyRoutes from './routes/family';
import aiRoutes from './routes/ai';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const logger = new LoggerClass('Server');

// Security middleware (order matters!)
app.use(enforceHTTPS); // Check HTTPS first
app.use(helmetConfig);
app.use(securityHeaders); // Additional security headers
app.use(corsConfig);
app.use(cookieParser());
app.use(setCsrfToken);

// Body parsing with reasonable limits
app.use(express.json({ limit: '5mb' })); // Reduced from 50mb
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// Request logging
app.use(requestLogger);

// Apply rate limiting to all API routes
app.use('/api', apiRateLimiter);

// Sanitize all inputs
app.use(sanitizeInput);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/debts', debtRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/import', importRoutes);
app.use('/api/sharing', sharingRoutes);
app.use('/api/backup', backupScheduleRoutes);  // Updated to use new backup system
app.use('/api/pay-periods', payPeriodRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/admin/email', adminEmailRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/ai', aiRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  logger.error('Unhandled error', err, {
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

app.listen(PORT, () => {
  logger.info(`Server started successfully`, {
    port: PORT,
    environment: process.env.NODE_ENV,
    nodeVersion: process.version,
  });
});
