import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '@/config';
import { log } from '@/utils/logger';
import { JwtPayloadType } from '@/types/api.types';
import { UnauthorizedError, ForbiddenError } from '@/types/api.types';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      authId: string;
      email: string;
      role: 'admin' | 'instructor' | 'student';
    };
  }
}

// JWT authentication middleware
export const authenticateJWT = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader) {
      throw new UnauthorizedError('Authorization header is required');
    }
    
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;
    
    if (!token) {
      throw new UnauthorizedError('Token is required');
    }
    
    try {
      const decoded = jwt.verify(token, jwtConfig.secret) as JwtPayloadType;
      
      // Validate token structure
      if (!decoded.sub || !decoded.authId || !decoded.email || !decoded.role) {
        throw new UnauthorizedError('Invalid token structure');
      }
      
      // Check token expiration
      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        throw new UnauthorizedError('Token has expired');
      }
      
      // Attach user to request
      request.user = {
        id: decoded.sub,
        authId: decoded.authId,
        email: decoded.email,
        role: decoded.role,
      };
      
      log.debug('User authenticated successfully', {
        userId: decoded.sub,
        email: decoded.email,
        role: decoded.role,
      });
      
    } catch (jwtError) {
      if (jwtError instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token has expired');
      } else if (jwtError instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid token');
      } else {
        throw jwtError;
      }
    }
  } catch (error) {
    log.error('Authentication failed', error, {
      url: request.url,
      method: request.method,
      ip: request.ip,
    });
    
    if (error instanceof UnauthorizedError) {
      reply.code(401).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    } else {
      reply.code(500).send({
        success: false,
        error: 'Internal server error during authentication',
        timestamp: new Date().toISOString(),
      });
    }
  }
};

// Optional JWT authentication (doesn't fail if no token)
export const optionalAuth = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader) {
      return; // No token provided, continue without authentication
    }
    
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;
    
    if (!token) {
      return; // No token provided, continue without authentication
    }
    
    try {
      const decoded = jwt.verify(token, jwtConfig.secret) as JwtPayloadType;
      
      // Validate token structure
      if (decoded.sub && decoded.authId && decoded.email && decoded.role) {
        // Check token expiration
        if (!decoded.exp || Date.now() < decoded.exp * 1000) {
          // Attach user to request
          request.user = {
            id: decoded.sub,
            authId: decoded.authId,
            email: decoded.email,
            role: decoded.role,
          };
          
          log.debug('Optional authentication successful', {
            userId: decoded.sub,
            email: decoded.email,
            role: decoded.role,
          });
        }
      }
    } catch (jwtError) {
      // Ignore JWT errors for optional authentication
      log.debug('Optional authentication failed, continuing without auth', { error: jwtError.message });
    }
  } catch (error) {
    // Ignore errors for optional authentication
    log.debug('Optional authentication error, continuing without auth', { error: error.message });
  }
};

