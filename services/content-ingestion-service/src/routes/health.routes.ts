import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { checkDatabaseHealth, checkVectorDatabaseHealth } from '@/utils/database';
import { llmGatewayService } from '@/services/llm-gateway.service';
import { fileService } from '@/services/file.service';
import { youTubeAdapter } from '@/adapters/youtube.adapter';
import { gitHubAdapter } from '@/adapters/github.adapter';
import { contentLogger } from '@/utils/logger';
import { config } from '@/config/environment';

interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  environment: string;
  services: {
    database: ServiceHealth;
    vectorDatabase: ServiceHealth;
    llmGateway: ServiceHealth;
    fileService: ServiceHealth;
    youtubeAdapter: ServiceHealth;
    githubAdapter: ServiceHealth;
  };
  system: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
  };
}

interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'unknown';
  responseTime?: number;
  error?: string;
  details?: any;
}

export async function healthRoutes(fastify: FastifyInstance) {
  /**
   * Liveness probe - basic health check
   */
  fastify.get('/health', {
    schema: {
      description: 'Basic health check endpoint',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  /**
   * Readiness probe - comprehensive health check
   */
  fastify.get('/health/ready', {
    schema: {
      description: 'Comprehensive readiness check',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            version: { type: 'string' },
            uptime: { type: 'number' },
            environment: { type: 'string' },
            services: { type: 'object' },
            system: { type: 'object' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      const healthCheck: HealthCheckResult = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime(),
        environment: config.NODE_ENV,
        services: {
          database: await checkServiceHealth('database', checkDatabaseHealth),
          vectorDatabase: await checkServiceHealth('vectorDatabase', checkVectorDatabaseHealth),
          llmGateway: await checkServiceHealth('llmGateway', () => llmGatewayService.healthCheck()),
          fileService: await checkServiceHealth('fileService', () => fileService.healthCheck()),
          youtubeAdapter: await checkServiceHealth('youtubeAdapter', () => youTubeAdapter.healthCheck()),
          githubAdapter: await checkServiceHealth('githubAdapter', () => gitHubAdapter.healthCheck()),
        },
        system: await getSystemHealth(),
      };

      // Determine overall status
      const serviceStatuses = Object.values(healthCheck.services);
      const unhealthyServices = serviceStatuses.filter(s => s.status === 'unhealthy');
      const unknownServices = serviceStatuses.filter(s => s.status === 'unknown');

      if (unhealthyServices.length > 0) {
        healthCheck.status = 'unhealthy';
      } else if (unknownServices.length > 0) {
        healthCheck.status = 'degraded';
      }

      const statusCode = healthCheck.status === 'healthy' ? 200 : 
                        healthCheck.status === 'degraded' ? 200 : 503;

      const duration = Date.now() - startTime;
      contentLogger.info('Health check completed', {
        status: healthCheck.status,
        duration,
        unhealthyServices: unhealthyServices.length,
        unknownServices: unknownServices.length,
      });

      return reply.status(statusCode).send(healthCheck);
    } catch (error) {
      const duration = Date.now() - startTime;
      contentLogger.error('Health check failed', error as Error, { duration });
      
      return reply.status(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Deep health check with detailed diagnostics
   */
  fastify.get('/health/deep', {
    schema: {
      description: 'Deep health check with detailed diagnostics',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      const diagnostics = {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: config.NODE_ENV,
        uptime: process.uptime(),
        
        // System information
        system: {
          ...await getSystemHealth(),
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          pid: process.pid,
        },
        
        // Configuration
        configuration: {
          chunkSize: config.CHUNK_SIZE,
          embeddingModel: config.EMBEDDING_MODEL,
          enableOCR: config.ENABLE_OCR,
          enableSpeechToText: config.ENABLE_SPEECH_TO_TEXT,
          maxConcurrentJobs: config.MAX_CONCURRENT_JOBS,
        },
        
        // Service details
        services: {
          database: await checkServiceHealthDetailed('database', checkDatabaseHealth),
          vectorDatabase: await checkServiceHealthDetailed('vectorDatabase', checkVectorDatabaseHealth),
          llmGateway: await checkServiceHealthDetailed('llmGateway', async () => {
            const isHealthy = await llmGatewayService.healthCheck();
            return {
              healthy: isHealthy,
              stats: llmGatewayService.getStats(),
            };
          }),
          fileService: await checkServiceHealthDetailed('fileService', async () => {
            const isHealthy = await fileService.healthCheck();
            return {
              healthy: isHealthy,
              stats: fileService.getStats(),
            };
          }),
          youtubeAdapter: await checkServiceHealthDetailed('youtubeAdapter', async () => {
            const isHealthy = await youTubeAdapter.healthCheck();
            return {
              healthy: isHealthy,
              stats: youTubeAdapter.getStats(),
            };
          }),
          githubAdapter: await checkServiceHealthDetailed('githubAdapter', async () => {
            const isHealthy = await gitHubAdapter.healthCheck();
            return {
              healthy: isHealthy,
              stats: gitHubAdapter.getStats(),
            };
          }),
        },
        
        // Performance metrics
        performance: {
          healthCheckDuration: Date.now() - startTime,
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage(),
        },
      };

      return reply.send(diagnostics);
    } catch (error) {
      contentLogger.error('Deep health check failed', error as Error);
      
      return reply.status(500).send({
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * Service-specific health checks
   */
  fastify.get<{
    Params: { service: string };
  }>('/health/:service', {
    schema: {
      description: 'Check health of a specific service',
      tags: ['Health'],
      params: {
        type: 'object',
        required: ['service'],
        properties: {
          service: { 
            type: 'string',
            enum: ['database', 'vector-database', 'llm-gateway', 'file-service', 'youtube', 'github']
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { service } = request.params as { service: string };
    const startTime = Date.now();
    
    try {
      let result: ServiceHealth;
      
      switch (service) {
        case 'database':
          result = await checkServiceHealth('database', checkDatabaseHealth);
          break;
        case 'vector-database':
          result = await checkServiceHealth('vectorDatabase', checkVectorDatabaseHealth);
          break;
        case 'llm-gateway':
          result = await checkServiceHealth('llmGateway', () => llmGatewayService.healthCheck());
          break;
        case 'file-service':
          result = await checkServiceHealth('fileService', () => fileService.healthCheck());
          break;
        case 'youtube':
          result = await checkServiceHealth('youtubeAdapter', () => youTubeAdapter.healthCheck());
          break;
        case 'github':
          result = await checkServiceHealth('githubAdapter', () => gitHubAdapter.healthCheck());
          break;
        default:
          return reply.status(404).send({
            error: 'Service not found',
            message: `Unknown service: ${service}`,
          });
      }

      const statusCode = result.status === 'healthy' ? 200 : 503;
      
      return reply.status(statusCode).send({
        service,
        ...result,
        timestamp: new Date().toISOString(),
        checkDuration: Date.now() - startTime,
      });
    } catch (error) {
      contentLogger.error(`Health check failed for service: ${service}`, error as Error);
      
      return reply.status(503).send({
        service,
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  });
}

/**
 * Check health of a service
 */
async function checkServiceHealth(
  serviceName: string,
  healthCheckFn: () => Promise<boolean>
): Promise<ServiceHealth> {
  const startTime = Date.now();
  
  try {
    const isHealthy = await Promise.race([
      healthCheckFn(),
      new Promise<boolean>((_, reject) => 
        setTimeout(() => reject(new Error('Health check timeout')), config.HEALTH_CHECK_TIMEOUT)
      ),
    ]);
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check health of a service with detailed information
 */
async function checkServiceHealthDetailed(
  serviceName: string,
  healthCheckFn: () => Promise<any>
): Promise<any> {
  const startTime = Date.now();
  
  try {
    const result = await Promise.race([
      healthCheckFn(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Health check timeout')), config.HEALTH_CHECK_TIMEOUT)
      ),
    ]);
    
    return {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      details: result,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get system health information
 */
async function getSystemHealth(): Promise<any> {
  const memUsage = process.memoryUsage();
  const totalMemory = require('os').totalmem();
  const freeMemory = require('os').freemem();
  const usedMemory = totalMemory - freeMemory;
  
  return {
    memory: {
      used: usedMemory,
      total: totalMemory,
      percentage: Math.round((usedMemory / totalMemory) * 100),
      process: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
      },
    },
    cpu: {
      usage: process.cpuUsage(),
      loadAverage: require('os').loadavg(),
    },
    disk: {
      // TODO: Add disk usage information if needed
    },
  };
}
