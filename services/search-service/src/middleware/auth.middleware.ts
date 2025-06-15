import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '@/config/environment';
import { searchLogger } from '@/utils/logger';
import { UserContext } from '@/types';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: UserContext;
}

/**
 * JWT Authentication middleware
 */
export async function authenticateToken(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader) {
      searchLogger.securityEvent('missing_auth_header', undefined, {
        path: request.url,
        method: request.method,
        ip: request.ip,
      });
      
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authorization header is required',
      });
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    if (!token) {
      searchLogger.securityEvent('missing_token', undefined, {
        path: request.url,
        method: request.method,
        ip: request.ip,
      });
      
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Token is required',
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, config.JWT_SECRET) as any;
    
    // Create user context
    const user: UserContext = {
      id: decoded.sub || decoded.userId || decoded.id,
      email: decoded.email,
      role: decoded.role || 'student',
      organizationId: decoded.organizationId,
      permissions: decoded.permissions || [],
    };

    // Validate required fields
    if (!user.id || !user.email) {
      searchLogger.securityEvent('invalid_token_payload', user.id, {
        path: request.url,
        method: request.method,
        decodedFields: Object.keys(decoded),
      });
      
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid token payload',
      });
    }

    // Attach user to request
    request.user = user;
    
    searchLogger.debug('User authenticated successfully', {
      userId: user.id,
      role: user.role,
      path: request.url,
      method: request.method,
    });

  } catch (error) {
    let errorMessage = 'Invalid token';
    let statusCode = 401;

    if (error instanceof jwt.TokenExpiredError) {
      errorMessage = 'Token has expired';
      statusCode = 401;
    } else if (error instanceof jwt.JsonWebTokenError) {
      errorMessage = 'Invalid token format';
      statusCode = 401;
    } else if (error instanceof jwt.NotBeforeError) {
      errorMessage = 'Token not active yet';
      statusCode = 401;
    }

    searchLogger.securityEvent('token_verification_failed', undefined, {
      path: request.url,
      method: request.method,
      ip: request.ip,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return reply.status(statusCode).send({
      error: 'Unauthorized',
      message: errorMessage,
    });
  }
}

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export async function optionalAuth(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  
  if (!authHeader) {
    return; // Continue without authentication
  }

  try {
    await authenticateToken(request, reply);
  } catch (error) {
    // Log but don't fail the request
    searchLogger.warn('Optional authentication failed', {
      path: request.url,
      method: request.method,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Role-based authorization middleware
 */
export function requireRole(...allowedRoles: string[]) {
  return async (request: AuthenticatedRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(request.user.role)) {
      searchLogger.securityEvent('insufficient_permissions', request.user.id, {
        path: request.url,
        method: request.method,
        userRole: request.user.role,
        requiredRoles: allowedRoles,
      });

      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
    }
  };
}

/**
 * Permission-based authorization middleware
 */
export function requirePermission(...requiredPermissions: string[]) {
  return async (request: AuthenticatedRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const userPermissions = request.user.permissions || [];
    const hasPermission = requiredPermissions.some(permission => 
      userPermissions.includes(permission) || 
      userPermissions.includes('*') || // Wildcard permission
      request.user?.role === 'admin' // Admins have all permissions
    );

    if (!hasPermission) {
      searchLogger.securityEvent('insufficient_permissions', request.user.id, {
        path: request.url,
        method: request.method,
        userPermissions,
        requiredPermissions,
      });

      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
    }
  };
}

/**
 * Rate limiting by user
 */
export function createUserRateLimit(maxRequests: number, windowMs: number) {
  const userRequests = new Map<string, { count: number; resetTime: number }>();

  return async (request: AuthenticatedRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return; // Skip rate limiting for unauthenticated requests
    }

    const userId = request.user.id;
    const now = Date.now();
    const userLimit = userRequests.get(userId);

    if (!userLimit || now > userLimit.resetTime) {
      // Reset or initialize user limit
      userRequests.set(userId, {
        count: 1,
        resetTime: now + windowMs,
      });
      return;
    }

    if (userLimit.count >= maxRequests) {
      searchLogger.securityEvent('rate_limit_exceeded', userId, {
        path: request.url,
        method: request.method,
        count: userLimit.count,
        maxRequests,
        windowMs,
      });

      return reply.status(429).send({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        retryAfter: Math.ceil((userLimit.resetTime - now) / 1000),
      });
    }

    userLimit.count++;
  };
}

/**
 * Request logging middleware
 */
export async function requestLogger(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  const startTime = Date.now();
  
  searchLogger.apiRequest(
    request.method,
    request.url,
    request.user?.id,
    request.id
  );

  reply.addHook('onSend', async () => {
    const duration = Date.now() - startTime;
    searchLogger.apiResponse(
      request.method,
      request.url,
      reply.statusCode,
      duration,
      request.user?.id,
      request.id
    );
  });
}

/**
 * Error handling middleware
 */
export async function errorHandler(
  error: Error,
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  searchLogger.apiError(
    request.method,
    request.url,
    error,
    request.user?.id,
    request.id
  );

  // Don't expose internal errors in production
  if (config.NODE_ENV === 'production') {
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  }

  return reply.status(500).send({
    error: 'Internal Server Error',
    message: error.message,
    stack: error.stack,
  });
}
