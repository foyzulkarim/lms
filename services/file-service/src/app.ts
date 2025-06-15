import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { loadConfig, getServerConfig, getSecurityConfig } from '@/config/env';
import { initializeDatabase } from '@/database/connection';
import { logger, FileServiceLogger, generateCorrelationId } from '@/utils/logger';
import { 
  FileServiceError, 
  ValidationError, 
  AuthenticationError, 
  AuthorizationError, 
  NotFoundError, 
  StorageError, 
  ProcessingError 
} from '@/types';

// Import routes
import { uploadRoutes } from '@/routes/upload';
import { fileRoutes } from '@/routes/files';
import { adminRoutes } from '@/routes/admin';
import { healthRoutes } from '@/routes/health';

export async function createApp(): Promise<FastifyInstance> {
  // Load configuration
  const config = loadConfig();
  const serverConfig = getServerConfig();
  const securityConfig = getSecurityConfig();

  // Create Fastify instance
  const app = Fastify({
    logger: {
      level: serverConfig.logLevel,
      serializers: {
        req: (req) => ({
          method: req.method,
          url: req.url,
          headers: req.headers,
          hostname: req.hostname,
          remoteAddress: req.ip,
          remotePort: req.socket?.remotePort
        }),
        res: (res) => ({
          statusCode: res.statusCode,
          headers: res.getHeaders()
        })
      }
    },
    trustProxy: true,
    bodyLimit: securityConfig.maxFileSize,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId'
  });

  // Register plugins
  await registerPlugins(app, securityConfig);

  // Add middleware
  await addMiddleware(app);

  // Register routes
  await registerRoutes(app);

  // Add error handling
  addErrorHandling(app);

  return app;
}

async function registerPlugins(app: FastifyInstance, securityConfig: any) {
  // CORS
  await app.register(cors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      
      // In production, you'd have a whitelist of allowed origins
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
      
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      FileServiceLogger.logSecurityEvent('cors_violation', 'anonymous', { origin });
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID']
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false // Allow file downloads
  });

  // Multipart support for file uploads
  await app.register(multipart, {
    limits: {
      fieldNameSize: 100,
      fieldSize: 100,
      fields: 10,
      fileSize: securityConfig.maxFileSize,
      files: 10,
      headerPairs: 2000
    },
    attachFieldsToBody: true
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: securityConfig.rateLimits.upload,
    timeWindow: securityConfig.rateLimits.windowMs,
    keyGenerator: (request) => {
      // Rate limit by user ID if authenticated, otherwise by IP
      return request.auth?.userId || request.ip;
    },
    errorResponseBuilder: (request, context) => {
      FileServiceLogger.logSecurityEvent('rate_limit_exceeded', 
        request.auth?.userId || 'anonymous', 
        { 
          ip: request.ip, 
          limit: context.max, 
          window: context.timeWindow 
        }
      );
      
      return {
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Max ${context.max} requests per ${context.timeWindow / 1000} seconds.`,
        statusCode: 429,
        retryAfter: Math.round(context.timeWindow / 1000)
      };
    }
  });

  // Swagger documentation
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'LMS File Service API',
        description: 'File storage and processing service for the LMS platform',
        version: '1.0.0',
        contact: {
          name: 'LMS Team',
          email: 'dev@lms.com'
        }
      },
      servers: [
        {
          url: `http://localhost:${serverConfig.port}`,
          description: 'Development server'
        }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      },
      security: [
        {
          bearerAuth: []
        }
      ],
      tags: [
        { name: 'Upload', description: 'File upload operations' },
        { name: 'Files', description: 'File management operations' },
        { name: 'Admin', description: 'Administrative operations' },
        { name: 'Health', description: 'Health check endpoints' }
      ]
    }
  });

  // Swagger UI
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    transformSpecification: (swaggerObject) => {
      return swaggerObject;
    },
    transformSpecificationClone: true
  });
}

