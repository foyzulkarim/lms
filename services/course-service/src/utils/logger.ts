import winston from 'winston';
import { config } from '../config';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const logEntry = {
      timestamp,
      level,
      message,
      service: 'course-service',
      ...meta,
    };

    if (config.logging.format === 'json') {
      return JSON.stringify(logEntry);
    }

    // Simple format for development
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} [${level.toUpperCase()}] ${message} ${metaStr}`;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: {
    service: 'course-service',
    version: '1.0.0',
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: config.isDevelopment
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        : logFormat,
    }),
  ],
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.Console(),
  ],
  rejectionHandlers: [
    new winston.transports.Console(),
  ],
});

// Add file transport in production
if (config.isProduction) {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );

  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create request logger middleware
export const createRequestLogger = () => {
  return (request: any, reply: any, done: any) => {
    const start = Date.now();
    
    reply.addHook('onSend', (request: any, reply: any, payload: any, done: any) => {
      const duration = Date.now() - start;
      
      logger.info('HTTP Request', {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        duration: `${duration}ms`,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
        userId: request.user?.id,
      });
      
      done();
    });
    
    done();
  };
};

// Utility functions for structured logging
export const logError = (message: string, error: Error, meta?: Record<string, any>) => {
  logger.error(message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...meta,
  });
};

export const logInfo = (message: string, meta?: Record<string, any>) => {
  logger.info(message, meta);
};

export const logWarn = (message: string, meta?: Record<string, any>) => {
  logger.warn(message, meta);
};

export const logDebug = (message: string, meta?: Record<string, any>) => {
  logger.debug(message, meta);
};

// Performance logging
export const logPerformance = (operation: string, duration: number, meta?: Record<string, any>) => {
  logger.info(`Performance: ${operation}`, {
    duration: `${duration}ms`,
    operation,
    ...meta,
  });
};

// Database query logging
export const logQuery = (query: string, duration: number, meta?: Record<string, any>) => {
  if (config.isDevelopment) {
    logger.debug('Database Query', {
      query,
      duration: `${duration}ms`,
      ...meta,
    });
  }
};

// Event logging
export const logEvent = (eventType: string, eventData: Record<string, any>) => {
  logger.info(`Event: ${eventType}`, {
    eventType,
    ...eventData,
  });
};

export default logger;
