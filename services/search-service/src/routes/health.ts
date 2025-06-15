import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { SearchService } from '../services/SearchService';
import { checkRedisHealth } from '../utils/cache-manager';
import { config } from '../config';
import { logger } from '../utils/logger';

// Health check response schema
const HealthResponseSchema = Type.Object({
  status: Type.Union([
    Type.Literal('healthy'),
    Type.Literal('unhealthy'),
    Type.Literal('degraded'),
  ]),
  timestamp: Type.String(),
  uptime: Type.Number(),
  version: Type.String(),
  services: Type.Object({
    elasticsearch: Type.Object({
      status: Type.Union([
        Type.Literal('connected'),
        Type.Literal('disconnected'),
      ]),
      responseTime: Type.Optional(Type.Number()),
    }),
    redis: Type.Object({
      status: Type.Union([
        Type.Literal('connected'),
        Type.Literal('disconnected'),
      ]),
      responseTime: Type.Optional(Type.Number()),
    }),
    circuitBreaker: Type.Optional(Type.Object({
      state: Type.String(),
      failures: Type.Number(),
      successes: Type.Number(),
    })),
  }),
  metrics: Type.Optional(Type.Object({
    memoryUsage: Type.Object({
      used: Type.Number(),
      total: Type.Number(),
      percentage: Type.Number(),
    }),
    cpuUsage: Type.Optional(Type.Number()),
  })),
});

