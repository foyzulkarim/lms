import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { config } from '../config';

// Request logging middleware
export const requestLogger = async (fastify: FastifyInstance): Promise<void> => {
  // Add request ID to all requests
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add request ID to request context
    (request as any).requestId = requestId;
    
    // Add request ID to response headers
    reply.header('X-Request-ID', requestId);
  });

  // Log incoming requests
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    (request as any).startTime = startTime;

    // Skip logging for health check endpoints in production
    if (config.isProduction && request.url.startsWith('/health')) {
      return;
    }

    // Extract search query for search endpoints
    const searchQuery = request.url.includes('/search') ? 
      (request.query as any)?.q || (request.body as any)?.query : undefined;

    logger.info('Incoming request', {
      requestId: (request as any).requestId,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      userId: (request as any).user?.id,
      contentType: request.headers['content-type'],
      contentLength: request.headers['content-length'],
      referer: request.headers.referer,
      params: request.params,
      query: request.query,
      searchQuery, // Log search queries for analytics
    });
  });

  // Log outgoing responses
  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: any) => {
    const endTime = Date.now();
    const startTime = (request as any).startTime || endTime;
    const duration = endTime - startTime;

    // Skip logging for health check endpoints in production
    if (config.isProduction && request.url.startsWith('/health')) {
      return payload;
    }

    // Determine log level based on status code
    const statusCode = reply.statusCode;
    let logLevel: 'info' | 'warn' | 'error' = 'info';
    
    if (statusCode >= 400 && statusCode < 500) {
      logLevel = 'warn';
    } else if (statusCode >= 500) {
      logLevel = 'error';
    }

    // Extract search results count for search endpoints
    let resultsCount: number | undefined;
    if (request.url.includes('/search') && payload) {
      try {
        const parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;
        resultsCount = parsedPayload?.data?.total;
      } catch (error) {
        // Ignore parsing errors
      }
    }

    // Log response
    logger[logLevel]('Outgoing response', {
      requestId: (request as any).requestId,
      method: request.method,
      url: request.url,
      statusCode,
      duration: `${duration}ms`,
      contentLength: reply.getHeader('content-length'),
      userId: (request as any).user?.id,
      ip: request.ip,
      resultsCount, // Log search results count
    });

    // Log slow requests
    if (duration > 2000) { // 2 seconds threshold for search service
      logger.warn('Slow request detected', {
        requestId: (request as any).requestId,
        method: request.method,
        url: request.url,
        duration: `${duration}ms`,
        userId: (request as any).user?.id,
        threshold: '2000ms',
      });
    }

    // Log search-specific metrics
    if (request.url.includes('/search') && resultsCount !== undefined) {
      logger.info('Search metrics', {
        requestId: (request as any).requestId,
        query: (request.query as any)?.q,
        resultsCount,
        duration: `${duration}ms`,
        userId: (request as any).user?.id,
        cached: reply.getHeader('X-Cache-Status') === 'HIT',
      });
    }

    return payload;
  });

  // Log request errors
  fastify.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    const endTime = Date.now();
    const startTime = (request as any).startTime || endTime;
    const duration = endTime - startTime;

    logger.error('Request error', {
      requestId: (request as any).requestId,
      method: request.method,
      url: request.url,
      duration: `${duration}ms`,
      error: {
        name: error.name,
        message: error.message,
        stack: config.isDevelopment ? error.stack : undefined,
      },
      userId: (request as any).user?.id,
      ip: request.ip,
      query: request.query,
    });
  });

  // Log request completion
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const endTime = Date.now();
    const startTime = (request as any).startTime || endTime;
    const duration = endTime - startTime;

    // Skip logging for health check endpoints in production
    if (config.isProduction && request.url.startsWith('/health')) {
      return;
    }

    logger.debug('Request completed', {
      requestId: (request as any).requestId,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration: `${duration}ms`,
      userId: (request as any).user?.id,
    });
  });
};

