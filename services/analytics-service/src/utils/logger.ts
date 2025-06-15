import winston from 'winston';
import { env } from '@/config/environment';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const logEntry = {
      timestamp,
      level,
      service: service || 'analytics-service',
      message,
      ...meta,
    };

    // Remove empty fields
    Object.keys(logEntry).forEach(key => {
      if (logEntry[key] === undefined || logEntry[key] === null) {
        delete logEntry[key];
      }
    });

    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss',
  }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0 ? 
      `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} [${service || 'analytics'}] ${level}: ${message}${metaStr}`;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: logFormat,
  defaultMeta: {
    service: 'analytics-service',
    version: process.env.npm_package_version || '1.0.0',
    environment: env.NODE_ENV,
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: env.NODE_ENV === 'development' ? consoleFormat : logFormat,
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false,
});

// Add file transport for production
if (env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    tailable: true,
  }));

  logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 10,
    tailable: true,
  }));
}

// Performance logging utility
export const performanceLogger = {
  start: (operation: string, metadata?: any) => {
    const startTime = Date.now();
    const correlationId = Math.random().toString(36).substring(7);
    
    logger.info('Operation started', {
      operation,
      correlationId,
      startTime,
      ...metadata,
    });

    return {
      correlationId,
      end: (result?: any, error?: Error) => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        if (error) {
          logger.error('Operation failed', {
            operation,
            correlationId,
            duration,
            error: {
              message: error.message,
              stack: error.stack,
              name: error.name,
            },
            ...metadata,
          });
        } else {
          logger.info('Operation completed', {
            operation,
            correlationId,
            duration,
            result: result ? { 
              type: typeof result,
              length: Array.isArray(result) ? result.length : undefined,
            } : undefined,
            ...metadata,
          });
        }

        return duration;
      },
    };
  },
};

// Request logging utility
export const requestLogger = {
  logRequest: (req: any, res: any, duration: number) => {
    const { method, url, headers, query, params, body } = req;
    const { statusCode } = res;
    
    // Remove sensitive information
    const sanitizedHeaders = { ...headers };
    delete sanitizedHeaders.authorization;
    delete sanitizedHeaders.cookie;
    
    const logData = {
      type: 'http_request',
      method,
      url,
      statusCode,
      duration,
      userAgent: headers['user-agent'],
      ip: req.ip || req.connection?.remoteAddress,
      query: Object.keys(query || {}).length > 0 ? query : undefined,
      params: Object.keys(params || {}).length > 0 ? params : undefined,
      bodySize: body ? JSON.stringify(body).length : 0,
      responseSize: res.get('content-length') || 0,
    };

    if (statusCode >= 400) {
      logger.error('HTTP request failed', logData);
    } else if (duration > 1000) {
      logger.warn('Slow HTTP request', logData);
    } else {
      logger.info('HTTP request', logData);
    }
  },

  logError: (req: any, error: Error) => {
    const { method, url, headers, query, params } = req;
    
    logger.error('HTTP request error', {
      type: 'http_error',
      method,
      url,
      query,
      params,
      userAgent: headers['user-agent'],
      ip: req.ip || req.connection?.remoteAddress,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
  },
};

// Database logging utility
export const dbLogger = {
  logQuery: (query: string, bindings?: any[], duration?: number) => {
    logger.debug('Database query', {
      type: 'db_query',
      query: query.replace(/\s+/g, ' ').trim(),
      bindingsCount: bindings?.length || 0,
      duration,
    });
  },

  logTransaction: (operation: string, duration: number, success: boolean) => {
    const logLevel = success ? 'info' : 'error';
    logger.log(logLevel, 'Database transaction', {
      type: 'db_transaction',
      operation,
      duration,
      success,
    });
  },

  logError: (operation: string, error: Error, query?: string) => {
    logger.error('Database error', {
      type: 'db_error',
      operation,
      query: query?.replace(/\s+/g, ' ').trim(),
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
  },
};

// Cache logging utility
export const cacheLogger = {
  logHit: (key: string, ttl?: number) => {
    logger.debug('Cache hit', {
      type: 'cache_hit',
      key,
      ttl,
    });
  },

  logMiss: (key: string) => {
    logger.debug('Cache miss', {
      type: 'cache_miss',
      key,
    });
  },

  logSet: (key: string, ttl?: number, size?: number) => {
    logger.debug('Cache set', {
      type: 'cache_set',
      key,
      ttl,
      size,
    });
  },

  logError: (operation: string, key: string, error: Error) => {
    logger.error('Cache error', {
      type: 'cache_error',
      operation,
      key,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
  },
};

// Event processing logging utility
export const eventLogger = {
  logReceived: (eventType: string, eventId: string, metadata?: any) => {
    logger.info('Event received', {
      type: 'event_received',
      eventType,
      eventId,
      ...metadata,
    });
  },

  logProcessed: (eventType: string, eventId: string, duration: number, metadata?: any) => {
    logger.info('Event processed', {
      type: 'event_processed',
      eventType,
      eventId,
      duration,
      ...metadata,
    });
  },

  logFailed: (eventType: string, eventId: string, error: Error, metadata?: any) => {
    logger.error('Event processing failed', {
      type: 'event_failed',
      eventType,
      eventId,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      ...metadata,
    });
  },

  logRetry: (eventType: string, eventId: string, attempt: number, maxAttempts: number) => {
    logger.warn('Event retry', {
      type: 'event_retry',
      eventType,
      eventId,
      attempt,
      maxAttempts,
    });
  },
};

// Analytics specific logging utility
export const analyticsLogger = {
  logAggregation: (type: string, recordCount: number, duration: number) => {
    logger.info('Analytics aggregation', {
      type: 'analytics_aggregation',
      aggregationType: type,
      recordCount,
      duration,
    });
  },

  logReportGeneration: (reportId: string, reportType: string, status: string, duration?: number) => {
    logger.info('Report generation', {
      type: 'report_generation',
      reportId,
      reportType,
      status,
      duration,
    });
  },

  logMetricsCalculation: (metricType: string, value: number, duration: number) => {
    logger.info('Metrics calculation', {
      type: 'metrics_calculation',
      metricType,
      value,
      duration,
    });
  },
};

// Health check logging
export const healthLogger = {
  logCheck: (component: string, status: 'healthy' | 'unhealthy', details?: any) => {
    const logLevel = status === 'healthy' ? 'debug' : 'error';
    logger.log(logLevel, 'Health check', {
      type: 'health_check',
      component,
      status,
      details,
    });
  },
};

// Export structured logging utilities
export const structuredLog = {
  performance: performanceLogger,
  request: requestLogger,
  db: dbLogger,
  cache: cacheLogger,
  event: eventLogger,
  analytics: analyticsLogger,
  health: healthLogger,
};

export default logger;
