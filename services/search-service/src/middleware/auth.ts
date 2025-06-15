import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

// User interface from JWT payload
export interface User {
  id: string;
  email: string;
  role: string;
  permissions?: string[];
}

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

// Authentication middleware
export const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    // Verify JWT token
    await request.jwtVerify();
    
    // User is now available in request.user (set by fastify-jwt)
    if (!request.user) {
      throw new Error('User not found in token');
    }

    logger.debug('User authenticated successfully', {
      userId: (request.user as any).id,
      email: (request.user as any).email,
      role: (request.user as any).role,
    });
  } catch (error) {
    logger.warn('Authentication failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      path: request.url,
      method: request.method,
    });

    reply.code(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }
};

// Optional authentication middleware (doesn't fail if no token)
export const optionalAuthenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authHeader = request.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      await request.jwtVerify();
      
      logger.debug('Optional authentication successful', {
        userId: (request.user as any)?.id,
      });
    }
  } catch (error) {
    // Silently ignore authentication errors for optional auth
    logger.debug('Optional authentication failed, continuing without user', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Role-based authorization middleware
export const authorize = (allowedRoles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      reply.code(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    const userRole = (request.user as any).role;
    
    if (!allowedRoles.includes(userRole)) {
      logger.warn('Authorization failed', {
        userId: (request.user as any).id,
        userRole,
        allowedRoles,
        path: request.url,
        method: request.method,
      });

      reply.code(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
      });
      return;
    }

    logger.debug('Authorization successful', {
      userId: (request.user as any).id,
      userRole,
      path: request.url,
    });
  };
};

// Permission-based authorization middleware
export const requirePermission = (permission: string) => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      reply.code(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    const userPermissions = (request.user as any).permissions || [];
    const userRole = (request.user as any).role;
    
    // Admin role has all permissions
    if (userRole === 'admin' || userPermissions.includes(permission)) {
      logger.debug('Permission check successful', {
        userId: (request.user as any).id,
        permission,
        userRole,
      });
      return;
    }

    logger.warn('Permission check failed', {
      userId: (request.user as any).id,
      permission,
      userPermissions,
      userRole,
      path: request.url,
      method: request.method,
    });

    reply.code(403).send({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: `Permission required: ${permission}`,
      },
    });
  };
};

// Admin role middleware
export const requireAdmin = authorize(['admin']);

// Instructor role middleware
export const requireInstructor = authorize(['instructor', 'admin']);

// Student role middleware (for specific student-only endpoints)
export const requireStudent = authorize(['student', 'instructor', 'admin']);

// Rate limiting by user role
export const getRateLimitByRole = (request: FastifyRequest): number => {
  const user = (request as any).user;
  
  if (!user) {
    return 50; // Anonymous users get lower limit
  }

  switch (user.role) {
    case 'admin':
      return 1000; // Admins get highest limit
    case 'instructor':
      return 500; // Instructors get high limit
    case 'student':
      return 200; // Students get standard limit
    default:
      return 100; // Default limit
  }
};

// Check if user can access content type
export const canAccessContentType = (user: any, contentType: string): boolean => {
  if (!user) {
    // Anonymous users can only search public content
    return ['course'].includes(contentType);
  }

  switch (user.role) {
    case 'admin':
      return true; // Admins can access all content types
    case 'instructor':
      return ['course', 'user', 'assessment', 'file'].includes(contentType);
    case 'student':
      return ['course', 'user'].includes(contentType); // Students can search courses and public users
    default:
      return ['course'].includes(contentType);
  }
};

// Filter search results based on user permissions
export const filterSearchResults = (results: any[], user: any): any[] => {
  if (!user) {
    // Anonymous users only see public content
    return results.filter(result => 
      result.metadata?.visibility === 'public' || 
      result.metadata?.status === 'published'
    );
  }

  if (user.role === 'admin') {
    return results; // Admins see everything
  }

  if (user.role === 'instructor') {
    // Instructors see published content and their own content
    return results.filter(result => 
      result.metadata?.status === 'published' ||
      result.metadata?.instructorId === user.id ||
      result.metadata?.uploadedBy === user.id
    );
  }

  // Students see only published public content
  return results.filter(result => 
    result.metadata?.status === 'published' &&
    (result.metadata?.visibility === 'public' || result.metadata?.visibility === 'unlisted')
  );
};

export default {
  authenticate,
  optionalAuthenticate,
  authorize,
  requirePermission,
  requireAdmin,
  requireInstructor,
  requireStudent,
  getRateLimitByRole,
  canAccessContentType,
  filterSearchResults,
};
