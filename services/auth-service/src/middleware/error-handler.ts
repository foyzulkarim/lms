import { FastifyInstance, FastifyError, FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import { ErrorResponse } from '../types/auth';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429);
  }
}

export const errorHandler: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.setErrorHandler(async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.correlationId;
    
    // Handle validation errors
    if (error.validation) {
      const errorResponse: ErrorResponse = {
        error: 'Validation Error',
        message: 'Invalid request data',
        statusCode: 400,
        correlationId,
      };
      
      request.logger.warn('Validation error', {
        error: error.message,
        validation: error.validation,
        correlationId,
      });
      
      return reply.status(400).send(errorResponse);
    }

    // Handle JWT errors
    if (error.code === 'FST_JWT_BAD_REQUEST' || error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
      const errorResponse: ErrorResponse = {
        error: 'Authentication Error',
        message: 'Invalid or missing authentication token',
        statusCode: 401,
        correlationId,
      };
      
      return reply.status(401).send(errorResponse);
    }

    if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
      const errorResponse: ErrorResponse = {
        error: 'Authentication Error',
        message: 'Authentication token expired',
        statusCode: 401,
        correlationId,
      };
      
      return reply.status(401).send(errorResponse);
    }

    // Handle rate limit errors
    if (error.code === 'FST_TOO_MANY_REQUESTS') {
      const errorResponse: ErrorResponse = {
        error: 'Rate Limit Error',
        message: 'Too many requests, please try again later',
        statusCode: 429,
        correlationId,
      };
      
      return reply.status(429).send(errorResponse);
    }

    // Handle custom application errors
    if (error instanceof AppError) {
      const errorResponse: ErrorResponse = {
        error: error.constructor.name,
        message: error.message,
        statusCode: error.statusCode,
        correlationId,
      };
      
      if (error.statusCode >= 500) {
        request.logger.error('Application error', {
          error: error.message,
          stack: error.stack,
          correlationId,
        });
      } else {
        request.logger.warn('Application error', {
          error: error.message,
          correlationId,
        });
      }
      
      return reply.status(error.statusCode).send(errorResponse);
    }

    // Handle database errors
    if (error.code === '23505') { // PostgreSQL unique violation
      const errorResponse: ErrorResponse = {
        error: 'Conflict Error',
        message: 'Resource already exists',
        statusCode: 409,
        correlationId,
      };
      
      return reply.status(409).send(errorResponse);
    }

    if (error.code === '23503') { // PostgreSQL foreign key violation
      const errorResponse: ErrorResponse = {
        error: 'Validation Error',
        message: 'Invalid reference to related resource',
        statusCode: 400,
        correlationId,
      };
      
      return reply.status(400).send(errorResponse);
    }

    // Handle unexpected errors
    const errorResponse: ErrorResponse = {
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      statusCode: 500,
      correlationId,
    };
    
    request.logger.error('Unexpected error', {
      error: error.message,
      stack: error.stack,
      correlationId,
    });
    
    return reply.status(500).send(errorResponse);
  });
};
