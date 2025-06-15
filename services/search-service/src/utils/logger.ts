import winston from 'winston';
import { config } from '@/config/environment';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service, searchId, userId, ...meta }) => {
    const logEntry = {
      timestamp,
      level,
      message,
      service: service || 'search-service',
      ...(searchId && { searchId }),
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
    service: 'search-service'
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

// Enhanced logging methods with search context
export class SearchLogger {
  private baseLogger: winston.Logger;
  
  constructor(logger: winston.Logger) {
    this.baseLogger = logger;
  }
  
  // Search specific logging
  searchPerformed(userId: string | undefined, query: string, searchType: string, totalResults: number, searchTime: number) {
    this.baseLogger.info('Search performed', {
      userId,
      query: query.substring(0, 200), // Truncate long queries
      searchType,
      totalResults,
      searchTime,
      event: 'search_performed'
    });
  }
  
  searchFailed(userId: string | undefined, query: string, searchType: string, error: Error) {
    this.baseLogger.error('Search failed', {
      userId,
      query: query.substring(0, 200),
      searchType,
      error: error.message,
      stack: error.stack,
      event: 'search_failed'
    });
  }
  
  // RAG specific logging
  ragInteraction(userId: string | undefined, question: string, answer: string, confidence: number, sourceCount: number) {
    this.baseLogger.info('RAG interaction', {
      userId,
      question: question.substring(0, 200),
      answerLength: answer.length,
      confidence,
      sourceCount,
      event: 'rag_interaction'
    });
  }
  
  ragFailed(userId: string | undefined, question: string, error: Error) {
    this.baseLogger.error('RAG interaction failed', {
      userId,
      question: question.substring(0, 200),
      error: error.message,
      stack: error.stack,
      event: 'rag_failed'
    });
  }
  
  // Vector search logging
  vectorSearchStarted(searchId: string, vectorDimensions: number, threshold: number) {
    this.baseLogger.info('Vector search started', {
      searchId,
      vectorDimensions,
      threshold,
      event: 'vector_search_started'
    });
  }
  
  vectorSearchCompleted(searchId: string, resultsCount: number, duration: number, averageSimilarity: number) {
    this.baseLogger.info('Vector search completed', {
      searchId,
      resultsCount,
      duration,
      averageSimilarity,
      event: 'vector_search_completed'
    });
  }
  
  vectorSearchFailed(searchId: string, error: Error, vectorDimensions?: number) {
    this.baseLogger.error('Vector search failed', {
      searchId,
      vectorDimensions,
      error: error.message,
      stack: error.stack,
      event: 'vector_search_failed'
    });
  }
  
  // Indexing logging
  indexingStarted(documentId: string, documentType: string, operation: string) {
    this.baseLogger.info('Indexing started', {
      documentId,
      documentType,
      operation,
      event: 'indexing_started'
    });
  }
  
  indexingCompleted(documentId: string, documentType: string, operation: string, duration: number) {
    this.baseLogger.info('Indexing completed', {
      documentId,
      documentType,
      operation,
      duration,
      event: 'indexing_completed'
    });
  }
  
  indexingFailed(documentId: string, documentType: string, operation: string, error: Error) {
    this.baseLogger.error('Indexing failed', {
      documentId,
      documentType,
      operation,
      error: error.message,
      stack: error.stack,
      event: 'indexing_failed'
    });
  }
  
  // Query processing logging
  queryProcessingStarted(searchId: string, originalQuery: string, queryType: string) {
    this.baseLogger.info('Query processing started', {
      searchId,
      originalQuery: originalQuery.substring(0, 200),
      queryType,
      event: 'query_processing_started'
    });
  }
  
  queryExpanded(searchId: string, originalQuery: string, expandedQuery: string) {
    this.baseLogger.info('Query expanded', {
      searchId,
      originalQuery: originalQuery.substring(0, 100),
      expandedQuery: expandedQuery.substring(0, 200),
      event: 'query_expanded'
    });
  }
  
  queryProcessingFailed(searchId: string, originalQuery: string, error: Error) {
    this.baseLogger.error('Query processing failed', {
      searchId,
      originalQuery: originalQuery.substring(0, 200),
      error: error.message,
      stack: error.stack,
      event: 'query_processing_failed'
    });
  }
  
  // Strategy execution logging
  strategyExecutionStarted(searchId: string, strategyName: string) {
    this.baseLogger.info('Strategy execution started', {
      searchId,
      strategyName,
      event: 'strategy_execution_started'
    });
  }
  
  strategyExecutionCompleted(searchId: string, strategyName: string, resultsCount: number, duration: number) {
    this.baseLogger.info('Strategy execution completed', {
      searchId,
      strategyName,
      resultsCount,
      duration,
      event: 'strategy_execution_completed'
    });
  }
  
  strategyExecutionFailed(searchId: string, strategyName: string, error: Error) {
    this.baseLogger.error('Strategy execution failed', {
      searchId,
      strategyName,
      error: error.message,
      stack: error.stack,
      event: 'strategy_execution_failed'
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
  
  // Cache logging
  cacheHit(key: string, operation: string) {
    this.baseLogger.debug('Cache hit', {
      key: key.substring(0, 100),
      operation,
      event: 'cache_hit'
    });
  }
  
  cacheMiss(key: string, operation: string) {
    this.baseLogger.debug('Cache miss', {
      key: key.substring(0, 100),
      operation,
      event: 'cache_miss'
    });
  }
  
  cacheError(key: string, operation: string, error: Error) {
    this.baseLogger.error('Cache error', {
      key: key.substring(0, 100),
      operation,
      error: error.message,
      event: 'cache_error'
    });
  }
  
  // API logging
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
  
  // Analytics logging
  searchAnalytics(data: {
    userId?: string;
    query: string;
    searchType: string;
    totalResults: number;
    clickedResults: number;
    searchTime: number;
    filters?: any;
  }) {
    this.baseLogger.info('Search analytics', {
      ...data,
      query: data.query.substring(0, 200),
      event: 'search_analytics'
    });
  }
  
  // User behavior logging
  resultClicked(userId: string | undefined, searchId: string, resultId: string, resultPosition: number, resultScore: number) {
    this.baseLogger.info('Search result clicked', {
      userId,
      searchId,
      resultId,
      resultPosition,
      resultScore,
      event: 'result_clicked'
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
export const searchLogger = new SearchLogger(logger);

// Export base logger for direct use if needed
export { logger };

// Create request logger middleware
export const createRequestLogger = () => {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    req.requestId = requestId;
    req.logger = searchLogger;
    
    searchLogger.apiRequest(req.method, req.url, req.user?.id, requestId);
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      searchLogger.apiResponse(req.method, req.url, res.statusCode, duration, req.user?.id, requestId);
    });
    
    next();
  };
};
