import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';

import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { healthRoutes } from './routes/health';
import { courseRoutes } from './routes/courses';
import { moduleRoutes } from './routes/modules';
import { lessonRoutes } from './routes/lessons';
import { initializeDatabase } from './database';
import { initializeRedis } from './redis';
import { initializeKafka, setupEventConsumers } from './kafka';
import path from 'path';

export const createApp: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  // Initialize external services
  await initializeDatabase();
  await initializeRedis();
  await initializeKafka();
  
  // Setup event consumers
  await setupEventConsumers();

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

  await fastify.register(fastifyRateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.window,
  });

  await fastify.register(fastifyJwt, {
    secret: config.jwt.secret,
  });

  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: config.fileUpload.maxFileSize,
    },
  });

  // Serve static files (uploads)
  await fastify.register(fastifyStatic, {
    root: path.join(process.cwd(), config.fileUpload.uploadDir),
    prefix: '/uploads/',
  });

  // Register Swagger
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'LMS Course Service API',
        description: 'Course management service for Learning Management System',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://${config.host}:${config.port}`,
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
        { name: 'Courses', description: 'Course management endpoints' },
        { name: 'Modules', description: 'Module management endpoints' },
        { name: 'Lessons', description: 'Lesson management endpoints' },
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
  await fastify.register(courseRoutes, { prefix: '/courses' });
  await fastify.register(moduleRoutes, { prefix: '/modules' });
  await fastify.register(lessonRoutes, { prefix: '/lessons' });

  logger.info('Course service application initialized successfully');
};
