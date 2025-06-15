import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticationError, AuthorizationError } from './error-handler';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      username: string;
      roles?: string[];
      isActive: boolean;
    };
  }
}

export const authMiddleware = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    // Verify JWT token
    await request.jwtVerify();
    
    const payload = request.user as any;
    const userId = payload.sub || payload.userId;
    
    if (!userId) {
      throw new AuthenticationError('Invalid token payload');
    }

    // Attach user to request
    request.user = {
      id: userId,
      email: payload.email,
      username: payload.username,
      roles: payload.roles || [],
      isActive: payload.isActive ?? true,
    };

    if (!request.user.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }
    
    request.logger.debug('User authenticated', {
      userId: request.user.id,
      email: request.user.email,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError('Authentication failed');
  }
};

export const requireRole = (requiredRole: string) => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new AuthenticationError('Authentication required');
    }

    const userRoles = request.user.roles || [];
    if (!userRoles.includes(requiredRole) && !userRoles.includes('admin')) {
      throw new AuthorizationError(`${requiredRole} role required`);
    }
  };
};

export const requireAdmin = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  if (!request.user) {
    throw new AuthenticationError('Authentication required');
  }

  const userRoles = request.user.roles || [];
  if (!userRoles.includes('admin')) {
    throw new AuthorizationError('Admin access required');
  }
};

export const optionalAuth = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return;
    }

    await authMiddleware(request, reply);
  } catch (error) {
    // Ignore authentication errors for optional auth
    request.logger.debug('Optional authentication failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
