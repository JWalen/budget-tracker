import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

// Format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.uncolorize(),
  winston.format.json()
);

// Create transports
const transports: winston.transport[] = [];

// Console transport (only in development or when LOG_TO_CONSOLE is true)
if (process.env.NODE_ENV === 'development' || process.env.LOG_TO_CONSOLE === 'true') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// File transport for all logs
if (process.env.LOG_TO_FILE !== 'false') {
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: fileFormat,
      level: process.env.LOG_LEVEL || 'info',
    })
  );

  // Error log file
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: fileFormat,
      level: 'error',
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  transports,
});

// Create a stream for Morgan HTTP logging
export const morganStream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Helper class for structured logging
export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  private log(level: string, message: string, meta?: any) {
    const logData: any = {
      context: this.context,
      message,
    };

    if (meta) {
      Object.assign(logData, meta);
    }

    logger.log(level, message, logData);
  }

  debug(message: string, meta?: any) {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: any) {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: any) {
    this.log('warn', message, meta);
  }

  error(message: string, error?: Error | any, meta?: any) {
    const errorMeta = { ...meta };

    if (error instanceof Error) {
      errorMeta.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };
    } else if (error) {
      errorMeta.error = error;
    }

    this.log('error', message, errorMeta);
  }

  http(message: string, meta?: any) {
    this.log('http', message, meta);
  }

  // Log database queries
  query(sql: string, params?: any[], duration?: number) {
    this.debug('Database query', {
      sql: sql.substring(0, 200), // Truncate long queries
      params: params?.map(p => typeof p === 'string' && p.length > 50 ? `${p.substring(0, 50)}...` : p),
      duration: duration ? `${duration}ms` : undefined,
    });
  }

  // Log API requests
  apiRequest(method: string, url: string, statusCode?: number, duration?: number) {
    const level = statusCode && statusCode >= 400 ? 'warn' : 'info';
    this.log(level, `${method} ${url}`, {
      method,
      url,
      statusCode,
      duration: duration ? `${duration}ms` : undefined,
    });
  }

  // Log authentication events
  auth(event: 'login' | 'logout' | 'register' | 'mfa_setup' | 'mfa_verify' | 'password_reset', userId?: number, success?: boolean, meta?: any) {
    const level = success === false ? 'warn' : 'info';
    this.log(level, `Auth event: ${event}`, {
      event,
      userId,
      success,
      ...meta,
    });
  }

  // Log security events
  security(event: string, severity: 'low' | 'medium' | 'high' | 'critical', meta?: any) {
    const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
    this.log(level, `Security event: ${event}`, {
      event,
      severity,
      ...meta,
    });
  }

  // Log performance metrics
  performance(operation: string, duration: number, meta?: any) {
    const level = duration > 5000 ? 'warn' : 'info';
    this.log(level, `Performance: ${operation}`, {
      operation,
      duration: `${duration}ms`,
      slow: duration > 5000,
      ...meta,
    });
  }

  // Log scheduled jobs
  job(name: string, status: 'started' | 'completed' | 'failed', meta?: any) {
    const level = status === 'failed' ? 'error' : 'info';
    this.log(level, `Job ${name} ${status}`, {
      job: name,
      status,
      ...meta,
    });
  }
}

// Export singleton logger for backward compatibility
export default new Logger('App');

// Middleware for request logging
export const requestLogger = (req: any, res: any, next: any) => {
  const start = Date.now();
  const requestLogger = new Logger('HTTP');

  // Log request
  requestLogger.debug(`${req.method} ${req.url}`, {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: req.userId,
  });

  // Capture response
  const originalSend = res.send;
  res.send = function(data: any) {
    const duration = Date.now() - start;

    requestLogger.apiRequest(req.method, req.url, res.statusCode, duration);

    originalSend.call(this, data);
  };

  next();
};

// Global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
  const logger = new Logger('System');
  logger.error('Uncaught Exception', error);
  process.exit(1);
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  const logger = new Logger('System');
  logger.error('Unhandled Rejection', reason as Error, { promise });
});

// Export logger class for creating context-specific loggers
export { Logger as LoggerClass };