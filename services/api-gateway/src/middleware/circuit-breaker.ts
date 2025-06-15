import { FastifyReply, FastifyRequest } from 'fastify';

export const circuitBreakerMiddleware = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  // Skip circuit breaker for health check and documentation
  if (isExcludedRoute(request.url)) {
    return;
  }

  try {
    // Check if the circuit is open
    const circuit = request.circuitBreaker;
    
    if (circuit && circuit.isOpen()) {
      reply.status(503).send({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service temporarily unavailable',
          retryAfter: circuit.getResetTimeout(),
        },
      });
    }
  } catch (err) {
    request.log.error({
      error: 'Circuit breaker check failed',
      url: request.url,
    });
  }
};

// List of routes excluded from circuit breaker
const excludedRoutes = [
  '/health',
  '/docs',
  '/docs/json',
  '/docs/yaml',
];

const isExcludedRoute = (url: string): boolean => {
  return excludedRoutes.some((route) => url.startsWith(route));
};
