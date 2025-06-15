import { FastifyRequest, FastifyReply } from 'fastify';
import { analyticsService } from '@/services/analytics.service';
import { dashboardService } from '@/services/dashboard.service';
import { 
  Timeframe, 
  TimeframeSchema,
  FiltersSchema,
  ProgressStatus,
  ValidationError,
  NotFoundError
} from '@/types/analytics.types';
import { logger, structuredLog } from '@/utils/logger';
import { recordHttpRequest } from '@/utils/metrics';

export class AnalyticsController {

  // ============================================================================
  // Dashboard Endpoints
  // ============================================================================

  async getDashboard(request: FastifyRequest, reply: FastifyReply) {
    const startTime = Date.now();
    
    try {
      const query = request.query as any;
      
      // Validate timeframe
      const timeframe = TimeframeSchema.parse(query.timeframe || '30d');
      
      // Parse filters if provided
      let filters;
      if (query.filters) {
        try {
          const parsedFilters = JSON.parse(query.filters);
          filters = FiltersSchema.parse(parsedFilters);
        } catch (error) {
          throw new ValidationError('Invalid filters format');
        }
      }

      const dashboard = await dashboardService.getDashboard(timeframe, filters);
      
      recordHttpRequest('GET', '/api/v1/dashboard', 200, Date.now() - startTime);
      
      return reply.code(200).send({
        success: true,
        data: dashboard,
      });
    } catch (error) {
      recordHttpRequest('GET', '/api/v1/dashboard', 500, Date.now() - startTime);
      structuredLog.request.logError(request, error as Error);
      
      if (error instanceof ValidationError) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }
      
      logger.error('Dashboard request failed', { error });
      return reply.code(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get dashboard data',
        },
      });
    }
  }

  // ============================================================================
  // User Analytics Endpoints
  // ============================================================================

  async getUserAnalytics(request: FastifyRequest, reply: FastifyReply) {
    const startTime = Date.now();
    
    try {
      const params = request.params as { userId: string };
      const query = request.query as { useCache?: string };
      
      if (!params.userId) {
        throw new ValidationError('User ID is required');
      }

      const useCache = query.useCache !== 'false';
      const analytics = await analyticsService.getUserAnalytics(params.userId, useCache);
      
      recordHttpRequest('GET', '/api/v1/users/:userId/analytics', 200, Date.now() - startTime);
      
      return reply.code(200).send({
        success: true,
        data: analytics,
      });
    } catch (error) {
      recordHttpRequest('GET', '/api/v1/users/:userId/analytics', 500, Date.now() - startTime);
      structuredLog.request.logError(request, error as Error);
      
      if (error instanceof ValidationError) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }
      
      if (error instanceof NotFoundError) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: error.message,
          },
        });
      }
      
      logger.error('Get user analytics failed', { error, userId: (request.params as any).userId });
      return reply.code(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get user analytics',
        },
      });
    }
  }

  async getTopPerformers(request: FastifyRequest, reply: FastifyReply) {
    const startTime = Date.now();
    
    try {
      const query = request.query as { limit?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 10;
      
      if (limit < 1 || limit > 100) {
        throw new ValidationError('Limit must be between 1 and 100');
      }

      const topPerformers = await analyticsService.getTopPerformers(limit);
      
      recordHttpRequest('GET', '/api/v1/analytics/top-performers', 200, Date.now() - startTime);
      
      return reply.code(200).send({
        success: true,
        data: topPerformers,
      });
    } catch (error) {
      recordHttpRequest('GET', '/api/v1/analytics/top-performers', 500, Date.now() - startTime);
      structuredLog.request.logError(request, error as Error);
      
      if (error instanceof ValidationError) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }
      
      logger.error('Get top performers failed', { error });
      return reply.code(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get top performers',
        },
      });
    }
  }

  // ============================================================================
  // Course Analytics Endpoints
  // ============================================================================

  async getCourseAnalytics(request: FastifyRequest, reply: FastifyReply) {
    const startTime = Date.now();
    
    try {
      const params = request.params as { courseId: string };
      const query = request.query as { useCache?: string };
      
      if (!params.courseId) {
        throw new ValidationError('Course ID is required');
      }

      const useCache = query.useCache !== 'false';
      const analytics = await analyticsService.getCourseAnalytics(params.courseId, useCache);
      
      recordHttpRequest('GET', '/api/v1/courses/:courseId/analytics', 200, Date.now() - startTime);
      
      return reply.code(200).send({
        success: true,
        data: analytics,
      });
    } catch (error) {
      recordHttpRequest('GET', '/api/v1/courses/:courseId/analytics', 500, Date.now() - startTime);
      structuredLog.request.logError(request, error as Error);
      
      if (error instanceof ValidationError) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }
      
      if (error instanceof NotFoundError) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: error.message,
          },
        });
      }
      
      logger.error('Get course analytics failed', { error, courseId: (request.params as any).courseId });
      return reply.code(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get course analytics',
        },
      });
    }
  }

  async getPopularCourses(request: FastifyRequest, reply: FastifyReply) {
    const startTime = Date.now();
    
    try {
      const query = request.query as { limit?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 10;
      
      if (limit < 1 || limit > 100) {
        throw new ValidationError('Limit must be between 1 and 100');
      }

      const popularCourses = await analyticsService.getPopularCourses(limit);
      
      recordHttpRequest('GET', '/api/v1/analytics/popular-courses', 200, Date.now() - startTime);
      
      return reply.code(200).send({
        success: true,
        data: popularCourses,
      });
    } catch (error) {
      recordHttpRequest('GET', '/api/v1/analytics/popular-courses', 500, Date.now() - startTime);
      structuredLog.request.logError(request, error as Error);
      
      if (error instanceof ValidationError) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }
      
      logger.error('Get popular courses failed', { error });
      return reply.code(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get popular courses',
        },
      });
    }
  }

  // ============================================================================
  // Learning Progress Endpoints
  // ============================================================================

  async getLearningProgress(request: FastifyRequest, reply: FastifyReply) {
    const startTime = Date.now();
    
    try {
      const query = request.query as {
        userId?: string;
        courseId?: string;
        status?: string;
        limit?: string;
        offset?: string;
      };

      // Validate status if provided
      let status: ProgressStatus | undefined;
      if (query.status) {
        const validStatuses = ['not_started', 'in_progress', 'completed', 'dropped'];
        if (!validStatuses.includes(query.status)) {
          throw new ValidationError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }
        status = query.status as ProgressStatus;
      }

      // Validate pagination parameters
      const limit = query.limit ? parseInt(query.limit, 10) : 50;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;
      
      if (limit < 1 || limit > 1000) {
        throw new ValidationError('Limit must be between 1 and 1000');
      }
      
      if (offset < 0) {
        throw new ValidationError('Offset must be non-negative');
      }

      const result = await analyticsService.getLearningProgress({
        userId: query.userId,
        courseId: query.courseId,
        status,
        limit,
        offset,
      });
      
      recordHttpRequest('GET', '/api/v1/learning-progress', 200, Date.now() - startTime);
      
      return reply.code(200).send({
        success: true,
        data: result.data,
        pagination: {
          total: result.total,
          limit,
          offset,
          hasMore: offset + limit < result.total,
        },
      });
    } catch (error) {
      recordHttpRequest('GET', '/api/v1/learning-progress', 500, Date.now() - startTime);
      structuredLog.request.logError(request, error as Error);
      
      if (error instanceof ValidationError) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }
      
      logger.error('Get learning progress failed', { error });
      return reply.code(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get learning progress',
        },
      });
    }
  }

  // ============================================================================
  // Cache Management Endpoints
  // ============================================================================

  async invalidateCache(request: FastifyRequest, reply: FastifyReply) {
    const startTime = Date.now();
    
    try {
      const body = request.body as {
        type?: 'dashboard' | 'user' | 'course' | 'all';
        keys?: string[];
        timeframes?: Timeframe[];
      };

      const type = body.type || 'all';
      
      switch (type) {
        case 'dashboard':
          await dashboardService.invalidateDashboardCache(body.timeframes);
          break;
        case 'user':
          // Implement user cache invalidation
          logger.info('User cache invalidation requested', { keys: body.keys });
          break;
        case 'course':
          // Implement course cache invalidation
          logger.info('Course cache invalidation requested', { keys: body.keys });
          break;
        case 'all':
          await dashboardService.invalidateDashboardCache();
          logger.info('All caches invalidation requested');
          break;
        default:
          throw new ValidationError('Invalid cache type');
      }
      
      recordHttpRequest('POST', '/api/v1/analytics/cache/invalidate', 200, Date.now() - startTime);
      
      return reply.code(200).send({
        success: true,
        message: `${type} cache invalidated successfully`,
      });
    } catch (error) {
      recordHttpRequest('POST', '/api/v1/analytics/cache/invalidate', 500, Date.now() - startTime);
      structuredLog.request.logError(request, error as Error);
      
      if (error instanceof ValidationError) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }
      
      logger.error('Cache invalidation failed', { error });
      return reply.code(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to invalidate cache',
        },
      });
    }
  }

  async warmupCache(request: FastifyRequest, reply: FastifyReply) {
    const startTime = Date.now();
    
    try {
      // Start cache warmup in background
      dashboardService.warmupDashboardCache().catch(error => {
        logger.error('Cache warmup failed', { error });
      });
      
      recordHttpRequest('POST', '/api/v1/analytics/cache/warmup', 202, Date.now() - startTime);
      
      return reply.code(202).send({
        success: true,
        message: 'Cache warmup started',
      });
    } catch (error) {
      recordHttpRequest('POST', '/api/v1/analytics/cache/warmup', 500, Date.now() - startTime);
      structuredLog.request.logError(request, error as Error);
      
      logger.error('Cache warmup request failed', { error });
      return reply.code(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to start cache warmup',
        },
      });
    }
  }

  // ============================================================================
  // Health Check Endpoints
  // ============================================================================

  async getHealthCheck(request: FastifyRequest, reply: FastifyReply) {
    const startTime = Date.now();
    
    try {
      // Basic health check - could be expanded to check dependencies
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      };
      
      recordHttpRequest('GET', '/health', 200, Date.now() - startTime);
      
      return reply.code(200).send(health);
    } catch (error) {
      recordHttpRequest('GET', '/health', 500, Date.now() - startTime);
      
      return reply.code(500).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // ============================================================================
  // Metrics Endpoint
  // ============================================================================

  async getMetrics(request: FastifyRequest, reply: FastifyReply) {
    const startTime = Date.now();
    
    try {
      const { collectMetrics } = await import('@/utils/metrics');
      const metrics = await collectMetrics();
      
      recordHttpRequest('GET', '/metrics', 200, Date.now() - startTime);
      
      return reply
        .code(200)
        .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
        .send(metrics);
    } catch (error) {
      recordHttpRequest('GET', '/metrics', 500, Date.now() - startTime);
      
      logger.error('Metrics collection failed', { error });
      return reply.code(500).send('# Metrics collection failed\n');
    }
  }

  // ============================================================================
  // System Information Endpoints
  // ============================================================================

  async getSystemInfo(request: FastifyRequest, reply: FastifyReply) {
    const startTime = Date.now();
    
    try {
      const memUsage = process.memoryUsage();
      
      const systemInfo = {
        service: 'analytics-service',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        memory: {
          rss: Math.round(memUsage.rss / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024),
        },
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
      };
      
      recordHttpRequest('GET', '/api/v1/system/info', 200, Date.now() - startTime);
      
      return reply.code(200).send({
        success: true,
        data: systemInfo,
      });
    } catch (error) {
      recordHttpRequest('GET', '/api/v1/system/info', 500, Date.now() - startTime);
      
      logger.error('System info request failed', { error });
      return reply.code(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get system information',
        },
      });
    }
  }
}

export const analyticsController = new AnalyticsController();
