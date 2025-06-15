import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { 
  AuthContext, 
  JWTPayload, 
  AuthenticationError, 
  AuthorizationError 
} from '@/types';
import { getSecurityConfig } from '@/config/env';
import { FileServiceLogger } from '@/utils/logger';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export interface AuthMiddlewareOptions {
  required?: boolean;
  roles?: string[];
  permissions?: string[];
}

export function createAuthMiddleware(options: AuthMiddlewareOptions = {}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const config = getSecurityConfig();
    const authHeader = request.headers.authorization;

    // If auth is not required and no token provided, continue
    if (!options.required && !authHeader) {
      return;
    }

    // Extract token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (options.required) {
        FileServiceLogger.logSecurityEvent('missing_auth_header', 'anonymous', {
          url: request.url,
          method: request.method
        });
        throw new AuthenticationError('Authorization header required');
      }
      return;
    }

    const token = authHeader.substring(7);

    try {
      // Verify JWT token
      const payload = jwt.verify(token, config.jwtSecret) as JWTPayload;
      
      // Create auth context
      const authContext: AuthContext = {
        userId: payload.sub,
        roles: payload.roles || [],
        permissions: payload.permissions || [],
        organizationId: payload.organizationId
      };

      // Check required roles
      if (options.roles && options.roles.length > 0) {
        const hasRequiredRole = options.roles.some(role => authContext.roles.includes(role));
        if (!hasRequiredRole) {
          FileServiceLogger.logSecurityEvent('insufficient_role', authContext.userId, {
            requiredRoles: options.roles,
            userRoles: authContext.roles,
            url: request.url
          });
          throw new AuthorizationError(`Required roles: ${options.roles.join(', ')}`);
        }
      }

      // Check required permissions
      if (options.permissions && options.permissions.length > 0) {
        const hasRequiredPermission = options.permissions.some(permission => 
          authContext.permissions.includes(permission)
        );
        if (!hasRequiredPermission) {
          FileServiceLogger.logSecurityEvent('insufficient_permission', authContext.userId, {
            requiredPermissions: options.permissions,
            userPermissions: authContext.permissions,
            url: request.url
          });
          throw new AuthorizationError(`Required permissions: ${options.permissions.join(', ')}`);
        }
      }

      // Attach auth context to request
      request.auth = authContext;

    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        FileServiceLogger.logSecurityEvent('invalid_token', 'anonymous', {
          error: error.message,
          url: request.url
        });
        throw new AuthenticationError('Invalid token');
      }
      
      if (error instanceof jwt.TokenExpiredError) {
        FileServiceLogger.logSecurityEvent('expired_token', 'anonymous', {
          url: request.url
        });
        throw new AuthenticationError('Token expired');
      }

      throw error;
    }
  };
}

// Convenience middleware functions
export const requireAuth = createAuthMiddleware({ required: true });

export const optionalAuth = createAuthMiddleware({ required: false });

export const requireAdmin = createAuthMiddleware({ 
  required: true, 
  roles: ['admin'] 
});

export const requireInstructor = createAuthMiddleware({ 
  required: true, 
  roles: ['admin', 'instructor'] 
});

export const requireFilePermissions = (permissions: string[]) => 
  createAuthMiddleware({ 
    required: true, 
    permissions 
  });

// Helper function to get auth context from request
export function getAuthContext(request: FastifyRequest): AuthContext {
  if (!request.auth) {
    throw new AuthenticationError('Authentication required');
  }
  return request.auth;
}

// Helper function to check if user has role
export function hasRole(request: FastifyRequest, role: string): boolean {
  return request.auth?.roles.includes(role) || false;
}

// Helper function to check if user has permission
export function hasPermission(request: FastifyRequest, permission: string): boolean {
  return request.auth?.permissions.includes(permission) || false;
}

// Helper function to check if user is admin
export function isAdmin(request: FastifyRequest): boolean {
  return hasRole(request, 'admin');
}

// Helper function to check if user is instructor
export function isInstructor(request: FastifyRequest): boolean {
  return hasRole(request, 'instructor') || hasRole(request, 'admin');
}

// Helper function to get user ID
export function getUserId(request: FastifyRequest): string {
  const auth = getAuthContext(request);
  return auth.userId;
}

// Helper function to get organization ID
export function getOrganizationId(request: FastifyRequest): string | undefined {
  return request.auth?.organizationId;
}

// Rate limiting by user
export function createUserRateLimit(maxRequests: number, windowMs: number) {
  const userRequests = new Map<string, { count: number; resetTime: number }>();

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.auth?.userId || request.ip;
    const now = Date.now();
    
    const userLimit = userRequests.get(userId);
    
    if (!userLimit || now > userLimit.resetTime) {
      // Reset or initialize user limit
      userRequests.set(userId, {
        count: 1,
        resetTime: now + windowMs
      });
      return;
    }
    
    if (userLimit.count >= maxRequests) {
      FileServiceLogger.logSecurityEvent('rate_limit_exceeded', userId, {
        maxRequests,
        windowMs,
        url: request.url
      });
      
      reply.status(429).send({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Max ${maxRequests} requests per ${windowMs / 1000} seconds.`,
        retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
      });
      return;
    }
    
    userLimit.count++;
  };
}

// File access validation
export async function validateFileAccess(
  request: FastifyRequest,
  fileId: string,
  action: 'read' | 'write' | 'delete' = 'read'
) {
  const auth = getAuthContext(request);
  
  // This would typically check file permissions from database
  // For now, we'll implement basic checks
  
  // Admin can access everything
  if (hasRole(request, 'admin')) {
    return true;
  }
  
  // For other users, we'd need to check file-specific permissions
  // This would be implemented in the FileService
  return true;
}

// CORS helper for file uploads
export function createCORSHandler(allowedOrigins: string[] = ['*']) {
  return {
    origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      FileServiceLogger.logSecurityEvent('cors_violation', 'anonymous', {
        origin,
        allowedOrigins
      });
      
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  };
}