// Performance monitoring middleware
export const performanceMonitor = async (fastify: FastifyInstance): Promise<void> => {
  const performanceMetrics = {
    totalRequests: 0,
    totalErrors: 0,
    totalDuration: 0,
    slowRequests: 0,
    searchRequests: 0,
    searchDuration: 0,
    cacheHits: 0,
    cacheMisses: 0,
    requestsByMethod: {} as Record<string, number>,
    requestsByStatus: {} as Record<string, number>,
    requestsByEndpoint: {} as Record<string, number>,
    searchesByQuery: {} as Record<string, number>,
  };

  // Track request metrics
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const endTime = Date.now();
    const startTime = (request as any).startTime || endTime;
    const duration = endTime - startTime;

    // Update metrics
    performanceMetrics.totalRequests++;
    performanceMetrics.totalDuration += duration;

    // Track by method
    const method = request.method;
    performanceMetrics.requestsByMethod[method] = (performanceMetrics.requestsByMethod[method] || 0) + 1;

    // Track by status code
    const statusCode = reply.statusCode.toString();
    performanceMetrics.requestsByStatus[statusCode] = (performanceMetrics.requestsByStatus[statusCode] || 0) + 1;

    // Track by endpoint (simplified)
    const endpoint = `${method} ${request.routerPath || request.url}`;
    performanceMetrics.requestsByEndpoint[endpoint] = (performanceMetrics.requestsByEndpoint[endpoint] || 0) + 1;

    // Track errors
    if (reply.statusCode >= 400) {
      performanceMetrics.totalErrors++;
    }

    // Track slow requests
    if (duration > 2000) {
      performanceMetrics.slowRequests++;
    }

    // Track search-specific metrics
    if (request.url.includes('/search')) {
      performanceMetrics.searchRequests++;
      performanceMetrics.searchDuration += duration;

      // Track search queries
      const query = (request.query as any)?.q;
      if (query) {
        const normalizedQuery = query.toLowerCase().trim();
        performanceMetrics.searchesByQuery[normalizedQuery] = 
          (performanceMetrics.searchesByQuery[normalizedQuery] || 0) + 1;
      }

      // Track cache hits/misses
      const cacheStatus = reply.getHeader('X-Cache-Status');
      if (cacheStatus === 'HIT') {
        performanceMetrics.cacheHits++;
      } else if (cacheStatus === 'MISS') {
        performanceMetrics.cacheMisses++;
      }
    }
  });

  // Expose metrics endpoint
  fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    const averageResponseTime = performanceMetrics.totalRequests > 0 
      ? performanceMetrics.totalDuration / performanceMetrics.totalRequests 
      : 0;

    const averageSearchTime = performanceMetrics.searchRequests > 0
      ? performanceMetrics.searchDuration / performanceMetrics.searchRequests
      : 0;

    const errorRate = performanceMetrics.totalRequests > 0 
      ? (performanceMetrics.totalErrors / performanceMetrics.totalRequests) * 100 
      : 0;

    const slowRequestRate = performanceMetrics.totalRequests > 0 
      ? (performanceMetrics.slowRequests / performanceMetrics.totalRequests) * 100 
      : 0;

    const cacheHitRate = (performanceMetrics.cacheHits + performanceMetrics.cacheMisses) > 0
      ? (performanceMetrics.cacheHits / (performanceMetrics.cacheHits + performanceMetrics.cacheMisses)) * 100
      : 0;

    return {
      success: true,
      data: {
        summary: {
          totalRequests: performanceMetrics.totalRequests,
          totalErrors: performanceMetrics.totalErrors,
          errorRate: `${errorRate.toFixed(2)}%`,
          averageResponseTime: `${averageResponseTime.toFixed(2)}ms`,
          slowRequests: performanceMetrics.slowRequests,
          slowRequestRate: `${slowRequestRate.toFixed(2)}%`,
        },
        search: {
          totalSearches: performanceMetrics.searchRequests,
          averageSearchTime: `${averageSearchTime.toFixed(2)}ms`,
          cacheHitRate: `${cacheHitRate.toFixed(2)}%`,
          cacheHits: performanceMetrics.cacheHits,
          cacheMisses: performanceMetrics.cacheMisses,
          topQueries: Object.entries(performanceMetrics.searchesByQuery)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {}),
        },
        breakdown: {
          byMethod: performanceMetrics.requestsByMethod,
          byStatus: performanceMetrics.requestsByStatus,
          byEndpoint: Object.entries(performanceMetrics.requestsByEndpoint)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {}),
        },
        timestamp: new Date().toISOString(),
      },
    };
  });

  // Log performance summary periodically
  if (!config.isTest) {
    setInterval(() => {
      if (performanceMetrics.totalRequests > 0) {
        const averageResponseTime = performanceMetrics.totalDuration / performanceMetrics.totalRequests;
        const errorRate = (performanceMetrics.totalErrors / performanceMetrics.totalRequests) * 100;
        const averageSearchTime = performanceMetrics.searchRequests > 0
          ? performanceMetrics.searchDuration / performanceMetrics.searchRequests
          : 0;

        logger.info('Performance summary', {
          totalRequests: performanceMetrics.totalRequests,
          totalErrors: performanceMetrics.totalErrors,
          errorRate: `${errorRate.toFixed(2)}%`,
          averageResponseTime: `${averageResponseTime.toFixed(2)}ms`,
          slowRequests: performanceMetrics.slowRequests,
          searchRequests: performanceMetrics.searchRequests,
          averageSearchTime: `${averageSearchTime.toFixed(2)}ms`,
        });
      }
    }, 60000); // Log every minute
  }
};

// Search-specific logging middleware
export const searchLogger = async (fastify: FastifyInstance): Promise<void> => {
  // Log search queries for analytics
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url.includes('/search') && config.features.analytics) {
      const query = (request.query as any)?.q;
      const user = (request as any).user;
      
      if (query) {
        logger.info('Search query', {
          requestId: (request as any).requestId,
          query,
          userId: user?.id,
          userRole: user?.role,
          filters: request.query,
          timestamp: new Date().toISOString(),
        });
      }
    }
  });

  // Log search results for analytics
  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: any) => {
    if (request.url.includes('/search') && config.features.analytics) {
      try {
        const parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;
        const resultsCount = parsedPayload?.data?.total;
        const took = parsedPayload?.data?.took;
        
        if (resultsCount !== undefined) {
          logger.info('Search results', {
            requestId: (request as any).requestId,
            query: (request.query as any)?.q,
            resultsCount,
            took: `${took}ms`,
            userId: (request as any).user?.id,
            cached: reply.getHeader('X-Cache-Status') === 'HIT',
          });
        }
      } catch (error) {
        // Ignore parsing errors
      }
    }

    return payload;
  });
};

export default {
  requestLogger,
  performanceMonitor,
  searchLogger,
};
