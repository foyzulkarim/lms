import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { checkDatabaseHealth } from '@/database/connection';
import { checkRedisHealth } from '@/redis/client';
import { checkRabbitMQHealth } from '@/rabbitmq/connection';
import { userService } from '@/services/user.service';
import { enrollmentService } from '@/services/enrollment.service';
import { preferenceService } from '@/services/preference.service';
import { HealthCheckResponse, MetricsResponse } from '@/types/api.types';
import { log } from '@/utils/logger';

const startTime = Date.now();

export async function healthRoutes(fastify: FastifyInstance) {
  // Basic health check
  fastify.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Basic health check',
      response: {
        200: HealthCheckResponse,
        503: HealthCheckResponse,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      
      // Check all services
      const [dbHealth, redisHealth, rabbitmqHealth] = await Promise.all([
        checkDatabaseHealth(),
        checkRedisHealth(),
        checkRabbitMQHealth(),
      ]);
      
      const allHealthy = 
        dbHealth.status === 'connected' &&
        redisHealth.status === 'connected' &&
        rabbitmqHealth.status === 'connected';
      
      const healthStatus = {
        status: allHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime,
        version: process.env.npm_package_version || '1.0.0',
        services: {
          database: {
            status: dbHealth.status,
            responseTime: dbHealth.responseTime,
          },
          redis: {
            status: redisHealth.status,
            responseTime: redisHealth.responseTime,
          },
          rabbitmq: {
            status: rabbitmqHealth.status,
            responseTime: rabbitmqHealth.responseTime,
          },
        },
      };
      
      const statusCode = allHealthy ? 200 : 503;
      
      reply.code(statusCode).send(healthStatus);
    } catch (error) {
      log.error('Health check failed', error);
      
      reply.code(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        version: process.env.npm_package_version || '1.0.0',
        services: {
          database: { status: 'disconnected' },
          redis: { status: 'disconnected' },
          rabbitmq: { status: 'disconnected' },
        },
      });
    }
  });
  
  // Liveness probe (for Kubernetes)
  fastify.get('/health/live', {
    schema: {
      tags: ['Health'],
      summary: 'Liveness probe',
      response: {
        200: Type.Object({
          status: Type.Literal('alive'),
          timestamp: Type.String({ format: 'date-time' }),
        }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    reply.code(200).send({
      status: 'alive',
      timestamp: new Date().toISOString(),
    });
  });
  
  // Readiness probe (for Kubernetes)
  fastify.get('/health/ready', {
    schema: {
      tags: ['Health'],
      summary: 'Readiness probe',
      response: {
        200: Type.Object({
          status: Type.Literal('ready'),
          timestamp: Type.String({ format: 'date-time' }),
        }),
        503: Type.Object({
          status: Type.Literal('not-ready'),
          timestamp: Type.String({ format: 'date-time' }),
          reason: Type.String(),
        }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check critical services
      const [dbHealth, redisHealth] = await Promise.all([
        checkDatabaseHealth(),
        checkRabbitMQHealth(),
      ]);
      
      const isReady = 
        dbHealth.status === 'connected' &&
        redisHealth.status === 'connected';
      
      if (isReady) {
        reply.code(200).send({
          status: 'ready',
          timestamp: new Date().toISOString(),
        });
      } else {
        reply.code(503).send({
          status: 'not-ready',
          timestamp: new Date().toISOString(),
          reason: 'Critical services unavailable',
        });
      }
    } catch (error) {
      log.error('Readiness check failed', error);
      
      reply.code(503).send({
        status: 'not-ready',
        timestamp: new Date().toISOString(),
        reason: 'Health check error',
      });
    }
  });
  
  // Detailed health check
  fastify.get('/health/detailed', {
    schema: {
      tags: ['Health'],
      summary: 'Detailed health check with service information',
      response: {
        200: Type.Object({
          status: Type.String(),
          timestamp: Type.String({ format: 'date-time' }),
          uptime: Type.Number(),
          version: Type.String(),
          services: Type.Any(),
          system: Type.Object({
            nodeVersion: Type.String(),
            platform: Type.String(),
            arch: Type.String(),
            memory: Type.Object({
              used: Type.Number(),
              total: Type.Number(),
              percentage: Type.Number(),
            }),
            cpu: Type.Object({
              usage: Type.Number(),
            }),
          }),
        }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      
      // Check all services
      const [dbHealth, redisHealth, rabbitmqHealth] = await Promise.all([
        checkDatabaseHealth(),
        checkRedisHealth(),
        checkRabbitMQHealth(),
      ]);
      
      // System information
      const memUsage = process.memoryUsage();
      const totalMemory = require('os').totalmem();
      const cpuUsage = process.cpuUsage();
      
      const allHealthy = 
        dbHealth.status === 'connected' &&
        redisHealth.status === 'connected' &&
        rabbitmqHealth.status === 'connected';
      
      const detailedHealth = {
        status: allHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime,
        version: process.env.npm_package_version || '1.0.0',
        services: {
          database: {
            status: dbHealth.status,
            responseTime: dbHealth.responseTime,
          },
          redis: {
            status: redisHealth.status,
            responseTime: redisHealth.responseTime,
          },
          rabbitmq: {
            status: rabbitmqHealth.status,
            responseTime: rabbitmqHealth.responseTime,
          },
        },
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          memory: {
            used: Math.round(memUsage.heapUsed / 1024 / 1024),
            total: Math.round(totalMemory / 1024 / 1024),
            percentage: Math.round((memUsage.heapUsed / totalMemory) * 100),
          },
          cpu: {
            usage: Math.round(((cpuUsage.user + cpuUsage.system) / 1000000) * 100) / 100,
          },
        },
      };
      
      reply.code(200).send(detailedHealth);
    } catch (error) {
      log.error('Detailed health check failed', error);
      
      reply.code(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        version: process.env.npm_package_version || '1.0.0',
        error: 'Health check failed',
      });
    }
  });
  
  // Metrics endpoint
  fastify.get('/metrics', {
    schema: {
      tags: ['Health'],
      summary: 'Service metrics',
      response: {
        200: MetricsResponse,
        500: Type.Object({
          error: Type.String(),
          timestamp: Type.String({ format: 'date-time' }),
        }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get service statistics
      const [userStats, enrollmentStats, preferenceStats] = await Promise.all([
        userService.getOverallStats().catch(() => ({})),
        enrollmentService.getOverallEnrollmentStats().catch(() => ({})),
        preferenceService.getPreferenceStats().catch(() => ({})),
      ]);
      
      const metrics = {
        users: {
          total: userStats.total || 0,
          active: userStats.byStatus?.active || 0,
          inactive: userStats.byStatus?.inactive || 0,
          suspended: userStats.byStatus?.suspended || 0,
          byRole: {
            admin: userStats.byRole?.admin || 0,
            instructor: userStats.byRole?.instructor || 0,
            student: userStats.byRole?.student || 0,
          },
        },
        enrollments: {
          total: enrollmentStats.total || 0,
          active: enrollmentStats.active || 0,
          completed: enrollmentStats.completed || 0,
          dropped: enrollmentStats.dropped || 0,
        },
        activity: {
          dailyActiveUsers: 0, // This would need to be tracked separately
          weeklyActiveUsers: 0, // This would need to be tracked separately
          monthlyActiveUsers: 0, // This would need to be tracked separately
        },
        performance: {
          averageResponseTime: 0, // This would need to be tracked separately
          requestsPerSecond: 0, // This would need to be tracked separately
          errorRate: 0, // This would need to be tracked separately
        },
      };
      
      reply.code(200).send(metrics);
    } catch (error) {
      log.error('Failed to get metrics', error);
      
      reply.code(500).send({
        error: 'Failed to retrieve metrics',
        timestamp: new Date().toISOString(),
      });
    }
  });
  
  // Service info
  fastify.get('/info', {
    schema: {
      tags: ['Health'],
      summary: 'Service information',
      response: {
        200: Type.Object({
          name: Type.String(),
          version: Type.String(),
          description: Type.String(),
          environment: Type.String(),
          uptime: Type.Number(),
          timestamp: Type.String({ format: 'date-time' }),
          build: Type.Object({
            nodeVersion: Type.String(),
            platform: Type.String(),
            arch: Type.String(),
          }),
        }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    
    reply.code(200).send({
      name: 'User Service',
      version: process.env.npm_package_version || '1.0.0',
      description: 'User Service for LMS - Manages user profiles, enrollments, and preferences',
      environment: process.env.NODE_ENV || 'development',
      uptime,
      timestamp: new Date().toISOString(),
      build: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    });
  });
}
