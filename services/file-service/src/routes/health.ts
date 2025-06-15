import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { HealthStatus } from '@/types';
import { checkDatabaseHealth } from '@/database/connection';
import { StorageFactory } from '@/storage/storage-factory';
import { FileServiceLogger } from '@/utils/logger';

export async function healthRoutes(fastify: FastifyInstance) {
  
  // Basic health check
  fastify.get('/', {
    schema: {
      response: {
        200: Type.Object({
          status: Type.String(),
          timestamp: Type.String(),
          uptime: Type.Number()
        })
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Kubernetes liveness probe
  fastify.get('/live', {
    schema: {
      response: {
        200: Type.Object({
          status: Type.String()
        })
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Simple liveness check - if the process is running, it's alive
    reply.send({ status: 'alive' });
  });

  // Kubernetes readiness probe
  fastify.get('/ready', {
    schema: {
      response: {
        200: Type.Object({
          status: Type.String(),
          checks: Type.Object({
            database: Type.String(),
            storage: Type.String()
          })
        }),
        503: Type.Object({
          status: Type.String(),
          checks: Type.Object({
            database: Type.String(),
            storage: Type.String()
          })
        })
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const checks = {
      database: 'unknown',
      storage: 'unknown'
    };

    let isReady = true;

    // Check database
    try {
      const dbHealth = await checkDatabaseHealth();
      checks.database = dbHealth.status;
      if (dbHealth.status !== 'healthy') {
        isReady = false;
      }
    } catch (error) {
      checks.database = 'unhealthy';
      isReady = false;
    }

    // Check storage
    try {
      const storageHealth = await StorageFactory.healthCheck();
      checks.storage = storageHealth.status;
      if (storageHealth.status !== 'healthy') {
        isReady = false;
      }
    } catch (error) {
      checks.storage = 'unhealthy';
      isReady = false;
    }

    const status = isReady ? 'ready' : 'not ready';
    const statusCode = isReady ? 200 : 503;

    reply.status(statusCode).send({
      status,
      checks
    });
  });

  // Detailed health check
  fastify.get('/detailed', {
    schema: {
      response: {
        200: Type.Object({
          status: Type.Union([
            Type.Literal('healthy'),
            Type.Literal('unhealthy'),
            Type.Literal('degraded')
          ]),
          timestamp: Type.String(),
          uptime: Type.Number(),
          version: Type.String(),
          checks: Type.Object({
            database: Type.Object({
              status: Type.String(),
              responseTime: Type.Optional(Type.Number()),
              error: Type.Optional(Type.String())
            }),
            storage: Type.Object({
              status: Type.String(),
              responseTime: Type.Optional(Type.Number()),
              error: Type.Optional(Type.String())
            }),
            memory: Type.Object({
              status: Type.String(),
              used: Type.Number(),
              total: Type.Number(),
              percentage: Type.Number()
            }),
            disk: Type.Object({
              status: Type.String(),
              available: Type.Optional(Type.Number()),
              used: Type.Optional(Type.Number()),
              percentage: Type.Optional(Type.Number())
            })
          }),
          metrics: Type.Object({
            totalFiles: Type.Number(),
            totalSize: Type.Number(),
            processingJobs: Type.Object({
              pending: Type.Number(),
              active: Type.Number(),
              failed: Type.Number()
            })
          })
        })
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    const healthStatus: HealthStatus = {
      status: 'healthy',
      timestamp: new Date(),
      uptime: process.uptime(),
      checks: {
        database: { status: 'healthy' },
        redis: { status: 'healthy' },
        storage: { status: 'healthy' },
        queue: { status: 'healthy' }
      }
    };

    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    const unhealthyServices: string[] = [];
    const degradedServices: string[] = [];

    // Check database
    try {
      const dbStartTime = Date.now();
      const dbHealth = await checkDatabaseHealth();
      const dbResponseTime = Date.now() - dbStartTime;
      
      healthStatus.checks.database = {
        status: dbHealth.status,
        responseTime: dbResponseTime,
        error: dbHealth.error
      };

      if (dbHealth.status === 'unhealthy') {
        unhealthyServices.push('database');
      }

      FileServiceLogger.logHealthCheck('database', dbHealth.status, dbResponseTime, dbHealth.error);
    } catch (error) {
      healthStatus.checks.database = {
        status: 'unhealthy',
        error: (error as Error).message
      };
      unhealthyServices.push('database');
      FileServiceLogger.logHealthCheck('database', 'unhealthy', undefined, (error as Error).message);
    }

    // Check storage
    try {
      const storageStartTime = Date.now();
      const storageHealth = await StorageFactory.healthCheck();
      const storageResponseTime = Date.now() - storageStartTime;
      
      healthStatus.checks.storage = {
        status: storageHealth.status,
        responseTime: storageResponseTime,
        error: storageHealth.error
      };

      if (storageHealth.status === 'unhealthy') {
        unhealthyServices.push('storage');
      }

      FileServiceLogger.logHealthCheck('storage', storageHealth.status, storageResponseTime, storageHealth.error);
    } catch (error) {
      healthStatus.checks.storage = {
        status: 'unhealthy',
        error: (error as Error).message
      };
      unhealthyServices.push('storage');
      FileServiceLogger.logHealthCheck('storage', 'unhealthy', undefined, (error as Error).message);
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    const memoryPercentage = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
    const memoryStatus = memoryPercentage > 90 ? 'unhealthy' : 
                        memoryPercentage > 75 ? 'degraded' : 'healthy';

    const memoryCheck = {
      status: memoryStatus,
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: memoryPercentage
    };

    if (memoryStatus === 'unhealthy') {
      unhealthyServices.push('memory');
    } else if (memoryStatus === 'degraded') {
      degradedServices.push('memory');
    }

    // Check disk usage (if available)
    let diskCheck = {
      status: 'healthy' as const,
      available: undefined as number | undefined,
      used: undefined as number | undefined,
      percentage: undefined as number | undefined
    };

    try {
      // This would require additional implementation for disk checking
      // For now, we'll just mark it as healthy
      diskCheck.status = 'healthy';
    } catch (error) {
      diskCheck.status = 'unhealthy';
      unhealthyServices.push('disk');
    }

    // Get system metrics
    let metrics = {
      totalFiles: 0,
      totalSize: 0,
      processingJobs: {
        pending: 0,
        active: 0,
        failed: 0
      }
    };

    try {
      // Get file statistics
      const db = require('@/database/connection').getDatabase();
      
      const [fileStats] = await db('files')
        .where({ deleted_at: null })
        .count('* as count')
        .sum('size as total_size');

      metrics.totalFiles = parseInt(fileStats.count as string) || 0;
      metrics.totalSize = parseInt(fileStats.total_size as string) || 0;

      // Get processing job statistics
      const jobStats = await db('processing_jobs')
        .select('status')
        .count('* as count')
        .groupBy('status');

      for (const stat of jobStats) {
        const count = parseInt(stat.count as string);
        switch (stat.status) {
          case 'pending':
            metrics.processingJobs.pending = count;
            break;
          case 'in_progress':
            metrics.processingJobs.active = count;
            break;
          case 'failed':
            metrics.processingJobs.failed = count;
            break;
        }
      }
    } catch (error) {
      // Metrics collection failed, but don't fail the health check
      FileServiceLogger.logHealthCheck('metrics', 'degraded', undefined, (error as Error).message);
    }

    // Determine overall status
    if (unhealthyServices.length > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedServices.length > 0) {
      overallStatus = 'degraded';
    }

    const totalResponseTime = Date.now() - startTime;

    reply.send({
      status: overallStatus,
      timestamp: healthStatus.timestamp.toISOString(),
      uptime: healthStatus.uptime,
      version: process.env.npm_package_version || '1.0.0',
      checks: {
        database: healthStatus.checks.database,
        storage: healthStatus.checks.storage,
        memory: memoryCheck,
        disk: diskCheck
      },
      metrics,
      responseTime: totalResponseTime
    });

    // Log overall health status
    FileServiceLogger.logHealthCheck('overall', overallStatus, totalResponseTime);
  });

  // Service dependencies check
  fastify.get('/dependencies', {
    schema: {
      response: {
        200: Type.Object({
          dependencies: Type.Array(Type.Object({
            name: Type.String(),
            status: Type.String(),
            responseTime: Type.Optional(Type.Number()),
            version: Type.Optional(Type.String()),
            error: Type.Optional(Type.String())
          }))
        })
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const dependencies = [];

    // Check database
    try {
      const startTime = Date.now();
      const dbHealth = await checkDatabaseHealth();
      const responseTime = Date.now() - startTime;
      
      dependencies.push({
        name: 'PostgreSQL Database',
        status: dbHealth.status,
        responseTime,
        error: dbHealth.error
      });
    } catch (error) {
      dependencies.push({
        name: 'PostgreSQL Database',
        status: 'unhealthy',
        error: (error as Error).message
      });
    }

    // Check storage
    try {
      const startTime = Date.now();
      const storageHealth = await StorageFactory.healthCheck();
      const responseTime = Date.now() - startTime;
      
      dependencies.push({
        name: 'Storage Backend',
        status: storageHealth.status,
        responseTime,
        error: storageHealth.error
      });
    } catch (error) {
      dependencies.push({
        name: 'Storage Backend',
        status: 'unhealthy',
        error: (error as Error).message
      });
    }

    // Add other dependencies as needed (Redis, message queue, etc.)

    reply.send({ dependencies });
  });

  // Performance metrics endpoint
  fastify.get('/metrics', {
    schema: {
      response: {
        200: Type.Object({
          process: Type.Object({
            uptime: Type.Number(),
            memory: Type.Object({
              rss: Type.Number(),
              heapTotal: Type.Number(),
              heapUsed: Type.Number(),
              external: Type.Number()
            }),
            cpu: Type.Object({
              user: Type.Number(),
              system: Type.Number()
            })
          }),
          system: Type.Object({
            loadAverage: Type.Array(Type.Number()),
            platform: Type.String(),
            arch: Type.String(),
            nodeVersion: Type.String()
          }),
          application: Type.Object({
            totalRequests: Type.Number(),
            activeConnections: Type.Number(),
            averageResponseTime: Type.Number()
          })
        })
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    reply.send({
      process: {
        uptime: process.uptime(),
        memory: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external
        },
        cpu: {
          user: cpuUsage.user / 1000000, // Convert to seconds
          system: cpuUsage.system / 1000000
        }
      },
      system: {
        loadAverage: require('os').loadavg(),
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version
      },
      application: {
        totalRequests: 0, // Would be tracked by middleware
        activeConnections: 0, // Would be tracked by server
        averageResponseTime: 0 // Would be calculated from request logs
      }
    });
  });
}
