import winston from 'winston';
import { getServerConfig } from '@/config/env';

// Custom log levels
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue',
  },
};

// Add colors to winston
winston.addColors(customLevels.colors);

// Custom format for file service logs
const fileServiceFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, service = 'file-service', ...meta } = info;
    
    const logEntry = {
      timestamp,
      level,
      service,
      message,
      ...meta,
    };

    // Add correlation ID if present
    if (meta.correlationId) {
      logEntry.correlationId = meta.correlationId;
    }

    // Add user context if present
    if (meta.userId) {
      logEntry.userId = meta.userId;
    }

    // Add file context if present
    if (meta.fileId) {
      logEntry.fileId = meta.fileId;
    }

    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, service = 'file-service', ...meta } = info;
    
    let logMessage = `${timestamp} [${service}] ${level}: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }
    
    return logMessage;
  })
);

// Create logger instance
function createLogger() {
  const config = getServerConfig();
  const isDevelopment = config.nodeEnv === 'development';
  
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: isDevelopment ? consoleFormat : fileServiceFormat,
    }),
  ];

  // Add file transports in production
  if (!isDevelopment) {
    transports.push(
      new winston.transports.File({
        filename: 'logs/file-service-error.log',
        level: 'error',
        format: fileServiceFormat,
        maxsize: 10485760, // 10MB
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: 'logs/file-service-combined.log',
        format: fileServiceFormat,
        maxsize: 10485760, // 10MB
        maxFiles: 5,
      })
    );
  }

  return winston.createLogger({
    levels: customLevels.levels,
    level: config.logLevel,
    format: fileServiceFormat,
    transports,
    exitOnError: false,
  });
}

export const logger = createLogger();

// File service specific logging methods
export class FileServiceLogger {
  private static addFileContext(meta: any, fileId?: string, userId?: string) {
    return {
      ...meta,
      ...(fileId && { fileId }),
      ...(userId && { userId }),
      service: 'file-service',
    };
  }

  static logFileUpload(fileId: string, userId: string, fileName: string, size: number, mimeType: string) {
    logger.info('File upload initiated', this.addFileContext({
      fileName,
      size,
      mimeType,
      action: 'upload_initiated',
    }, fileId, userId));
  }

  static logFileUploadComplete(fileId: string, userId: string, fileName: string, duration: number) {
    logger.info('File upload completed', this.addFileContext({
      fileName,
      duration,
      action: 'upload_completed',
    }, fileId, userId));
  }

  static logFileUploadError(fileId: string, userId: string, fileName: string, error: Error) {
    logger.error('File upload failed', this.addFileContext({
      fileName,
      error: error.message,
      stack: error.stack,
      action: 'upload_failed',
    }, fileId, userId));
  }

  static logFileDownload(fileId: string, userId: string, fileName: string, variant?: string) {
    logger.info('File download requested', this.addFileContext({
      fileName,
      variant,
      action: 'download_requested',
    }, fileId, userId));
  }

  static logFileProcessingStart(fileId: string, jobType: string) {
    logger.info('File processing started', this.addFileContext({
      jobType,
      action: 'processing_started',
    }, fileId));
  }

  static logFileProcessingComplete(fileId: string, jobType: string, duration: number) {
    logger.info('File processing completed', this.addFileContext({
      jobType,
      duration,
      action: 'processing_completed',
    }, fileId));
  }

  static logFileProcessingError(fileId: string, jobType: string, error: Error) {
    logger.error('File processing failed', this.addFileContext({
      jobType,
      error: error.message,
      stack: error.stack,
      action: 'processing_failed',
    }, fileId));
  }

  static logStorageOperation(operation: string, path: string, success: boolean, duration?: number, error?: Error) {
    const level = success ? 'info' : 'error';
    const message = `Storage ${operation} ${success ? 'succeeded' : 'failed'}`;
    
    logger[level](message, {
      operation,
      path,
      success,
      duration,
      ...(error && { error: error.message, stack: error.stack }),
      action: 'storage_operation',
      service: 'file-service',
    });
  }

  static logCacheOperation(operation: string, key: string, hit: boolean, duration?: number) {
    logger.debug('Cache operation', {
      operation,
      key,
      hit,
      duration,
      action: 'cache_operation',
      service: 'file-service',
    });
  }

  static logSecurityEvent(event: string, userId: string, details: any) {
    logger.warn('Security event', {
      event,
      userId,
      details,
      action: 'security_event',
      service: 'file-service',
    });
  }

  static logPerformanceMetric(metric: string, value: number, unit: string, context?: any) {
    logger.info('Performance metric', {
      metric,
      value,
      unit,
      context,
      action: 'performance_metric',
      service: 'file-service',
    });
  }

  static logHealthCheck(component: string, status: 'healthy' | 'unhealthy', responseTime?: number, error?: string) {
    const level = status === 'healthy' ? 'debug' : 'warn';
    
    logger[level](`Health check: ${component}`, {
      component,
      status,
      responseTime,
      error,
      action: 'health_check',
      service: 'file-service',
    });
  }
}

// Request correlation middleware helper
export function generateCorrelationId(): string {
  return `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Error logging helper
export function logError(error: Error, context?: any) {
  logger.error(error.message, {
    error: error.message,
    stack: error.stack,
    context,
    service: 'file-service',
  });
}

// Performance timing helper
export class PerformanceTimer {
  private startTime: number;
  private operation: string;

  constructor(operation: string) {
    this.operation = operation;
    this.startTime = Date.now();
  }

  end(context?: any) {
    const duration = Date.now() - this.startTime;
    FileServiceLogger.logPerformanceMetric(
      `${this.operation}_duration`,
      duration,
      'ms',
      context
    );
    return duration;
  }
}

export default logger;
