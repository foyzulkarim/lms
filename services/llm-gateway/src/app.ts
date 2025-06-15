import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyJwt from '@fastify/jwt';
import fastifyWebsocket from '@fastify/websocket';

import { config } from './config';
import { logger } from './utils/logger';
import { initializeRedis } from './utils/redis';
import { initializeDatabase } from './utils/database';
import { initializeKafka } from './utils/kafka';

// Import middleware
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { authMiddleware } from './middleware/auth';

// Import routes
import { healthRoutes } from './routes/health';
import { chatRoutes } from './routes/chat';
import { embeddingsRoutes } from './routes/embeddings';
import { modelsRoutes } from './routes/models';
import { adminRoutes } from './routes/admin';

// Import services
import { OllamaService } from './services/ollama';
import { QueueProducer } from './queue/producer';
import { UserRateLimiter } from './rate-limiters/user-limiter';
import { ModelRateLimiter } from './rate-limiters/model-limiter';
import { ResponseCache } from './cache/response-cache';

export const createApp: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  // Initialize external services
  const redis = await initializeRedis();
  const db = await initializeDatabase();
  const kafka = await initializeKafka();

  // Initialize core services
  const ollamaService = new OllamaService();
  const queueProducer = new QueueProducer(redis);
  const userRateLimiter = new UserRateLimiter(redis);
  const modelRateLimiter = new ModelRateLimiter(redis);
  const responseCache = new ResponseCache(redis);

  // Store services in fastify instance for access in routes
  fastify.decorate('redis', redis);
  fastify.decorate('db', db);
  fastify.decorate('kafka', kafka);
  fastify.decorate('ollamaService', ollamaService);
  fastify.decorate('queueProducer', queueProducer);
  fastify.decorate('userRateLimiter', userRateLimiter);
  fastify.decorate('modelRateLimiter', modelRateLimiter);
  fastify.decorate('responseCache', responseCache);

  // Register plugins
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  });

  await fastify.register(fastifyCors, {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
  });

  // Global rate limiting (basic protection)
  await fastify.register(fastifyRateLimit, {
    max: 1000,
    timeWindow: '1 minute',
    redis: redis,
  });

  await fastify.register(fastifyJwt, {
    secret: config.jwt.secret,
  });

  // WebSocket support for streaming
  await fastify.register(fastifyWebsocket);

  // Register Swagger
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'LMS LLM Gateway API',
        description: 'Gateway service for managing LLM requests and responses',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://${config.server.host}:${config.server.port}`,
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
        { name: 'Chat', description: 'Chat completion endpoints' },
        { name: 'Embeddings', description: 'Text embedding endpoints' },
        { name: 'Models', description: 'Model management endpoints' },
        { name: 'Admin', description: 'Administrative endpoints' },
      ],
    },
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false,
    },
  });

  // Register middleware
  await fastify.register(requestLogger);
  await fastify.register(errorHandler);

  // Register routes
  await fastify.register(healthRoutes, { prefix: '/health' });
  await fastify.register(chatRoutes, { prefix: '/v1/chat' });
  await fastify.register(embeddingsRoutes, { prefix: '/v1/embeddings' });
  await fastify.register(modelsRoutes, { prefix: '/v1/models' });
  await fastify.register(adminRoutes, { prefix: '/admin' });

  // Health check for Ollama service
  const isOllamaHealthy = await ollamaService.healthCheck();
  if (!isOllamaHealthy) {
    logger.warn('Ollama service is not available at startup');
  } else {
    logger.info('Ollama service is healthy');
  }

  // Graceful shutdown handlers
  const gracefulShutdown = async () => {
    logger.info('Starting graceful shutdown...');
    
    try {
      await queueProducer.close();
      await redis.quit();
      if (db) {
        await db.destroy();
      }
      logger.info('Graceful shutdown completed');
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
    }
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  logger.info('LLM Gateway application initialized successfully');
};

// Extend Fastify instance with our services
declare module 'fastify' {
  interface FastifyInstance {
    redis: any;
    db: any;
    kafka: any;
    ollamaService: OllamaService;
    queueProducer: QueueProducer;
    userRateLimiter: UserRateLimiter;
    modelRateLimiter: ModelRateLimiter;
    responseCache: ResponseCache;
  }
}
