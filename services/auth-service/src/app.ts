import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';

import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/user';
import { healthRoutes } from './routes/health';
import { oauthRoutes } from './routes/oauth';
import { sessionRoutes } from './routes/session';
import { initializeDatabase } from './database';
import { initializeRedis } from './redis';
import { initializeRabbitMQ } from './rabbitmq';

export const createApp: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  // Initialize external services
  await initializeDatabase();
  await initializeRedis();
  await initializeRabbitMQ();

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

  await fastify.register(fastifyCookie);

  await fastify.register(fastifySession, {
    secret: config.session.secret,
    cookie: {
      secure: config.nodeEnv === 'production',
      httpOnly: true,
      maxAge: config.session.maxAge,
    },
  });

  await fastify.register(fastifyJwt, {
    secret: config.jwt.secret,
    sign: {
      expiresIn: config.jwt.expiresIn,
    },
  });

  // Register Swagger
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'LMS Auth Service API',
        description: 'Authentication and authorization service for Learning Management System',
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
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(userRoutes, { prefix: '/users' });
  await fastify.register(oauthRoutes, { prefix: '/oauth' });
  await fastify.register(sessionRoutes, { prefix: '/sessions' });

  logger.info('Application initialized successfully');
};
