import fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import jwt from 'fastify-jwt';
import sensible from 'fastify-sensible';
import circuitBreaker from 'fastify-circuit-breaker';
import { config } from './config';
import { registerRoutes } from './routes';
import { errorHandler } from './middleware/error-handler';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { circuitBreakerMiddleware } from './middleware/circuit-breaker';

const server = fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

// Register plugins
server.register(cors, {
  origin: config.cors.origins,
  credentials: true,
});

server.register(rateLimit, {
  max: config.rateLimit.max,
  timeWindow: config.rateLimit.timeWindow,
});

server.register(jwt, {
  secret: config.jwt.secret,
});

server.register(sensible);

server.register(circuitBreaker, {
  threshold: 5,
  timeout: 10000,
  resetTimeout: 5000,
});

// Register Swagger
server.register(swagger, {
  openapi: {
    info: {
      title: 'LMS API Gateway',
      description: 'API Gateway for LMS Microservices',
      version: '1.0.0',
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Development server',
      },
    ],
  },
});

server.register(swaggerUi, {
  routePrefix: '/docs',
});

// Register middleware
server.addHook('onRequest', authMiddleware);
server.addHook('onRequest', rateLimitMiddleware);
server.addHook('onRequest', circuitBreakerMiddleware);

// Register error handler
server.setErrorHandler(errorHandler);

// Register routes
registerRoutes(server);

// Start server
const start = async () => {
  try {
    await server.listen({ port: config.port, host: '0.0.0.0' });
    server.log.info(`Server listening on port ${config.port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
