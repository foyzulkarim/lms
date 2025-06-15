import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';

const HealthResponseSchema = Type.Object({
  status: Type.String(),
  timestamp: Type.String(),
  uptime: Type.Number(),
  services: Type.Optional(Type.Object({
    ollama: Type.Object({
      status: Type.String(),
      responseTime: Type.Optional(Type.Number()),
    }),
    redis: Type.Object({
      status: Type.String(),
      responseTime: Type.Optional(Type.Number()),
    }),
    database: Type.Object({
      status: Type.String(),
      responseTime: Type.Optional(Type.Number()),
    }),
    queue: Type.Object({
      status: Type.String(),
      stats: Type.Optional(Type.Object({
        waiting: Type.Number(),
        active: Type.Number(),
        completed: Type.Number(),
        failed: Type.Number(),
      })),
    }),
  })),
});

export const healthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Basic health check
  fastify.get('/', {
    schema: {
      tags: ['Health'],
      summary: 'Basic health check',
      response: {
        200: HealthResponseSchema,
      },
    },
  }, async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // Detailed health check
  fastify.get('/detailed', {
    schema: {
      tags: ['Health'],
      summary: 'Detailed health check with service status',
      response: {
        200: HealthResponseSchema,
        503: HealthResponseSchema,
      },
    },
  }, async (request, reply) => {
    const services = {
      ollama: { status: 'unknown', responseTime: 0 },
      redis: { status: 'unknown', responseTime: 0 },
      database: { status: 'unknown', responseTime: 0 },
      queue: { status: 'unknown', stats: undefined as any },
    };

    let overallStatus = 'healthy';

    // Check Ollama service
    try {
      const ollamaStart = Date.now();
      const isHealthy = await fastify.ollamaService.healthCheck();
      services.ollama = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        responseTime: Date.now() - ollamaStart,
      };
      if (!isHealthy) overallStatus = 'degraded';
    } catch (error) {
      services.ollama = {
        status: 'unhealthy',
        responseTime: Date.now(),
      };
      overallStatus = 'unhealthy';
      request.logger.error('Ollama health check failed:', error);
    }

    // Check Redis
    try {
      const redisStart = Date.now();
      await fastify.redis.ping();
      services.redis = {
        status: 'healthy',
        responseTime: Date.now() - redisStart,
      };
    } catch (error) {
      services.redis = {
        status: 'unhealthy',
        responseTime: Date.now(),
      };
      overallStatus = 'unhealthy';
      request.logger.error('Redis health check failed:', error);
    }

    // Check Database
    try {
      const dbStart = Date.now();
      await fastify.db.raw('SELECT 1');
      services.database = {
        status: 'healthy',
        responseTime: Date.now() - dbStart,
      };
    } catch (error) {
      services.database = {
        status: 'unhealthy',
        responseTime: Date.now(),
      };
      overallStatus = 'unhealthy';
      request.logger.error('Database health check failed:', error);
    }

    // Check Queue
    try {
      const queueStats = await fastify.queueProducer.getQueueStats();
      services.queue = {
        status: 'healthy',
        stats: queueStats.total,
      };
    } catch (error) {
      services.queue = {
        status: 'unhealthy',
        stats: undefined,
      };
      overallStatus = 'degraded'; // Queue issues are not critical
      request.logger.error('Queue health check failed:', error);
    }

    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services,
    };

    if (overallStatus === 'unhealthy') {
      reply.status(503);
    }

    return response;
  });

  // Readiness probe
  fastify.get('/ready', {
    schema: {
      tags: ['Health'],
      summary: 'Readiness probe for Kubernetes',
      response: {
        200: Type.Object({
          status: Type.String(),
          timestamp: Type.String(),
        }),
        503: Type.Object({
          status: Type.String(),
          timestamp: Type.String(),
          error: Type.String(),
        }),
      },
    },
  }, async (request, reply) => {
    try {
      // Check critical dependencies
      await fastify.redis.ping();
      await fastify.db.raw('SELECT 1');

      return {
        status: 'ready',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      reply.status(503);
      return {
        status: 'not ready',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Liveness probe
  fastify.get('/live', {
    schema: {
      tags: ['Health'],
      summary: 'Liveness probe for Kubernetes',
      response: {
        200: Type.Object({
          status: Type.String(),
          timestamp: Type.String(),
          uptime: Type.Number(),
        }),
      },
    },
  }, async (request, reply) => {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });
};
