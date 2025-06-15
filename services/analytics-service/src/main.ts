import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import jwt from '@fastify/jwt';

import { env } from '@/config/environment';
import { logger, structuredLog } from '@/utils/logger';
import { db } from '@/utils/database';
import { redis } from '@/utils/redis';
import { eventHandler } from '@/events/handlers/event.handler';
import { analyticsRoutes } from '@/routes/analytics.routes';
import { analyticsController } from '@/controllers/analytics.controller';
import { recordHttpRequest } from '@/utils/metrics';

class AnalyticsServiceApp {
  private app: FastifyInstance;
  private isShuttingDown = false;

  constructor() {
    this.app = Fastify({
      logger: false, // We use our own logger
      trustProxy: true,
      requestIdHeader: 'x-request-id',
      requestIdLogLabel: 'requestId',
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandlers();
    this.setupGracefulShutdown();
  }

  // ============================================================================
  // Middleware Setup
  // ============================================================================

  private setupMiddleware(): void {
    // CORS
    this.app.register(cors, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    });

    // Security headers
    this.app.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    });

    // Rate limiting
    this.app.register(rateLimit, {
      max: env.RATE_LIMIT_MAX,
      timeWindow: env.RATE_LIMIT_WINDOW_MS,
      errorResponseBuilder: (request, context) => ({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Try again in ${Math.round(context.ttl / 1000)} seconds.`,
        },
      }),
    });

    // JWT authentication
    this.app.register(jwt, {
      secret: env.JWT_SECRET,
      sign: {
        expiresIn: '1h',
      },
    });

    // Swagger documentation
    this.app.register(swagger, {
      openapi: {
        openapi: '3.0.0',
        info: {
          title: 'Analytics Service API',
          description: 'Learning Management System Analytics Service - Real-time analytics, reporting, and business intelligence',
          version: '1.0.0',
          contact: {
            name: 'LMS Team',
            email: 'team@lms.com',
          },
        },
        servers: [
          {
            url: `http://localhost:${env.PORT}`,
            description: 'Development server',
          },
        ],
        tags: [
          { name: 'Dashboard', description: 'Dashboard analytics endpoints' },
          { name: 'User Analytics', description: 'User-specific analytics endpoints' },
          { name: 'Course Analytics', description: 'Course-specific analytics endpoints' },
          { name: 'Learning Progress', description: 'Learning progress tracking endpoints' },
          { name: 'Cache Management', description: 'Cache management endpoints' },
          { name: 'System', description: 'System information endpoints' },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
            apiKey: {
              type: 'apiKey',
              in: 'header',
              name: 'X-API-Key',
            },
          },
        },
        security: [
          { bearerAuth: [] },
          { apiKey: [] },
        ],
      },
    });

    this.app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
    });

    // Request logging middleware
    this.app.addHook('onRequest', async (request, reply) => {
      request.startTime = Date.now();
    });

    this.app.addHook('onResponse', async (request, reply) => {
      const duration = Date.now() - (request.startTime || Date.now());
      
      structuredLog.request.logRequest(request, reply, duration);
      recordHttpRequest(
        request.method,
        request.routerPath || request.url,
        reply.statusCode,
        duration,
        request.headers['content-length'] ? parseInt(request.headers['content-length'] as string) : undefined,
        reply.getHeader('content-length') ? parseInt(reply.getHeader('content-length') as string) : undefined
      );
    });

    // Authentication middleware
    this.app.addHook('preHandler', async (request, reply) => {
      // Skip authentication for health check, metrics, and docs
      const publicPaths = ['/health', '/metrics', '/docs'];
      const isPublicPath = publicPaths.some(path => request.url.startsWith(path));
      
      if (isPublicPath) {
        return;
      }

      try {
        // Check for API key first
        const apiKey = request.headers['x-api-key'];
        if (apiKey === env.SERVICE_API_KEY) {
          return;
        }

        // Check for JWT token
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return reply.code(401).send({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            },
          });
        }

        const token = authHeader.substring(7);
        const decoded = this.app.jwt.verify(token);
        request.user = decoded;
      } catch (error) {
        return reply.code(401).send({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired token',
          },
        });
      }
    });
  }

  // ============================================================================
  // Routes Setup
  // ============================================================================

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', {
      schema: {
        description: 'Health check endpoint',
        tags: ['System'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              uptime: { type: 'number' },
              version: { type: 'string' },
              environment: { type: 'string' },
            },
          },
        },
      },
    }, analyticsController.getHealthCheck.bind(analyticsController));

    // Metrics endpoint
    this.app.get('/metrics', {
      schema: {
        description: 'Prometheus metrics endpoint',
        tags: ['System'],
        response: {
          200: {
            type: 'string',
            description: 'Prometheus metrics in text format',
          },
        },
      },
    }, analyticsController.getMetrics.bind(analyticsController));

    // API routes
    this.app.register(analyticsRoutes, { prefix: '/api/v1' });

    // 404 handler
    this.app.setNotFoundHandler((request, reply) => {
      reply.code(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Route ${request.method} ${request.url} not found`,
        },
      });
    });
  }

  // ============================================================================
  // Error Handlers
  // ============================================================================

  private setupErrorHandlers(): void {
    // Global error handler
    this.app.setErrorHandler((error, request, reply) => {
      structuredLog.request.logError(request, error);

      // Handle validation errors
      if (error.validation) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: error.validation,
          },
        });
      }

      // Handle rate limit errors
      if (error.statusCode === 429) {
        return reply.code(429).send({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: error.message,
          },
        });
      }

      // Handle JWT errors
      if (error.code === 'FST_JWT_BAD_REQUEST' || error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
        return reply.code(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or missing authentication',
          },
        });
      }

      // Default error response
      const statusCode = error.statusCode || 500;
      const isDevelopment = env.NODE_ENV === 'development';

      reply.code(statusCode).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: isDevelopment ? error.message : 'Internal server error',
          ...(isDevelopment && { stack: error.stack }),
        },
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      this.gracefulShutdown('SIGTERM');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection:', { reason, promise });
      this.gracefulShutdown('SIGTERM');
    });
  }

  // ============================================================================
  // Graceful Shutdown
  // ============================================================================

  private setupGracefulShutdown(): void {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach((signal) => {
      process.on(signal, () => {
        this.gracefulShutdown(signal);
      });
    });
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress, forcing exit...');
      process.exit(1);
    }

    this.isShuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    try {
      // Stop accepting new requests
      await this.app.close();
      logger.info('✅ HTTP server closed');

      // Stop event processing
      await eventHandler.gracefulShutdown();
      logger.info('✅ Event handler stopped');

      // Close database connections
      await db.disconnect();
      logger.info('✅ Database disconnected');

      // Close Redis connections
      await redis.disconnect();
      logger.info('✅ Redis disconnected');

      logger.info('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  // ============================================================================
  // Application Lifecycle
  // ============================================================================

  async start(): Promise<void> {
    try {
      // Connect to dependencies
      await this.connectDependencies();

      // Start the server
      await this.app.listen({
        port: env.PORT,
        host: env.HOST,
      });

      logger.info(`🚀 Analytics Service started successfully`);
      logger.info(`📊 Server listening on http://${env.HOST}:${env.PORT}`);
      logger.info(`📚 API documentation available at http://${env.HOST}:${env.PORT}/docs`);
      logger.info(`🔍 Health check available at http://${env.HOST}:${env.PORT}/health`);
      logger.info(`📈 Metrics available at http://${env.HOST}:${env.PORT}/metrics`);

    } catch (error) {
      logger.error('❌ Failed to start Analytics Service:', error);
      process.exit(1);
    }
  }

  private async connectDependencies(): Promise<void> {
    logger.info('🔌 Connecting to dependencies...');

    try {
      // Connect to database
      await db.connect();
      await db.runMigrations();
      logger.info('✅ Database connected and migrated');

      // Connect to Redis
      await redis.connect();
      logger.info('✅ Redis connected');

      // Connect to Kafka and start event processing
      await eventHandler.connect();
      
      // Start event processing in background
      eventHandler.startProcessing().catch(error => {
        logger.error('❌ Event processing failed:', error);
      });
      
      logger.info('✅ Event handler connected and processing started');

    } catch (error) {
      logger.error('❌ Failed to connect to dependencies:', error);
      throw error;
    }
  }

  // ============================================================================
  // Health Checks
  // ============================================================================

  async getHealthStatus(): Promise<{
    status: 'healthy' | 'unhealthy';
    checks: Record<string, any>;
  }> {
    const checks = {
      database: await db.healthCheck(),
      redis: await redis.healthCheck(),
      eventHandler: await eventHandler.healthCheck(),
    };

    const allHealthy = Object.values(checks).every(check => 
      typeof check === 'boolean' ? check : check.status === 'healthy'
    );

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      checks,
    };
  }
}

// ============================================================================
// Application Bootstrap
// ============================================================================

async function bootstrap(): Promise<void> {
  logger.info('🚀 Starting Analytics Service...');
  logger.info(`📊 Environment: ${env.NODE_ENV}`);
  logger.info(`🔧 Port: ${env.PORT}`);
  logger.info(`📝 Log Level: ${env.LOG_LEVEL}`);

  const app = new AnalyticsServiceApp();
  await app.start();
}

// Start the application
if (require.main === module) {
  bootstrap().catch((error) => {
    logger.error('❌ Failed to bootstrap Analytics Service:', error);
    process.exit(1);
  });
}

export default AnalyticsServiceApp;
