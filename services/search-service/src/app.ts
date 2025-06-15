import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { config } from '@/config/environment';
import { searchLogger } from '@/utils/logger';
import { connectDatabase, validateDatabaseSchema } from '@/utils/database';
import { requestLogger, errorHandler } from '@/middleware/auth.middleware';

// Route imports
import { searchRoutes } from '@/routes/search.routes';

export async function createApp(): Promise<FastifyInstance> {
  // Create Fastify instance
  const app = Fastify({
    logger: false, // We use our custom logger
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    genReqId: () => `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  });

  // Register error handler
  app.setErrorHandler(errorHandler);

  // Register request logging
  app.addHook('preHandler', requestLogger);

  // Register security plugins
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  });

  // Register CORS
  await app.register(cors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      
      // In development, allow all origins
      if (config.NODE_ENV === 'development') {
        return callback(null, true);
      }
      
      // In production, check against allowed origins
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://lms.example.com', // Replace with actual domain
      ];
      
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Request-ID',
    ],
  });

  // Register rate limiting
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    errorResponseBuilder: (request, context) => {
      return {
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
        statusCode: 429,
        retryAfter: Math.round(context.ttl / 1000),
      };
    },
  });

  // Register Swagger documentation
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Search Service API',
        description: 'Advanced Search Service with RAG capabilities, semantic search, and full-text search for LMS platform',
        version: '2.0.0',
        contact: {
          name: 'LMS Team',
          email: 'support@lms.example.com',
        },
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT',
        },
      },
      servers: [
        {
          url: `http://localhost:${config.PORT}`,
          description: 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [
        {
          bearerAuth: [],
        },
      ],
      tags: [
        {
          name: 'Search',
          description: 'Universal search with multiple strategies',
        },
        {
          name: 'RAG',
          description: 'Retrieval-Augmented Generation for question answering',
        },
        {
          name: 'Semantic',
          description: 'Semantic search using vector embeddings',
        },
        {
          name: 'Autocomplete',
          description: 'Search autocomplete and suggestions',
        },
        {
          name: 'Similar',
          description: 'Find similar content',
        },
        {
          name: 'Health',
          description: 'Service health and monitoring',
        },
      ],
    },
  });

  // Register Swagger UI
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });

  // Register routes
  await app.register(searchRoutes, { prefix: '/api/v1/search' });

  // Health check routes
  app.get('/health', async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  app.get('/health/ready', async (request, reply) => {
    try {
      // Check database connectivity
      const { checkDatabaseHealth, checkVectorDatabaseHealth } = await import('@/utils/database');
      const dbHealthy = await checkDatabaseHealth();
      const vectorDbHealthy = await checkVectorDatabaseHealth();
      
      // Check LLM Gateway connectivity
      const { llmGatewayService } = await import('@/services/llm-gateway.service');
      const llmHealthy = await llmGatewayService.healthCheck();

      const isHealthy = dbHealthy && vectorDbHealthy && llmHealthy;
      const statusCode = isHealthy ? 200 : 503;

      return reply.status(statusCode).send({
        status: isHealthy ? 'ready' : 'not ready',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: {
          database: dbHealthy ? 'healthy' : 'unhealthy',
          vectorDatabase: vectorDbHealthy ? 'healthy' : 'unhealthy',
          llmGateway: llmHealthy ? 'healthy' : 'unhealthy',
        },
      });
    } catch (error) {
      searchLogger.error('Health check failed', error as Error);
      return reply.status(503).send({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Root endpoint
  app.get('/', async (request, reply) => {
    return {
      service: 'Search Service',
      version: '2.0.0',
      description: 'Advanced Search Service with RAG capabilities',
      status: 'running',
      timestamp: new Date().toISOString(),
      features: [
        'Full-text search',
        'Semantic search',
        'Hybrid search',
        'RAG-powered Q&A',
        'Autocomplete',
        'Similar content discovery'
      ],
      documentation: '/docs',
      health: '/health',
    };
  });

  // 404 handler
  app.setNotFoundHandler(async (request, reply) => {
    return reply.status(404).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      statusCode: 404,
    });
  });

  return app;
}

export async function startServer(): Promise<FastifyInstance> {
  try {
    searchLogger.info('Starting Search Service...', {
      environment: config.NODE_ENV,
      port: config.PORT,
      host: config.HOST,
      features: {
        ragEnabled: config.ENABLE_RAG_SEARCH,
        semanticEnabled: config.ENABLE_SEMANTIC_SEARCH,
        hybridEnabled: config.ENABLE_HYBRID_SEARCH,
      },
    });

    // Connect to database
    await connectDatabase();
    
    // Validate database schema
    const schemaValid = await validateDatabaseSchema();
    if (!schemaValid) {
      throw new Error('Database schema validation failed');
    }

    // Create and start the app
    const app = await createApp();
    
    await app.listen({
      port: config.PORT,
      host: config.HOST,
    });

    searchLogger.info('Search Service started successfully', {
      port: config.PORT,
      host: config.HOST,
      environment: config.NODE_ENV,
      documentation: `http://${config.HOST}:${config.PORT}/docs`,
      endpoints: {
        search: `http://${config.HOST}:${config.PORT}/api/v1/search`,
        rag: `http://${config.HOST}:${config.PORT}/api/v1/search/rag`,
        semantic: `http://${config.HOST}:${config.PORT}/api/v1/search/semantic`,
        autocomplete: `http://${config.HOST}:${config.PORT}/api/v1/search/autocomplete`,
      },
    });

    return app;
  } catch (error) {
    searchLogger.error('Failed to start Search Service', error as Error);
    process.exit(1);
  }
}

// Graceful shutdown handler
export async function gracefulShutdown(app: FastifyInstance): Promise<void> {
  searchLogger.info('Received shutdown signal, starting graceful shutdown...');

  try {
    // Close Fastify server
    await app.close();
    searchLogger.info('HTTP server closed');

    // Close database connections
    const { disconnectDatabase } = await import('@/utils/database');
    await disconnectDatabase();
    searchLogger.info('Database connections closed');

    searchLogger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    searchLogger.error('Error during graceful shutdown', error as Error);
    process.exit(1);
  }
}

// Handle process signals
export function setupGracefulShutdown(app: FastifyInstance): void {
  const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
  
  signals.forEach((signal) => {
    process.on(signal, () => {
      searchLogger.info(`Received ${signal}, initiating graceful shutdown`);
      gracefulShutdown(app);
    });
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    searchLogger.error('Uncaught exception', error);
    gracefulShutdown(app);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    searchLogger.error('Unhandled promise rejection', reason as Error, {
      promise: promise.toString(),
    });
    gracefulShutdown(app);
  });
}
