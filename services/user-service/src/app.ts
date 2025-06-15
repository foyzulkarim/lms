import Fastify, { FastifyInstance } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';

// Configuration and utilities
import { appConfig, serverConfig, corsConfig, rateLimitConfig, jwtConfig, securityConfig } from '@/config';
import { log, logStartup, logShutdown } from '@/utils/logger';

// Database and external services
import { initializeDatabase, closeDatabaseConnection } from '@/database/connection';
import { initializeRedis, closeRedisConnection } from '@/redis/client';
import { initializeRabbitMQ, closeRabbitMQConnection } from '@/rabbitmq/connection';

// Routes
import { userRoutes } from '@/routes/users';
import { enrollmentRoutes } from '@/routes/enrollments';
import { preferenceRoutes } from '@/routes/preferences';
import { healthRoutes } from '@/routes/health';

// Middleware
import { logRequest } from '@/middleware/auth.middleware';

// Create Fastify instance
const fastify: FastifyInstance = Fastify({
  logger: false, // We use our custom logger
  trustProxy: true,
  bodyLimit: 10 * 1024 * 1024, // 10MB
}).withTypeProvider<TypeBoxTypeProvider>();

// Global error handler
fastify.setErrorHandler(async (error, request, reply) => {
  log.error('Unhandled error', error, {
    url: request.url,
    method: request.method,
    ip: request.ip,
    userId: request.user?.id,
  });
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (error.statusCode && error.statusCode < 500) {
    reply.code(error.statusCode).send({
      success: false,
      error: error.message,
      ...(isDevelopment && { details: error.stack }),
      timestamp: new Date().toISOString(),
    });
  } else {
    reply.code(500).send({
      success: false,
      error: 'Internal server error',
      ...(isDevelopment && { details: error.message }),
      timestamp: new Date().toISOString(),
    });
  }
});

// Not found handler
fastify.setNotFoundHandler(async (request, reply) => {
  reply.code(404).send({
    success: false,
    error: 'Route not found',
    path: request.url,
    method: request.method,
    timestamp: new Date().toISOString(),
  });
});

// Register plugins
async function registerPlugins() {
  // Security plugins
  if (securityConfig.helmetEnabled) {
    await fastify.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    });
  }
  
  // CORS
  await fastify.register(cors, {
    origin: corsConfig.origin,
    credentials: corsConfig.credentials,
    methods: corsConfig.methods,
    allowedHeaders: corsConfig.allowedHeaders,
  });
  
  // Rate limiting
  await fastify.register(rateLimit, {
    max: rateLimitConfig.max,
    timeWindow: rateLimitConfig.window,
    skipSuccessfulRequests: rateLimitConfig.skipSuccessful,
    errorResponseBuilder: (request, context) => ({
      success: false,
      error: 'Rate limit exceeded',
      retryAfter: Math.round(context.ttl / 1000),
      timestamp: new Date().toISOString(),
    }),
  });
  
  // JWT
  await fastify.register(jwt, {
    secret: jwtConfig.secret,
    sign: {
      expiresIn: jwtConfig.expiresIn,
    },
  });
  
  // Multipart (for file uploads)
  await fastify.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
    },
  });
  
  // Swagger documentation
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'User Service API',
        description: 'User Service for LMS - Manages user profiles, enrollments, and preferences',
        version: '1.0.0',
        contact: {
          name: 'LMS Team',
          email: 'support@lms.example.com',
        },
      },
      servers: [
        {
          url: `http://localhost:${serverConfig.port}`,
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
      tags: [
        { name: 'Health', description: 'Health check endpoints' },
        { name: 'Users', description: 'User management endpoints' },
        { name: 'Enrollments', description: 'User enrollment endpoints' },
        { name: 'Preferences', description: 'User preference endpoints' },
      ],
    },
  });
  
  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });
}

// Register routes
async function registerRoutes() {
  // Add request logging middleware to all routes
  fastify.addHook('preHandler', logRequest);
  
  // Health routes (no prefix)
  await fastify.register(healthRoutes);
  
  // API routes with /api/v1 prefix
  await fastify.register(async function (fastify) {
    // User routes
    await fastify.register(userRoutes, { prefix: '/users' });
    
    // Enrollment routes (nested under users)
    await fastify.register(enrollmentRoutes, { prefix: '/users' });
    
    // Preference routes (nested under users)
    await fastify.register(preferenceRoutes, { prefix: '/users' });
  }, { prefix: '/api/v1' });
}

// Initialize external services
async function initializeServices() {
  log.info('Initializing external services...');
  
  try {
    // Initialize database
    await initializeDatabase();
    
    // Initialize Redis
    await initializeRedis();
    
    // Initialize RabbitMQ
    await initializeRabbitMQ();
    
    log.info('All external services initialized successfully');
  } catch (error) {
    log.error('Failed to initialize external services', error);
    throw error;
  }
}

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logShutdown(signal);
  
  try {
    // Close Fastify server
    await fastify.close();
    
    // Close external connections
    await Promise.all([
      closeDatabaseConnection(),
      closeRedisConnection(),
      closeRabbitMQConnection(),
    ]);
    
    log.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    log.error('Error during graceful shutdown', error);
    process.exit(1);
  }
}

// Start server
async function start() {
  try {
    // Initialize services first
    await initializeServices();
    
    // Register plugins
    await registerPlugins();
    
    // Register routes
    await registerRoutes();
    
    // Start server
    await fastify.listen({
      port: serverConfig.port,
      host: serverConfig.host,
    });
    
    logStartup(serverConfig.port, serverConfig.nodeEnv);
    
    // Log available routes in development
    if (serverConfig.nodeEnv === 'development') {
      log.info('Available routes:', {
        routes: fastify.printRoutes({ commonPrefix: false }),
      });
    }
    
  } catch (error) {
    log.error('Failed to start server', error);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled rejection', reason, { promise });
  gracefulShutdown('unhandledRejection');
});

// Start the application
if (require.main === module) {
  start();
}

export { fastify };
export default fastify;
