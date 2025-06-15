import { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { createRequestLogger } from '../utils/logger';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
    logger: ReturnType<typeof createRequestLogger>;
  }
}

export const requestLogger: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Generate correlation ID
    const correlationId = request.headers['x-correlation-id'] as string || uuidv4();
    request.correlationId = correlationId;
    
    // Create request-specific logger
    request.logger = createRequestLogger(correlationId);
    
    // Add correlation ID to response headers
    reply.header('x-correlation-id', correlationId);
    
    // Log request
    request.logger.info('Incoming request', {
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      correlationId,
    });
  });

  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const responseTime = reply.getResponseTime();
    
    request.logger.info('Request completed', {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: `${responseTime}ms`,
      correlationId: request.correlationId,
    });
  });

  fastify.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    request.logger.error('Request error', {
      method: request.method,
      url: request.url,
      error: error.message,
      stack: error.stack,
      correlationId: request.correlationId,
    });
  });
};
