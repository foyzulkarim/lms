import winston from 'winston';
import { loggingConfig } from '@/config';

// Custom log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Custom colors for log levels
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
};

winston.addColors(logColors);

// Custom format for structured logging
const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, service = 'user-service', ...meta } = info;
    
    const logEntry = {
      timestamp,
      level,
      service,
      message,
      ...meta,
    };

    // Add correlation ID if available
    if (meta.correlationId) {
      logEntry.correlationId = meta.correlationId;
    }

    // Add user context if available
    if (meta.userId) {
      logEntry.userId = meta.userId;
    }

    // Add request context if available
    if (meta.requestId) {
      logEntry.requestId = meta.requestId;
    }

    return JSON.stringify(logEntry);
  })
);

// Simple format for development
const simpleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, service = 'user-service', ...meta } = info;
    
    let logMessage = `${timestamp} [${service}] ${level}: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }
    
    return logMessage;
  })
);

// Create transports array
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: loggingConfig.format === 'json' ? structuredFormat : simpleFormat,
  }),
];

// Add file transport if enabled
if (loggingConfig.fileEnabled) {
  transports.push(
    new winston.transports.File({
      filename: loggingConfig.filePath,
      format: structuredFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  levels: logLevels,
  level: loggingConfig.level,
  format: structuredFormat,
  transports,
  exitOnError: false,
  silent: process.env.NODE_ENV === 'test',
});

// Logger interface for better type safety
interface LoggerContext {
  correlationId?: string;
  userId?: string;
  requestId?: string;
  action?: string;
  resource?: string;
  metadata?: Record<string, any>;
}

class Logger {
  private context: LoggerContext = {};

  // Set context for subsequent log calls
  setContext(context: LoggerContext): Logger {
    this.context = { ...this.context, ...context };
    return this;
  }

  // Clear context
  clearContext(): Logger {
    this.context = {};
    return this;
  }

  // Create a child logger with context
  child(context: LoggerContext): Logger {
    const childLogger = new Logger();
    childLogger.context = { ...this.context, ...context };
    return childLogger;
  }

  // Log methods
  error(message: string, error?: Error | any, meta?: Record<string, any>): void {
    const logMeta = { ...this.context, ...meta };
    
    if (error) {
      if (error instanceof Error) {
        logMeta.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      } else {
        logMeta.error = error;
      }
    }
    
    logger.error(message, logMeta);
  }

  warn(message: string, meta?: Record<string, any>): void {
    logger.warn(message, { ...this.context, ...meta });
  }

  info(message: string, meta?: Record<string, any>): void {
    logger.info(message, { ...this.context, ...meta });
  }

  debug(message: string, meta?: Record<string, any>): void {
    logger.debug(message, { ...this.context, ...meta });
  }

  // Specialized logging methods
  audit(action: string, resource: string, resourceId?: string, changes?: any, meta?: Record<string, any>): void {
    this.info('Audit log', {
      ...meta,
      audit: {
        action,
        resource,
        resourceId,
        changes,
        timestamp: new Date().toISOString(),
      },
    });
  }

  performance(operation: string, duration: number, meta?: Record<string, any>): void {
    this.info('Performance metric', {
      ...meta,
      performance: {
        operation,
        duration,
        timestamp: new Date().toISOString(),
      },
    });
  }

  security(event: string, severity: 'low' | 'medium' | 'high' | 'critical', meta?: Record<string, any>): void {
    this.warn('Security event', {
      ...meta,
      security: {
        event,
        severity,
        timestamp: new Date().toISOString(),
      },
    });
  }

  database(operation: string, table: string, duration?: number, meta?: Record<string, any>): void {
    this.debug('Database operation', {
      ...meta,
      database: {
        operation,
        table,
        duration,
        timestamp: new Date().toISOString(),
      },
    });
  }

  external(service: string, operation: string, duration?: number, success?: boolean, meta?: Record<string, any>): void {
    this.info('External service call', {
      ...meta,
      external: {
        service,
        operation,
        duration,
        success,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // HTTP request logging
  request(method: string, url: string, statusCode: number, duration: number, meta?: Record<string, any>): void {
    const level = statusCode >= 400 ? 'warn' : 'info';
    
    logger[level]('HTTP request', {
      ...this.context,
      ...meta,
      http: {
        method,
        url,
        statusCode,
        duration,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // User activity logging
  userActivity(userId: string, action: string, resource?: string, meta?: Record<string, any>): void {
    this.info('User activity', {
      ...meta,
      userId,
      activity: {
        action,
        resource,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Business logic logging
  business(event: string, data: any, meta?: Record<string, any>): void {
    this.info('Business event', {
      ...meta,
      business: {
        event,
        data,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

// Create and export logger instance
export const log = new Logger();

// Export winston logger for direct access if needed
export { logger as winstonLogger };

// Utility function to create request-scoped logger
export const createRequestLogger = (requestId: string, userId?: string): Logger => {
  return log.child({ requestId, userId });
};

// Utility function to measure execution time
export const measureTime = async <T>(
  operation: string,
  fn: () => Promise<T>,
  logger?: Logger
): Promise<T> => {
  const start = Date.now();
  const logInstance = logger || log;
  
  try {
    const result = await fn();
    const duration = Date.now() - start;
    logInstance.performance(operation, duration);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logInstance.error(`Operation ${operation} failed after ${duration}ms`, error);
    throw error;
  }
};

// Utility function for database operation logging
export const logDatabaseOperation = async <T>(
  operation: string,
  table: string,
  fn: () => Promise<T>,
  logger?: Logger
): Promise<T> => {
  const start = Date.now();
  const logInstance = logger || log;
  
  try {
    const result = await fn();
    const duration = Date.now() - start;
    logInstance.database(operation, table, duration);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logInstance.error(`Database operation ${operation} on ${table} failed after ${duration}ms`, error);
    throw error;
  }
};

// Utility function for external service call logging
export const logExternalCall = async <T>(
  service: string,
  operation: string,
  fn: () => Promise<T>,
  logger?: Logger
): Promise<T> => {
  const start = Date.now();
  const logInstance = logger || log;
  
  try {
    const result = await fn();
    const duration = Date.now() - start;
    logInstance.external(service, operation, duration, true);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logInstance.external(service, operation, duration, false);
    logInstance.error(`External service call to ${service} failed after ${duration}ms`, error);
    throw error;
  }
};

// Error logging helper
export const logError = (error: Error, context?: LoggerContext): void => {
  const logger = context ? log.child(context) : log;
  logger.error('Unhandled error', error);
};

// Graceful shutdown logging
export const logShutdown = (signal: string): void => {
  log.info('Graceful shutdown initiated', { signal });
};

// Startup logging
export const logStartup = (port: number, env: string): void => {
  log.info('User Service started successfully', {
    port,
    environment: env,
    timestamp: new Date().toISOString(),
  });
};

export default log;
