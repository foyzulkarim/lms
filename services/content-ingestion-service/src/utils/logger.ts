import winston from 'winston';
import { config } from '@/config/environment';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service, contentId, jobId, userId, ...meta }) => {
    const logEntry = {
      timestamp,
      level,
      message,
      service: service || 'content-ingestion-service',
      ...(contentId && { contentId }),
      ...(jobId && { jobId }),
      ...(userId && { userId }),
      ...meta
    };
    return JSON.stringify(logEntry);
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: logFormat,
  defaultMeta: {
    service: 'content-ingestion-service'
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ],
  
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' })
  ],
  
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' })
  ]
});

// Enhanced logging methods with context
export class ContentIngestionLogger {
  private baseLogger: winston.Logger;
  
  constructor(logger: winston.Logger) {
    this.baseLogger = logger;
  }
  
  // Content processing specific logging
  contentProcessingStarted(contentId: string, sourceType: string, userId?: string) {
    this.baseLogger.info('Content processing started', {
      contentId,
      sourceType,
      userId,
      event: 'content_processing_started'
    });
  }
  
  contentProcessingCompleted(contentId: string, duration: number, chunksCreated: number, userId?: string) {
    this.baseLogger.info('Content processing completed', {
      contentId,
      duration,
      chunksCreated,
      userId,
      event: 'content_processing_completed'
    });
  }
  
  contentProcessingFailed(contentId: string, error: Error, userId?: string) {
    this.baseLogger.error('Content processing failed', {
      contentId,
      error: error.message,
      stack: error.stack,
      userId,
      event: 'content_processing_failed'
    });
  }
  
  // Extraction specific logging
  extractionStarted(contentId: string, method: string, sourceType: string) {
    this.baseLogger.info('Content extraction started', {
      contentId,
      method,
      sourceType,
      event: 'extraction_started'
    });
  }
  
  extractionCompleted(contentId: string, method: string, duration: number, confidence: number) {
    this.baseLogger.info('Content extraction completed', {
      contentId,
      method,
      duration,
      confidence,
      event: 'extraction_completed'
    });
  }
  
  extractionFailed(contentId: string, method: string, error: Error) {
    this.baseLogger.error('Content extraction failed', {
      contentId,
      method,
      error: error.message,
      stack: error.stack,
      event: 'extraction_failed'
    });
  }
  
  // Chunking specific logging
  chunkingStarted(contentId: string, contentLength: number) {
    this.baseLogger.info('Content chunking started', {
      contentId,
      contentLength,
      event: 'chunking_started'
    });
  }
  
  chunkingCompleted(contentId: string, chunksCreated: number, totalTokens: number) {
    this.baseLogger.info('Content chunking completed', {
      contentId,
      chunksCreated,
      totalTokens,
      event: 'chunking_completed'
    });
  }
  
  // Embedding specific logging
  embeddingStarted(contentId: string, chunkCount: number, model: string) {
    this.baseLogger.info('Embedding generation started', {
      contentId,
      chunkCount,
      model,
      event: 'embedding_started'
    });
  }
  
  embeddingCompleted(contentId: string, embeddingsGenerated: number, duration: number) {
    this.baseLogger.info('Embedding generation completed', {
      contentId,
      embeddingsGenerated,
      duration,
      event: 'embedding_completed'
    });
  }
  
  embeddingFailed(contentId: string, error: Error, chunkIds?: string[]) {
    this.baseLogger.error('Embedding generation failed', {
      contentId,
      error: error.message,
      stack: error.stack,
      chunkIds,
      event: 'embedding_failed'
    });
  }
  
  // Job specific logging
  jobStarted(jobId: string, jobType: string, contentId?: string) {
    this.baseLogger.info('Job started', {
      jobId,
      jobType,
      contentId,
      event: 'job_started'
    });
  }
  
