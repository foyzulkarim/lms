import { FastifyInstance, FastifyError, FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import { ErrorResponse } from '../types/llm';

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

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429);
  }
}

export class ModelError extends AppError {
  constructor(message: string) {
    super(message, 422);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503);
  }
}

export const errorHandler: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.setErrorHandler(async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.correlationId;
    
    // Handle validation errors
    if (error.validation) {
      const errorResponse: ErrorResponse = {
        error: {
          message: 'Invalid request data',
          type: 'validation_error',
          param: error.validation[0]?.instancePath || undefined,
        },
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
        error: {
          message: 'Invalid or missing authentication token',
          type: 'authentication_error',
        },
      };
      
      return reply.status(401).send(errorResponse);
    }

    if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
      const errorResponse: ErrorResponse = {
        error: {
          message: 'Authentication token expired',
          type: 'authentication_error',
        },
      };
      
      return reply.status(401).send(errorResponse);
    }

    // Handle rate limit errors
    if (error.code === 'FST_TOO_MANY_REQUESTS') {
      const errorResponse: ErrorResponse = {
        error: {
          message: 'Too many requests, please try again later',
          type: 'rate_limit_error',
        },
      };
      
      return reply.status(429).send(errorResponse);
    }

    // Handle custom application errors
    if (error instanceof AppError) {
      const errorResponse: ErrorResponse = {
        error: {
          message: error.message,
          type: error.constructor.name.toLowerCase().replace('error', '_error'),
        },
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

    // Handle Ollama/LLM specific errors
    if (error.message.includes('Ollama')) {
      const errorResponse: ErrorResponse = {
        error: {
          message: 'LLM service error',
          type: 'llm_error',
        },
      };
      
      request.logger.error('LLM service error', {
        error: error.message,
        correlationId,
      });
      
      return reply.status(503).send(errorResponse);
    }

    // Handle timeout errors
    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      const errorResponse: ErrorResponse = {
        error: {
          message: 'Request timeout',
          type: 'timeout_error',
        },
      };
      
      return reply.status(408).send(errorResponse);
    }

    // Handle unexpected errors
    const errorResponse: ErrorResponse = {
      error: {
        message: 'An unexpected error occurred',
        type: 'internal_error',
      },
    };
    
    request.logger.error('Unexpected error', {
      error: error.message,
      stack: error.stack,
      correlationId,
    });
    
    return reply.status(500).send(errorResponse);
  });
};