const DetailedHealthResponseSchema = Type.Object({
  status: Type.Union([
    Type.Literal('healthy'),
    Type.Literal('unhealthy'),
    Type.Literal('degraded'),
  ]),
  timestamp: Type.String(),
  uptime: Type.Number(),
  version: Type.String(),
  services: Type.Object({
    elasticsearch: Type.Object({
      status: Type.String(),
      responseTime: Type.Optional(Type.Number()),
      clusterHealth: Type.Optional(Type.String()),
      indices: Type.Optional(Type.Array(Type.Object({
        name: Type.String(),
        health: Type.String(),
        documentCount: Type.Number(),
        size: Type.String(),
      }))),
    }),
    redis: Type.Object({
      status: Type.String(),
      responseTime: Type.Optional(Type.Number()),
      memoryUsage: Type.Optional(Type.String()),
      connectedClients: Type.Optional(Type.Number()),
    }),
    circuitBreaker: Type.Optional(Type.Object({
      state: Type.String(),
      failures: Type.Number(),
      successes: Type.Number(),
      lastFailure: Type.Optional(Type.String()),
    })),
  }),
  metrics: Type.Object({
    memoryUsage: Type.Object({
      used: Type.Number(),
      total: Type.Number(),
      percentage: Type.Number(),
      heapUsed: Type.Number(),
      heapTotal: Type.Number(),
    }),
    cpuUsage: Type.Optional(Type.Number()),
    eventLoop: Type.Optional(Type.Object({
      delay: Type.Number(),
      utilization: Type.Number(),
    })),
  }),
  cache: Type.Optional(Type.Object({
    memoryCache: Type.Object({
      size: Type.Number(),
      maxSize: Type.Number(),
      hitRate: Type.Optional(Type.Number()),
    }),
    redisCache: Type.Object({
      connected: Type.Boolean(),
      keyCount: Type.Optional(Type.Number()),
    }),
  })),
});

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  const searchService = fastify.searchService as SearchService;
  const startTime = Date.now();

  // Basic health check
  fastify.get('/health', {
    schema: {
      description: 'Basic health check endpoint',
      tags: ['Health'],
      response: {
        200: HealthResponseSchema,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const healthData = await searchService.getHealth();
      const uptime = Date.now() - startTime;

      // Determine overall status
      let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
      
      if (!healthData.searchEngine || !healthData.cache) {
        status = 'unhealthy';
      } else if (healthData.circuitBreaker.state === 'open') {
        status = 'degraded';
      }

      // Get memory usage
      const memUsage = process.memoryUsage();
      const totalMemory = memUsage.heapTotal + memUsage.external;
      const usedMemory = memUsage.heapUsed;

      const response = {
        status,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(uptime / 1000), // in seconds
        version: '1.0.0',
        services: {
          elasticsearch: {
            status: healthData.searchEngine ? 'connected' : 'disconnected',
          },
          redis: {
            status: healthData.cache ? 'connected' : 'disconnected',
          },
          circuitBreaker: healthData.circuitBreaker,
        },
        metrics: {
          memoryUsage: {
            used: usedMemory,
            total: totalMemory,
            percentage: Math.round((usedMemory / totalMemory) * 100),
          },
        },
      };

      reply.code(status === 'healthy' ? 200 : 503).send(response);
    } catch (error) {
      logger.error('Health check error:', error);
      reply.code(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        version: '1.0.0',
        services: {
          elasticsearch: { status: 'disconnected' },
          redis: { status: 'disconnected' },
        },
      });
    }
  });

  // Liveness probe (for Kubernetes)
  fastify.get('/health/live', {
    schema: {
      description: 'Liveness probe endpoint',
      tags: ['Health'],
      response: {
        200: Type.Object({
          status: Type.Literal('alive'),
          timestamp: Type.String(),
        }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({
      status: 'alive',
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness probe (for Kubernetes)
  fastify.get('/health/ready', {
    schema: {
      description: 'Readiness probe endpoint',
      tags: ['Health'],
      response: {
        200: Type.Object({
          status: Type.Literal('ready'),
          timestamp: Type.String(),
        }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const healthData = await searchService.getHealth();
      
      if (healthData.searchEngine && healthData.cache) {
        reply.send({
          status: 'ready',
          timestamp: new Date().toISOString(),
        });
      } else {
        reply.code(503).send({
          status: 'not_ready',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('Readiness check error:', error);
      reply.code(503).send({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Detailed health check (admin only)
  fastify.get('/health/detailed', {
    schema: {
      description: 'Detailed health check with comprehensive metrics',
      tags: ['Health', 'Admin'],
      response: {
        200: DetailedHealthResponseSchema,
      },
    },
    preHandler: [fastify.optionalAuthenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      
      // Only provide detailed health info to admins or in development
      if (!config.isDevelopment && (!user || user.role !== 'admin')) {
        reply.code(403).send({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Detailed health information requires admin access',
          },
        });
        return;
      }

      const [healthData, redisHealth] = await Promise.all([
        searchService.getHealth(),
        checkRedisHealth(),
      ]);

      const uptime = Date.now() - startTime;

      // Get detailed memory usage
      const memUsage = process.memoryUsage();
      const totalMemory = memUsage.heapTotal + memUsage.external;
      const usedMemory = memUsage.heapUsed;

      // Get CPU usage (simplified)
      const cpuUsage = process.cpuUsage();
      const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds

      // Determine overall status
      let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
      
      if (!healthData.searchEngine || !healthData.cache) {
        status = 'unhealthy';
      } else if (healthData.circuitBreaker.state === 'open') {
        status = 'degraded';
      }

      const response = {
        status,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(uptime / 1000),
        version: '1.0.0',
        services: {
          elasticsearch: {
            status: healthData.searchEngine ? 'connected' : 'disconnected',
            clusterHealth: healthData.searchEngine ? 'green' : 'red',
          },
          redis: {
            status: redisHealth ? 'connected' : 'disconnected',
          },
          circuitBreaker: healthData.circuitBreaker,
        },
        metrics: {
          memoryUsage: {
            used: usedMemory,
            total: totalMemory,
            percentage: Math.round((usedMemory / totalMemory) * 100),
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
          },
          cpuUsage: cpuPercent,
        },
      };

      reply.send(response);
    } catch (error) {
      logger.error('Detailed health check error:', error);
      reply.code(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        version: '1.0.0',
        services: {
          elasticsearch: { status: 'disconnected' },
          redis: { status: 'disconnected' },
        },
        metrics: {
          memoryUsage: {
            used: 0,
            total: 0,
            percentage: 0,
            heapUsed: 0,
            heapTotal: 0,
          },
        },
      });
    }
  });

  // Service metrics endpoint (admin only)
  fastify.get('/metrics', {
    schema: {
      description: 'Service metrics endpoint',
      tags: ['Health', 'Admin'],
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          data: Type.Object({
            uptime: Type.Number(),
            memory: Type.Object({}),
            cpu: Type.Object({}),
            eventLoop: Type.Object({}),
            gc: Type.Optional(Type.Object({})),
          }),
        }),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const uptime = process.uptime();
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      // Event loop metrics
      const eventLoopDelay = await new Promise<number>((resolve) => {
        const start = process.hrtime.bigint();
        setImmediate(() => {
          const delta = process.hrtime.bigint() - start;
          resolve(Number(delta) / 1000000); // Convert to milliseconds
        });
      });

      const metrics = {
        uptime,
        memory: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
          arrayBuffers: memUsage.arrayBuffers,
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        eventLoop: {
          delay: eventLoopDelay,
        },
      };

      reply.send({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error('Metrics endpoint error:', error);
      reply.code(500).send({
        success: false,
        error: {
          code: 'METRICS_ERROR',
          message: 'Failed to retrieve metrics',
        },
      });
    }
  });
}

export default healthRoutes;