// Role-based authorization middleware factory
export const requireRole = (...allowedRoles: Array<'admin' | 'instructor' | 'student'>) => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      if (!request.user) {
        throw new UnauthorizedError('Authentication required');
      }
      
      if (!allowedRoles.includes(request.user.role)) {
        throw new ForbiddenError(`Access denied. Required roles: ${allowedRoles.join(', ')}`);
      }
      
      log.debug('Role authorization successful', {
        userId: request.user.id,
        userRole: request.user.role,
        allowedRoles,
      });
    } catch (error) {
      log.error('Role authorization failed', error, {
        userId: request.user?.id,
        userRole: request.user?.role,
        allowedRoles,
        url: request.url,
        method: request.method,
      });
      
      if (error instanceof UnauthorizedError) {
        reply.code(401).send({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else if (error instanceof ForbiddenError) {
        reply.code(403).send({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else {
        reply.code(500).send({
          success: false,
          error: 'Internal server error during authorization',
          timestamp: new Date().toISOString(),
        });
      }
    }
  };
};

// Resource ownership middleware (user can only access their own resources)
export const requireOwnership = (userIdParam: string = 'id') => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      if (!request.user) {
        throw new UnauthorizedError('Authentication required');
      }
      
      const params = request.params as Record<string, string>;
      const resourceUserId = params[userIdParam];
      
      // Allow if user is admin
      if (request.user.role === 'admin') {
        log.debug('Admin access granted for resource ownership', {
          userId: request.user.id,
          resourceUserId,
        });
        return;
      }
      
      // Allow if accessing own resource
      if (request.user.id === resourceUserId) {
        log.debug('Resource ownership verified', {
          userId: request.user.id,
          resourceUserId,
        });
        return;
      }
      
      // Special case for 'me' parameter
      if (resourceUserId === 'me') {
        // Replace 'me' with actual user ID in params
        params[userIdParam] = request.user.id;
        log.debug('Me parameter replaced with user ID', {
          userId: request.user.id,
        });
        return;
      }
      
      throw new ForbiddenError('Access denied. You can only access your own resources');
    } catch (error) {
      log.error('Resource ownership check failed', error, {
        userId: request.user?.id,
        userRole: request.user?.role,
        resourceUserId: (request.params as Record<string, string>)[userIdParam],
        url: request.url,
        method: request.method,
      });
      
      if (error instanceof UnauthorizedError) {
        reply.code(401).send({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else if (error instanceof ForbiddenError) {
        reply.code(403).send({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else {
        reply.code(500).send({
          success: false,
          error: 'Internal server error during ownership check',
          timestamp: new Date().toISOString(),
        });
      }
    }
  };
};

// Admin only middleware
export const requireAdmin = requireRole('admin');

// Instructor or admin middleware
export const requireInstructorOrAdmin = requireRole('instructor', 'admin');

// Any authenticated user middleware
export const requireAuth = authenticateJWT;

// Middleware to extract user ID from token or params
export const extractUserId = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const params = request.params as Record<string, string>;
  
  // If 'me' is used, replace with authenticated user's ID
  if (params.id === 'me' || params.userId === 'me') {
    if (!request.user) {
      reply.code(401).send({
        success: false,
        error: 'Authentication required to use "me" parameter',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    if (params.id === 'me') {
      params.id = request.user.id;
    }
    if (params.userId === 'me') {
      params.userId = request.user.id;
    }
  }
};

// Middleware to validate UUID parameters
export const validateUUID = (paramName: string) => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const params = request.params as Record<string, string>;
    const value = params[paramName];
    
    if (!value) {
      reply.code(400).send({
        success: false,
        error: `Missing required parameter: ${paramName}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    // Skip validation for 'me' parameter
    if (value === 'me') {
      return;
    }
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!uuidRegex.test(value)) {
      reply.code(400).send({
        success: false,
        error: `Invalid UUID format for parameter: ${paramName}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }
  };
};

// Rate limiting check middleware
export const checkRateLimit = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  // Rate limiting is handled by @fastify/rate-limit plugin
  // This middleware can be used for custom rate limiting logic if needed
  
  const rateLimitInfo = request.rateLimit;
  
  if (rateLimitInfo) {
    // Add rate limit headers
    reply.header('X-RateLimit-Limit', rateLimitInfo.max);
    reply.header('X-RateLimit-Remaining', rateLimitInfo.remaining);
    reply.header('X-RateLimit-Reset', new Date(rateLimitInfo.ttl + Date.now()));
    
    log.debug('Rate limit info', {
      ip: request.ip,
      remaining: rateLimitInfo.remaining,
      max: rateLimitInfo.max,
      ttl: rateLimitInfo.ttl,
    });
  }
};

// Request logging middleware
export const logRequest = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const startTime = Date.now();
  
  // Log request
  log.info('Incoming request', {
    method: request.method,
    url: request.url,
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    userId: request.user?.id,
    userRole: request.user?.role,
  });
  
  // Log response when request completes
  reply.addHook('onSend', async (request, reply, payload) => {
    const duration = Date.now() - startTime;
    
    log.request(
      request.method,
      request.url,
      reply.statusCode,
      duration,
      {
        ip: request.ip,
        userId: request.user?.id,
        userRole: request.user?.role,
      }
    );
    
    return payload;
  });
};
