import { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { config } from '../config';

// Custom error classes
export class SearchServiceError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', details?: any) {
    super(message);
    this.name = 'SearchServiceError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends SearchServiceError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends SearchServiceError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends SearchServiceError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends SearchServiceError {
  constructor(message: string = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class RateLimitError extends SearchServiceError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}

export class ServiceUnavailableError extends SearchServiceError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
    this.name = 'ServiceUnavailableError';
  }
}

export class SearchEngineError extends SearchServiceError {
  constructor(message: string = 'Search engine error') {
    super(message, 503, 'SEARCH_ENGINE_ERROR');
    this.name = 'SearchEngineError';
  }
}

export class IndexingError extends SearchServiceError {
  constructor(message: string = 'Indexing operation failed') {
    super(message, 500, 'INDEXING_ERROR');
    this.name = 'IndexingError';
  }
}

// Error response interface
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    stack?: string;
  };
  meta: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}

// Generate request ID
const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Error handler plugin
export const errorHandler = async (fastify: FastifyInstance): Promise<void> => {
  // Set error handler
  fastify.setErrorHandler(async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = generateRequestId();
    
    // Log error details
    logger.error('Request error occurred', {
      requestId,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        statusCode: error.statusCode,
      },
      request: {
        method: request.method,
        url: request.url,
        headers: request.headers,
        params: request.params,
        query: request.query,
        userId: (request as any).user?.id,
      },
    });

    // Determine status code and error details
    let statusCode = 500;
    let errorCode = 'INTERNAL_ERROR';
    let errorMessage = 'An internal server error occurred';
    let errorDetails: any = undefined;

    if (error instanceof SearchServiceError) {
      statusCode = error.statusCode;
      errorCode = error.code;
      errorMessage = error.message;
      errorDetails = error.details;
    } else if (error.statusCode) {
      statusCode = error.statusCode;
      
      // Handle specific Fastify errors
      switch (error.statusCode) {
        case 400:
          errorCode = 'BAD_REQUEST';
          errorMessage = error.message || 'Bad request';
          break;
        case 401:
          errorCode = 'UNAUTHORIZED';
          errorMessage = 'Authentication required';
          break;
        case 403:
          errorCode = 'FORBIDDEN';
          errorMessage = 'Access forbidden';
          break;
        case 404:
          errorCode = 'NOT_FOUND';
          errorMessage = 'Resource not found';
          break;
        case 409:
          errorCode = 'CONFLICT';
          errorMessage = error.message || 'Resource conflict';
          break;
        case 422:
          errorCode = 'VALIDATION_ERROR';
          errorMessage = error.message || 'Validation failed';
          errorDetails = (error as any).validation;
          break;
        case 429:
          errorCode = 'RATE_LIMIT_EXCEEDED';
          errorMessage = 'Rate limit exceeded';
          break;
        case 500:
        default:
          errorCode = 'INTERNAL_ERROR';
          errorMessage = config.isDevelopment ? error.message : 'An internal server error occurred';
          break;
      }
    }

    // Handle JWT errors
    if (error.message?.includes('jwt') || error.message?.includes('token')) {
      statusCode = 401;
      errorCode = 'UNAUTHORIZED';
      errorMessage = 'Invalid or expired token';
    }

    // Handle validation errors from TypeBox/Ajv
    if (error.message?.includes('validation') || (error as any).validation) {
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
      errorMessage = 'Request validation failed';
      errorDetails = (error as any).validation;
    }

    // Handle Elasticsearch errors
    if (error.message?.includes('elasticsearch') || error.message?.includes('search')) {
      statusCode = 503;
      errorCode = 'SEARCH_ENGINE_ERROR';
      errorMessage = 'Search service temporarily unavailable';
    }

    // Handle Redis errors
    if (error.message?.includes('redis') || error.message?.includes('cache')) {
      statusCode = 503;
      errorCode = 'CACHE_ERROR';
      errorMessage = 'Cache service temporarily unavailable';
    }

    // Create error response
    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage,
        details: errorDetails,
        ...(config.isDevelopment && { stack: error.stack }),
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        version: '1.0.0',
      },
    };

    // Set response headers
    reply.header('X-Request-ID', requestId);
    reply.header('Content-Type', 'application/json');

    // Send error response
    reply.code(statusCode).send(errorResponse);
  });

  // Handle 404 errors (route not found)
  fastify.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = generateRequestId();
    
    logger.warn('Route not found', {
      requestId,
      method: request.method,
      url: request.url,
      userId: (request as any).user?.id,
    });

    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        version: '1.0.0',
      },
    };

    reply.header('X-Request-ID', requestId);
    reply.code(404).send(errorResponse);
  });
};

// Async error wrapper for route handlers
export const asyncHandler = (handler: Function) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await handler(request, reply);
    } catch (error) {
      // Let the error handler deal with it
      throw error;
    }
  };
};

// Validation error helper
export const createValidationError = (field: string, message: string, value?: any): ValidationError => {
  return new ValidationError(`Validation failed for field '${field}': ${message}`, {
    field,
    message,
    value,
  });
};

// Elasticsearch error handler
export const handleElasticsearchError = (error: any): SearchServiceError => {
  logger.error('Elasticsearch error:', error);

  // Handle specific Elasticsearch errors
  if (error.meta?.statusCode) {
    switch (error.meta.statusCode) {
      case 400:
        return new ValidationError('Invalid search query');
      case 404:
        return new NotFoundError('Index not found');
      case 429:
        return new RateLimitError('Search rate limit exceeded');
      case 503:
        return new ServiceUnavailableError('Elasticsearch cluster unavailable');
      default:
        return new SearchEngineError('Elasticsearch operation failed');
    }
  }

  if (error.message?.includes('timeout')) {
    return new ServiceUnavailableError('Search request timed out');
  }

  if (error.message?.includes('connection')) {
    return new ServiceUnavailableError('Cannot connect to search engine');
  }

  return new SearchEngineError('Search operation failed');
};

// Redis error handler
export const handleRedisError = (error: any): SearchServiceError => {
  logger.error('Redis error:', error);

  if (error.code === 'ECONNREFUSED') {
    return new ServiceUnavailableError('Cache service unavailable');
  }

  if (error.code === 'ETIMEDOUT') {
    return new ServiceUnavailableError('Cache request timed out');
  }

  return new ServiceUnavailableError('Cache operation failed');
};

// Circuit breaker error handler
export const handleCircuitBreakerError = (error: any): SearchServiceError => {
  logger.error('Circuit breaker error:', error);

  if (error.message?.includes('circuit breaker')) {
    return new ServiceUnavailableError('Search service temporarily unavailable due to high error rate');
  }

  return new ServiceUnavailableError('Service temporarily unavailable');
};

export default {
  errorHandler,
  asyncHandler,
  SearchServiceError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  RateLimitError,
  ServiceUnavailableError,
  SearchEngineError,
  IndexingError,
  createValidationError,
  handleElasticsearchError,
  handleRedisError,
  handleCircuitBreakerError,
};
