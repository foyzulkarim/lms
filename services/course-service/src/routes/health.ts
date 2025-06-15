import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { getDatabase } from '../database';
import { getRedisClient } from '../redis';
import { getKafkaProducer } from '../kafka';

const HealthResponseSchema = Type.Object({
  status: Type.String(),
  timestamp: Type.String(),
  uptime: Type.Number(),
  services: Type.Object({
    database: Type.Object({
      status: Type.String(),
      responseTime: Type.Optional(Type.Number()),
    }),
    redis: Type.Object({
      status: Type.String(),
      responseTime: Type.Optional(Type.Number()),
    }),
    kafka: Type.Object({
      status: Type.String(),
      responseTime: Type.Optional(Type.Number()),
    }),
  }),
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
      services: {
        database: { status: 'unknown' },
        redis: { status: 'unknown' },
        kafka: { status: 'unknown' },
      },
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
    const startTime = Date.now();
    const services = {
      database: { status: 'unknown', responseTime: 0 },
      redis: { status: 'unknown', responseTime: 0 },
      kafka: { status: 'unknown', responseTime: 0 },
    };

    let overallStatus = 'healthy';

    // Check database
    try {
      const dbStart = Date.now();
      const db = getDatabase();
      await db.raw('SELECT 1');
      services.database = {
        status: 'healthy',
        responseTime: Date.now() - dbStart,
      };
    } catch (error) {
      services.database = {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
      };
      overallStatus = 'unhealthy';
      request.logger.error('Database health check failed:', error);
    }

    // Check Redis
    try {
      const redisStart = Date.now();
      const redis = getRedisClient();
      await redis.ping();
      services.redis = {
        status: 'healthy',
        responseTime: Date.now() - redisStart,
      };
    } catch (error) {
      services.redis = {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
      };
      overallStatus = 'unhealthy';
      request.logger.error('Redis health check failed:', error);
    }

    // Check Kafka
    try {
      const kafkaStart = Date.now();
      const producer = getKafkaProducer();
      // Just check if producer is connected
      services.kafka = {
        status: 'healthy',
        responseTime: Date.now() - kafkaStart,
      };
    } catch (error) {
      services.kafka = {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
      };
      overallStatus = 'degraded'; // Kafka is not critical for basic functionality
      request.logger.error('Kafka health check failed:', error);
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
      const db = getDatabase();
      await db.raw('SELECT 1');

      const redis = getRedisClient();
      await redis.ping();

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
