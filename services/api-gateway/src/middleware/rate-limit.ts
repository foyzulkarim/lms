import { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';

export const rateLimitMiddleware = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  // Skip rate limiting for health check and documentation
  if (isExcludedRoute(request.url)) {
    return;
  }

  const clientIP = request.ip;
  const key = `rate-limit:${clientIP}`;

  try {
    // Check if the client has exceeded the rate limit
    const current = await request.rateLimit();
    
    if (current.current > config.rateLimit.max) {
      reply.status(429).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
          retryAfter: current.reset,
        },
      });
    }
  } catch (err) {
    request.log.error({
      error: 'Rate limit check failed',
      clientIP,
    });
  }
};

// List of routes excluded from rate limiting
const excludedRoutes = [
  '/health',
  '/docs',
  '/docs/json',
  '/docs/yaml',
];

const isExcludedRoute = (url: string): boolean => {
  return excludedRoutes.some((route) => url.startsWith(route));
};
