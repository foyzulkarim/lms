import { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { config } from '../config';

// Custom error classes
export class CourseServiceError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', details?: any) {
    super(message);
    this.name = 'CourseServiceError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends CourseServiceError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends CourseServiceError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends CourseServiceError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends CourseServiceError {
  constructor(message: string = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends CourseServiceError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends CourseServiceError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}

export class ServiceUnavailableError extends CourseServiceError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
    this.name = 'ServiceUnavailableError';
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

    if (error instanceof CourseServiceError) {
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

// Database error handler
export const handleDatabaseError = (error: any): CourseServiceError => {
  logger.error('Database error:', error);

  // Handle specific PostgreSQL errors
  if (error.code) {
    switch (error.code) {
      case '23505': // Unique violation
        return new ConflictError('Resource already exists');
      case '23503': // Foreign key violation
        return new ValidationError('Referenced resource does not exist');
      case '23502': // Not null violation
        return new ValidationError('Required field is missing');
      case '23514': // Check violation
        return new ValidationError('Data constraint violation');
      case '42P01': // Undefined table
        return new ServiceUnavailableError('Database schema error');
      default:
        return new CourseServiceError('Database operation failed');
    }
  }

  return new CourseServiceError('Database operation failed');
};

// External service error handler
export const handleExternalServiceError = (serviceName: string, error: any): CourseServiceError => {
  logger.error(`External service error (${serviceName}):`, error);

  if (error.response?.status) {
    switch (error.response.status) {
      case 400:
        return new ValidationError(`Invalid request to ${serviceName}`);
      case 401:
        return new UnauthorizedError(`Authentication failed with ${serviceName}`);
      case 403:
        return new ForbiddenError(`Access denied by ${serviceName}`);
      case 404:
        return new NotFoundError(`Resource not found in ${serviceName}`);
      case 429:
        return new RateLimitError(`Rate limit exceeded for ${serviceName}`);
      case 500:
      case 502:
      case 503:
      case 504:
        return new ServiceUnavailableError(`${serviceName} is temporarily unavailable`);
      default:
        return new CourseServiceError(`${serviceName} request failed`);
    }
  }

  return new ServiceUnavailableError(`${serviceName} is unavailable`);
};

// File operation error handler
export const handleFileError = (error: any): CourseServiceError => {
  logger.error('File operation error:', error);

  if (error.code) {
    switch (error.code) {
      case 'ENOENT':
        return new NotFoundError('File not found');
      case 'EACCES':
        return new ForbiddenError('File access denied');
      case 'ENOSPC':
        return new ServiceUnavailableError('Insufficient storage space');
      case 'EMFILE':
      case 'ENFILE':
        return new ServiceUnavailableError('Too many open files');
      default:
        return new CourseServiceError('File operation failed');
    }
  }

  return new CourseServiceError('File operation failed');
};

export default {
  errorHandler,
  asyncHandler,
  CourseServiceError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  ServiceUnavailableError,
  createValidationError,
  handleDatabaseError,
  handleExternalServiceError,
  handleFileError,
};
