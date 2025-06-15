import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from '@/config/env';
import { logger } from '@/utils/logger';
import { databaseClient } from '@/utils/database';
import { redisClient } from '@/utils/redis';
import { metricsPlugin } from '@/utils/metrics';

// Import routes
import { notificationRoutes } from '@/routes/notifications.routes';
import { templateRoutes } from '@/routes/templates.routes';
import { preferencesRoutes } from '@/routes/preferences.routes';
import { healthRoutes } from '@/routes/health.routes';

// Import workers
import { notificationProcessor } from '@/workers/notification-processor';
import { emailDeliveryWorker } from '@/workers/email-delivery-worker';
import { pushDeliveryWorker } from '@/workers/push-delivery-worker';

// Import services
import { eventConsumer } from '@/services/event-consumer.service';
import { schedulerService } from '@/services/scheduler.service';

export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: config.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      } : undefined
    }
  });

  // Register plugins
  await registerPlugins(app);

  // Register routes
  await registerRoutes(app);

  // Setup error handling
  setupErrorHandling(app);

  // Setup graceful shutdown
  setupGracefulShutdown(app);

  return app;
}

async function registerPlugins(app: FastifyInstance): Promise<void> {
  // Security plugins
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"]
      }
    }
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: config.GLOBAL_RATE_LIMIT,
    timeWindow: config.RATE_LIMIT_WINDOW,
    redis: redisClient,
    keyGenerator: (request) => {
      return request.headers.authorization || request.ip;
    },
    errorResponseBuilder: (request, context) => {
      return {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Try again in ${Math.round(context.ttl / 1000)} seconds.`
        },
        timestamp: new Date().toISOString()
      };
    }
  });

  // Swagger documentation
  if (config.ENABLE_SWAGGER) {
    await app.register(swagger, {
      swagger: {
        info: {
          title: 'Notification Service API',
          description: 'Multi-channel notification service with EMAIL-Dispatcher integration and web push notifications',
          version: '2.0.0',
          contact: {
            name: 'LMS Platform Team',
            email: 'support@lms.example.com'
          }
        },
        host: `localhost:${config.PORT}`,
        schemes: ['http', 'https'],
        consumes: ['application/json'],
        produces: ['application/json'],
        tags: [
          { name: 'Notifications', description: 'Notification management endpoints' },
          { name: 'Templates', description: 'Template management endpoints' },
          { name: 'Preferences', description: 'User preference endpoints' },
          { name: 'Analytics', description: 'Analytics and reporting endpoints' },
          { name: 'Health', description: 'Health check endpoints' }
        ],
        securityDefinitions: {
          Bearer: {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header',
            description: 'JWT token for authentication'
          },
          ApiKey: {
            type: 'apiKey',
            name: 'x-api-key',
            in: 'header',
            description: 'API key for service-to-service authentication'
          }
        },
        security: [
          { Bearer: [] },
          { ApiKey: [] }
        ]
      }
    });

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

  // Metrics plugin
  if (config.ENABLE_PROMETHEUS) {
    await app.register(metricsPlugin);
  }
}

async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Health check routes (no auth required)
  await app.register(healthRoutes, { prefix: '/health' });

  // API routes with authentication
  await app.register(async function(fastify) {
    await fastify.register(notificationRoutes, { prefix: '/api/v1/notifications' });
    await fastify.register(templateRoutes, { prefix: '/api/v1/notifications/templates' });
    await fastify.register(preferencesRoutes, { prefix: '/api/v1/notifications/preferences' });
  });

  // Root endpoint
  app.get('/', async (request, reply) => {
    return {
      service: 'Notification Service',
      version: '2.0.0',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      features: [
        'Multi-channel notifications (Email, Web Push)',
        'EMAIL-Dispatcher integration',
        'Template management',
        'User preferences',
        'Delivery tracking',
        'Bulk messaging',
        'Scheduled notifications',
        'Analytics and reporting'
      ],
      endpoints: {
        docs: config.ENABLE_SWAGGER ? '/docs' : null,
        health: '/health',
        metrics: config.ENABLE_PROMETHEUS ? '/metrics' : null,
        api: '/api/v1'
      }
    };
  });
}

function setupErrorHandling(app: FastifyInstance): void {
  // Global error handler
  app.setErrorHandler(async (error, request, reply) => {
    logger.error('Unhandled error', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: request.body
    });

    // Don't expose internal errors in production
    const message = config.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message;

    const statusCode = error.statusCode || 500;

    reply.code(statusCode).send({
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message
      },
      timestamp: new Date().toISOString()
    });
  });

  // 404 handler
  app.setNotFoundHandler(async (request, reply) => {
    reply.code(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`
      },
      timestamp: new Date().toISOString()
    });
  });
}

function setupGracefulShutdown(app: FastifyInstance): void {
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    try {
      // Stop accepting new requests
      await app.close();

      // Shutdown workers
      await notificationProcessor.shutdown();
      await emailDeliveryWorker.shutdown();
      await pushDeliveryWorker.shutdown();

      // Stop event consumer
      await eventConsumer.shutdown();

      // Stop scheduler
      await schedulerService.shutdown();

      // Close database connections
      await databaseClient.destroy();

      // Close Redis connection
      await redisClient.quit();

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', error);
      process.exit(1);
    }
  };

  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.fatal('Uncaught exception', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.fatal('Unhandled rejection', { reason, promise });
    process.exit(1);
  });
}

export async function startServices(): Promise<void> {
  try {
    logger.info('Starting notification service components...');

    // Test database connection
    await databaseClient.raw('SELECT 1');
    logger.info('Database connection established');

    // Test Redis connection
    await redisClient.ping();
    logger.info('Redis connection established');

    // Start event consumer
    await eventConsumer.start();
    logger.info('Event consumer started');

    // Start scheduler service
    await schedulerService.start();
    logger.info('Scheduler service started');

    // Initialize workers (they start automatically)
    logger.info('Notification workers initialized');

    logger.info('All notification service components started successfully');
  } catch (error) {
    logger.error('Failed to start notification service components', error);
    throw error;
  }
}

export { app } from './index';
