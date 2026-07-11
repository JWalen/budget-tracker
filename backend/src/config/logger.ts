import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }),
];

// Add file logging only when enabled AND the logs directory is writable. In the
// packaged desktop app the working directory is "/" (read-only) and LOG_TO_FILE
// is off, so unconditionally creating a DailyRotateFile at ./logs crashed the
// backend on launch with EROFS. Guard it so a read-only/off environment simply
// logs to the console.
if (process.env.LOG_TO_FILE !== 'false') {
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    transports.push(
      new DailyRotateFile({
        filename: path.join(logsDir, 'application-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '14d',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      })
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('File logging disabled (logs dir not writable):', (e as Error).message);
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports,
});

export default logger;