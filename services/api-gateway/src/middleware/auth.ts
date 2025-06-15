import { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';

export const authMiddleware = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  // Skip authentication for public routes
  if (isPublicRoute(request.url)) {
    return;
  }

  try {
    // Verify JWT token
    await request.jwtVerify();

    // Add user info to request
    request.user = request.user || {};
  } catch (err) {
    reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing authentication token',
      },
    });
  }
};

// List of public routes that don't require authentication
const publicRoutes = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/health',
  '/docs',
  '/docs/json',
  '/docs/yaml',
];

const isPublicRoute = (url: string): boolean => {
  return publicRoutes.some((route) => url.startsWith(route));
};
