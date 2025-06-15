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
    });

    // Log slow requests
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        requestId: (request as any).requestId,
        method: request.method,
        url: request.url,
        duration: `${duration}ms`,
        userId: (request as any).user?.id,
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
    requestsByMethod: {} as Record<string, number>,
    requestsByStatus: {} as Record<string, number>,
    requestsByEndpoint: {} as Record<string, number>,
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
    if (duration > 1000) {
      performanceMetrics.slowRequests++;
    }
  });

  // Expose metrics endpoint
  fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    const averageResponseTime = performanceMetrics.totalRequests > 0 
      ? performanceMetrics.totalDuration / performanceMetrics.totalRequests 
      : 0;

    const errorRate = performanceMetrics.totalRequests > 0 
      ? (performanceMetrics.totalErrors / performanceMetrics.totalRequests) * 100 
      : 0;

    const slowRequestRate = performanceMetrics.totalRequests > 0 
      ? (performanceMetrics.slowRequests / performanceMetrics.totalRequests) * 100 
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
    });
  });

  // Log performance summary periodically
  if (!config.isTest) {
    setInterval(() => {
      if (performanceMetrics.totalRequests > 0) {
        const averageResponseTime = performanceMetrics.totalDuration / performanceMetrics.totalRequests;
        const errorRate = (performanceMetrics.totalErrors / performanceMetrics.totalRequests) * 100;

        logger.info('Performance summary', {
          totalRequests: performanceMetrics.totalRequests,
          totalErrors: performanceMetrics.totalErrors,
          errorRate: `${errorRate.toFixed(2)}%`,
          averageResponseTime: `${averageResponseTime.toFixed(2)}ms`,
          slowRequests: performanceMetrics.slowRequests,
        });
      }
    }, 60000); // Log every minute
  }
};

// Security logging middleware
export const securityLogger = async (fastify: FastifyInstance): Promise<void> => {
  // Log authentication attempts
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      logger.debug('Authentication attempt', {
        requestId: (request as any).requestId,
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
    }
  });

  // Log suspicious activity
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const suspiciousPatterns = [
      /\.\./,  // Path traversal
      /<script/i,  // XSS attempts
      /union.*select/i,  // SQL injection
      /javascript:/i,  // JavaScript injection
    ];

    const url = request.url;
    const userAgent = request.headers['user-agent'] || '';
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(url) || pattern.test(userAgent)) {
        logger.warn('Suspicious request detected', {
          requestId: (request as any).requestId,
          method: request.method,
          url,
          ip: request.ip,
          userAgent,
          pattern: pattern.toString(),
        });
        break;
      }
    }
  });

  // Log failed authentication attempts
  fastify.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    if (error.message?.includes('jwt') || error.message?.includes('token') || error.message?.includes('auth')) {
      logger.warn('Authentication failure', {
        requestId: (request as any).requestId,
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        error: error.message,
      });
    }
  });
};

export default {
  requestLogger,
  performanceMonitor,
  securityLogger,
};