  jobCompleted(jobId: string, jobType: string, duration: number, contentId?: string) {
    this.baseLogger.info('Job completed', {
      jobId,
      jobType,
      duration,
      contentId,
      event: 'job_completed'
    });
  }
  
  jobFailed(jobId: string, jobType: string, error: Error, attempt: number, contentId?: string) {
    this.baseLogger.error('Job failed', {
      jobId,
      jobType,
      error: error.message,
      stack: error.stack,
      attempt,
      contentId,
      event: 'job_failed'
    });
  }
  
  jobRetry(jobId: string, jobType: string, attempt: number, nextRetryAt: Date, contentId?: string) {
    this.baseLogger.warn('Job retry scheduled', {
      jobId,
      jobType,
      attempt,
      nextRetryAt,
      contentId,
      event: 'job_retry'
    });
  }
  
  // API specific logging
  apiRequest(method: string, path: string, userId?: string, requestId?: string) {
    this.baseLogger.info('API request', {
      method,
      path,
      userId,
      requestId,
      event: 'api_request'
    });
  }
  
  apiResponse(method: string, path: string, statusCode: number, duration: number, userId?: string, requestId?: string) {
    this.baseLogger.info('API response', {
      method,
      path,
      statusCode,
      duration,
      userId,
      requestId,
      event: 'api_response'
    });
  }
  
  apiError(method: string, path: string, error: Error, userId?: string, requestId?: string) {
    this.baseLogger.error('API error', {
      method,
      path,
      error: error.message,
      stack: error.stack,
      userId,
      requestId,
      event: 'api_error'
    });
  }
  
  // External service logging
  externalServiceCall(service: string, operation: string, duration?: number) {
    this.baseLogger.info('External service call', {
      service,
      operation,
      duration,
      event: 'external_service_call'
    });
  }
  
  externalServiceError(service: string, operation: string, error: Error) {
    this.baseLogger.error('External service error', {
      service,
      operation,
      error: error.message,
      stack: error.stack,
      event: 'external_service_error'
    });
  }
  
  // Database logging
  databaseQuery(query: string, duration: number, table?: string) {
    this.baseLogger.debug('Database query', {
      query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      duration,
      table,
      event: 'database_query'
    });
  }
  
  databaseError(query: string, error: Error, table?: string) {
    this.baseLogger.error('Database error', {
      query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      error: error.message,
      table,
      event: 'database_error'
    });
  }
  
  // Performance logging
  performanceMetric(metric: string, value: number, unit: string, tags?: Record<string, string>) {
    this.baseLogger.info('Performance metric', {
      metric,
      value,
      unit,
      tags,
      event: 'performance_metric'
    });
  }
  
  // Security logging
  securityEvent(event: string, userId?: string, details?: Record<string, any>) {
    this.baseLogger.warn('Security event', {
      securityEvent: event,
      userId,
      details,
      event: 'security_event'
    });
  }
  
  // Generic logging methods
  info(message: string, meta?: Record<string, any>) {
    this.baseLogger.info(message, meta);
  }
  
  warn(message: string, meta?: Record<string, any>) {
    this.baseLogger.warn(message, meta);
  }
  
  error(message: string, error?: Error, meta?: Record<string, any>) {
    this.baseLogger.error(message, {
      error: error?.message,
      stack: error?.stack,
      ...meta
    });
  }
  
  debug(message: string, meta?: Record<string, any>) {
    this.baseLogger.debug(message, meta);
  }
}

// Create and export logger instance
export const contentLogger = new ContentIngestionLogger(logger);

// Export base logger for direct use if needed
export { logger };

// Create request logger middleware
export const createRequestLogger = () => {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    req.requestId = requestId;
    req.logger = contentLogger;
    
    contentLogger.apiRequest(req.method, req.url, req.user?.id, requestId);
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      contentLogger.apiResponse(req.method, req.url, res.statusCode, duration, req.user?.id, requestId);
    });
    
    next();
  };
};
