import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticationError, AuthorizationError } from './error-handler';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      username: string;
      firstName: string;
      lastName: string;
      isActive: boolean;
      isEmailVerified: boolean;
      roles?: string[];
    };
  }
}

export const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    // Verify JWT token
    await request.jwtVerify();
    
    const payload = request.user as any;
    const userId = payload.sub || payload.userId;
    
    if (!userId) {
      throw new AuthenticationError('Invalid token payload');
    }

    // In a real implementation, you might want to fetch user details from the auth service
    // For now, we'll use the token payload
    request.user = {
      id: userId,
      email: payload.email,
      username: payload.username,
      firstName: payload.firstName,
      lastName: payload.lastName,
      isActive: payload.isActive ?? true,
      isEmailVerified: payload.isEmailVerified ?? true,
      roles: payload.roles || [],
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

export const requireEmailVerification = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  if (!request.user) {
    throw new AuthenticationError('Authentication required');
  }

  if (!request.user.isEmailVerified) {
    throw new AuthorizationError('Email verification required');
  }
};

export const requireInstructor = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  if (!request.user) {
    throw new AuthenticationError('Authentication required');
  }

  const roles = request.user.roles || [];
  if (!roles.includes('instructor') && !roles.includes('admin')) {
    throw new AuthorizationError('Instructor access required');
  }
};

export const requireAdmin = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  if (!request.user) {
    throw new AuthenticationError('Authentication required');
  }

  const roles = request.user.roles || [];
  if (!roles.includes('admin')) {
    throw new AuthorizationError('Admin access required');
  }
};

export const optionalAuth = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return;
    }

    await authenticate(request, reply);
  } catch (error) {
    // Ignore authentication errors for optional auth
    request.logger.debug('Optional authentication failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const requireCourseOwnership = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  if (!request.user) {
    throw new AuthenticationError('Authentication required');
  }

  // This will be implemented in the route handlers where we have access to course data
  // The route handler should check if the authenticated user is the course instructor
};
