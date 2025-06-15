import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticationError, AuthorizationError } from './error-handler';
import { UserModel } from '../models/user';
import { SessionModel } from '../models/session';

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
    };
    session?: {
      id: string;
      userId: string;
      deviceInfo: string;
      ipAddress: string;
      userAgent: string;
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

    // Get user from database
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    if (!user.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }

    // Attach user to request
    request.user = user;
    
    request.logger.debug('User authenticated', {
      userId: user.id,
      email: user.email,
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

export const attachSession = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  if (!request.user) {
    return;
  }

  const sessionId = request.headers['x-session-id'] as string;
  if (!sessionId) {
    return;
  }

  try {
    const session = await SessionModel.findById(sessionId);
    if (session && session.userId === request.user.id) {
      request.session = session;
      
      // Update last accessed time
      await SessionModel.updateLastAccessed(sessionId);
    }
  } catch (error) {
    request.logger.warn('Failed to attach session', {
      sessionId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
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