async function addMiddleware(app: FastifyInstance) {
  // Request correlation ID
  app.addHook('onRequest', async (request, reply) => {
    const correlationId = request.headers['x-request-id'] as string || generateCorrelationId();
    request.headers['x-correlation-id'] = correlationId;
    reply.header('x-correlation-id', correlationId);
  });

  // Request logging
  app.addHook('onRequest', async (request, reply) => {
    const startTime = Date.now();
    request.startTime = startTime;
    
    logger.info('Request started', {
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      correlationId: request.headers['x-correlation-id']
    });
  });

  // Response logging
  app.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - (request.startTime || Date.now());
    
    logger.info('Request completed', {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
      correlationId: request.headers['x-correlation-id'],
      userId: request.auth?.userId
    });

    // Log performance metrics
    FileServiceLogger.logPerformanceMetric(
      'request_duration',
      duration,
      'ms',
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode
      }
    );
  });

  // Error logging
  app.addHook('onError', async (request, reply, error) => {
    logger.error('Request error', {
      method: request.method,
      url: request.url,
      error: error.message,
      stack: error.stack,
      correlationId: request.headers['x-correlation-id'],
      userId: request.auth?.userId
    });
  });
}

async function registerRoutes(app: FastifyInstance) {
  // API routes
  await app.register(async function (app) {
    await app.register(uploadRoutes, { prefix: '/upload' });
    await app.register(fileRoutes, { prefix: '/files' });
    await app.register(adminRoutes, { prefix: '/admin' });
  }, { prefix: '/api/v1' });

  // Health check routes
  await app.register(healthRoutes, { prefix: '/health' });

  // Root endpoint
  app.get('/', async (request, reply) => {
    reply.send({
      service: 'LMS File Service',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      documentation: '/docs'
    });
  });
}

function addErrorHandling(app: FastifyInstance) {
  // Custom error handler
  app.setErrorHandler(async (error, request, reply) => {
    const correlationId = request.headers['x-correlation-id'] as string;
    
    // Handle known error types
    if (error instanceof ValidationError) {
      reply.status(400).send({
        error: 'Validation Error',
        message: error.message,
        details: error.details,
        correlationId
      });
      return;
    }

    if (error instanceof AuthenticationError) {
      reply.status(401).send({
        error: 'Authentication Error',
        message: error.message,
        correlationId
      });
      return;
    }

    if (error instanceof AuthorizationError) {
      reply.status(403).send({
        error: 'Authorization Error',
        message: error.message,
        correlationId
      });
      return;
    }

    if (error instanceof NotFoundError) {
      reply.status(404).send({
        error: 'Not Found',
        message: error.message,
        correlationId
      });
      return;
    }

    if (error instanceof StorageError) {
      reply.status(500).send({
        error: 'Storage Error',
        message: 'File storage operation failed',
        correlationId
      });
      return;
    }

    if (error instanceof ProcessingError) {
      reply.status(500).send({
        error: 'Processing Error',
        message: 'File processing failed',
        correlationId
      });
      return;
    }

    // Handle Fastify validation errors
    if (error.validation) {
      reply.status(400).send({
        error: 'Validation Error',
        message: 'Request validation failed',
        details: error.validation,
        correlationId
      });
      return;
    }

    // Handle multipart errors
    if (error.code === 'FST_FILES_LIMIT') {
      reply.status(400).send({
        error: 'Upload Error',
        message: 'Too many files in upload',
        correlationId
      });
      return;
    }

    if (error.code === 'FST_FILE_TOO_LARGE') {
      reply.status(413).send({
        error: 'Upload Error',
        message: 'File too large',
        correlationId
      });
      return;
    }

    // Generic error handling
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? 'Internal Server Error' : error.message;

    logger.error('Unhandled error', {
      error: error.message,
      stack: error.stack,
      statusCode,
      correlationId,
      url: request.url,
      method: request.method
    });

    reply.status(statusCode).send({
      error: 'Server Error',
      message,
      correlationId,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  });

  // 404 handler
  app.setNotFoundHandler(async (request, reply) => {
    reply.status(404).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      correlationId: request.headers['x-correlation-id']
    });
  });
}

// Graceful shutdown handling
export async function setupGracefulShutdown(app: FastifyInstance) {
  const signals = ['SIGINT', 'SIGTERM'];
  
  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      
      try {
        // Close the server
        await app.close();
        logger.info('Server closed successfully');
        
        // Close database connections
        const { closeDatabase } = await import('@/database/connection');
        await closeDatabase();
        logger.info('Database connections closed');
        
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', { error: (error as Error).message });
        process.exit(1);
      }
    });
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', { reason, promise });
    process.exit(1);
  });
}

// Add request interface extension
declare module 'fastify' {
  interface FastifyRequest {
    startTime?: number;
  }
}
