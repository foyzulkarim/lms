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

// Course ownership middleware
export const requireCourseOwnership = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
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

  const userId = (request.user as any).id;
  const userRole = (request.user as any).role;
  const courseId = (request.params as any).id || (request.params as any).courseId;

  // Admin can access any course
  if (userRole === 'admin') {
    return;
  }

  if (!courseId) {
    reply.code(400).send({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Course ID is required',
      },
    });
    return;
  }

  try {
    // Import here to avoid circular dependency
    const { getDatabase } = await import('../database/connection');
    const db = getDatabase();

    const course = await db('courses')
      .where('id', courseId)
      .first();

    if (!course) {
      reply.code(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Course not found',
        },
      });
      return;
    }

    if (course.instructor_id !== userId) {
      logger.warn('Course ownership check failed', {
        userId,
        courseId,
        instructorId: course.instructor_id,
        path: request.url,
        method: request.method,
      });

      reply.code(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only access your own courses',
        },
      });
      return;
    }

    logger.debug('Course ownership check successful', {
      userId,
      courseId,
    });
  } catch (error) {
    logger.error('Error checking course ownership:', error);
    
    reply.code(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to verify course ownership',
      },
    });
  }
};

// Enrollment check middleware
export const requireEnrollment = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
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

  const userId = (request.user as any).id;
  const userRole = (request.user as any).role;
  const courseId = (request.params as any).id || (request.params as any).courseId;

  // Admin and instructors can access any course
  if (userRole === 'admin' || userRole === 'instructor') {
    return;
  }

  if (!courseId) {
    reply.code(400).send({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Course ID is required',
      },
    });
    return;
  }

  try {
    // Check if user is enrolled in the course
    // This would typically call the user service to check enrollment
    // For now, we'll implement a basic check
    
    logger.debug('Enrollment check - would verify with user service', {
      userId,
      courseId,
    });

    // TODO: Implement actual enrollment check with user service
    // const isEnrolled = await checkUserEnrollment(userId, courseId);
    
    // For now, assume enrollment is valid
    // In a real implementation, you would:
    // 1. Call user service API to check enrollment
    // 2. Or check a local cache/database
    // 3. Handle enrollment verification
    
  } catch (error) {
    logger.error('Error checking enrollment:', error);
    
    reply.code(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to verify enrollment',
      },
    });
  }
};

// Instructor role middleware
export const requireInstructor = authorize(['instructor', 'admin']);

// Admin role middleware
export const requireAdmin = authorize(['admin']);

// Student role middleware (for specific student-only endpoints)
export const requireStudent = authorize(['student', 'instructor', 'admin']);

// Course access middleware (combines ownership and enrollment checks)
export const requireCourseAccess = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
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

  const userId = (request.user as any).id;
  const userRole = (request.user as any).role;
  const courseId = (request.params as any).id || (request.params as any).courseId;

  // Admin can access any course
  if (userRole === 'admin') {
    return;
  }

  if (!courseId) {
    reply.code(400).send({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Course ID is required',
      },
    });
    return;
  }

  try {
    const { getDatabase } = await import('../database/connection');
    const db = getDatabase();

    const course = await db('courses')
      .where('id', courseId)
      .first();

    if (!course) {
      reply.code(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Course not found',
        },
      });
      return;
    }

    // Check if user is the course instructor
    if (course.instructor_id === userId) {
      return;
    }

    // For students, check enrollment (would call user service)
    if (userRole === 'student') {
      // TODO: Check enrollment with user service
      logger.debug('Would check enrollment for student', {
        userId,
        courseId,
      });
      return;
    }

    // If instructor but not owner of this course, check if they have general instructor permissions
    if (userRole === 'instructor') {
      // Instructors can view other courses but not modify them
      // This depends on your business logic
      return;
    }

    reply.code(403).send({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Access denied to this course',
      },
    });
  } catch (error) {
    logger.error('Error checking course access:', error);
    
    reply.code(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to verify course access',
      },
    });
  }
};

export default {
  authenticate,
  optionalAuthenticate,
  authorize,
  requirePermission,
  requireCourseOwnership,
  requireEnrollment,
  requireInstructor,
  requireAdmin,
  requireStudent,
  requireCourseAccess,
};
