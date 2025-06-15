import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { userService } from '@/services/user.service';
import { 
  authenticateJWT, 
  requireAdmin, 
  requireOwnership, 
  extractUserId,
  validateUUID,
} from '@/middleware/auth.middleware';
import {
  UserSchema,
  CreateUserSchema,
  UpdateUserSchema,
  UserSearchSchema,
  UpdateRoleSchema,
  BulkUpdateRoleSchema,
  ApiResponseSchema,
  ErrorResponseSchema,
  PaginatedResponseSchema,
} from '@/types/user.types';
import { HttpStatusCode, SuccessMessage } from '@/types/api.types';
import { log } from '@/utils/logger';

export async function userRoutes(fastify: FastifyInstance) {
  // Get current user profile
  fastify.get('/me', {
    preHandler: [authenticateJWT],
    schema: {
      tags: ['Users'],
      summary: 'Get current user profile',
      security: [{ bearerAuth: [] }],
      response: {
        200: ApiResponseSchema(UserSchema),
        401: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user!.id;
      const user = await userService.getUserById(userId);
      
      // Update last active
      await userService.updateLastActive(userId);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: user,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to get current user profile', error, { userId: request.user?.id });
      
      if (error.statusCode) {
        reply.code(error.statusCode).send({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else {
        reply.code(HttpStatusCode.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Internal server error',
          timestamp: new Date().toISOString(),
        });
      }
    }
  });
  
  // Update current user profile
  fastify.put('/me', {
    preHandler: [authenticateJWT],
    schema: {
      tags: ['Users'],
      summary: 'Update current user profile',
      security: [{ bearerAuth: [] }],
      body: UpdateUserSchema,
      response: {
        200: ApiResponseSchema(UserSchema),
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    try {
      const userId = request.user!.id;
      const updates = request.body;
      
      const user = await userService.updateUser(userId, updates);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: user,
        message: SuccessMessage.USER_UPDATED,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to update current user profile', error, { 
        userId: request.user?.id,
        updates: request.body,
      });
      
      if (error.statusCode) {
        reply.code(error.statusCode).send({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else {
        reply.code(HttpStatusCode.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Internal server error',
          timestamp: new Date().toISOString(),
        });
      }
    }
  });
  
  // Get user by ID
  fastify.get('/:id', {
    preHandler: [authenticateJWT, validateUUID('id'), extractUserId, requireOwnership('id')],
    schema: {
      tags: ['Users'],
      summary: 'Get user by ID',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        id: Type.String({ description: 'User ID or "me"' }),
      }),
      response: {
        200: ApiResponseSchema(UserSchema),
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const user = await userService.getUserById(id);
      
      // Update last active if viewing own profile
      if (id === request.user!.id) {
        await userService.updateLastActive(id);
      }
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: user,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to get user by ID', error, { userId: request.params.id });
      
      if (error.statusCode) {
        reply.code(error.statusCode).send({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else {
        reply.code(HttpStatusCode.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Internal server error',
          timestamp: new Date().toISOString(),
        });
      }
    }
  });
  
  // Update user by ID
  fastify.put('/:id', {
    preHandler: [authenticateJWT, validateUUID('id'), extractUserId, requireOwnership('id')],
    schema: {
      tags: ['Users'],
      summary: 'Update user by ID',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        id: Type.String({ description: 'User ID or "me"' }),
      }),
      body: UpdateUserSchema,
      response: {
        200: ApiResponseSchema(UserSchema),
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string }; Body: any }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const updates = request.body;
      
      const user = await userService.updateUser(id, updates);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: user,
        message: SuccessMessage.USER_UPDATED,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to update user by ID', error, { 
        userId: request.params.id,
        updates: request.body,
      });
      
      if (error.statusCode) {
        reply.code(error.statusCode).send({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else {
        reply.code(HttpStatusCode.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Internal server error',
          timestamp: new Date().toISOString(),
        });
      }
    }
  });
  
  // Delete user by ID (admin only)
  fastify.delete('/:id', {
    preHandler: [authenticateJWT, validateUUID('id'), requireAdmin],
    schema: {
      tags: ['Users'],
      summary: 'Delete user by ID (Admin only)',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        id: Type.String({ description: 'User ID' }),
      }),
      response: {
        200: ApiResponseSchema(Type.Object({ deleted: Type.Boolean() })),
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      
      // Prevent admin from deleting themselves
      if (id === request.user!.id) {
        reply.code(HttpStatusCode.BAD_REQUEST).send({
          success: false,
          error: 'Cannot delete your own account',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      
      const deleted = await userService.deleteUser(id);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: { deleted },
        message: SuccessMessage.USER_DELETED,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to delete user by ID', error, { userId: request.params.id });
      
      if (error.statusCode) {
        reply.code(error.statusCode).send({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else {
        reply.code(HttpStatusCode.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Internal server error',
          timestamp: new Date().toISOString(),
        });
      }
    }
  });
  
  // Search users (admin only)
  fastify.get('/', {
    preHandler: [authenticateJWT, requireAdmin],
    schema: {
      tags: ['Users'],
      summary: 'Search users (Admin only)',
      security: [{ bearerAuth: [] }],
      querystring: UserSearchSchema,
      response: {
        200: PaginatedResponseSchema(UserSchema),
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) => {
    try {
      const searchParams = request.query;
      const result = await userService.searchUsers(searchParams);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: result.users,
        pagination: result.pagination,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to search users', error, { searchParams: request.query });
      
      if (error.statusCode) {
        reply.code(error.statusCode).send({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else {
        reply.code(HttpStatusCode.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Internal server error',
          timestamp: new Date().toISOString(),
        });
      }
    }
  });
  
  // Get user statistics
  fastify.get('/:id/stats', {
    preHandler: [authenticateJWT, validateUUID('id'), extractUserId, requireOwnership('id')],
    schema: {
      tags: ['Users'],
      summary: 'Get user statistics',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        id: Type.String({ description: 'User ID or "me"' }),
      }),
      response: {
        200: ApiResponseSchema(Type.Any()),
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const stats = await userService.getUserStats(id);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to get user statistics', error, { userId: request.params.id });
      
      if (error.statusCode) {
        reply.code(error.statusCode).send({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else {
        reply.code(HttpStatusCode.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Internal server error',
          timestamp: new Date().toISOString(),
        });
      }
    }
  });
  
  // Update user role (admin only)
  fastify.put('/:id/role', {
    preHandler: [authenticateJWT, validateUUID('id'), requireAdmin],
    schema: {
      tags: ['Users'],
      summary: 'Update user role (Admin only)',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        id: Type.String({ description: 'User ID' }),
      }),
      body: UpdateRoleSchema,
      response: {
        200: ApiResponseSchema(UserSchema),
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string }; Body: any }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { role } = request.body;
      
      // Prevent admin from changing their own role
      if (id === request.user!.id) {
        reply.code(HttpStatusCode.BAD_REQUEST).send({
          success: false,
          error: 'Cannot change your own role',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      
      const user = await userService.updateUserRole(id, role);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: user,
        message: SuccessMessage.ROLE_UPDATED,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to update user role', error, { 
        userId: request.params.id,
        role: request.body.role,
      });
      
      if (error.statusCode) {
        reply.code(error.statusCode).send({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else {
        reply.code(HttpStatusCode.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Internal server error',
          timestamp: new Date().toISOString(),
        });
      }
    }
  });
  
  // Bulk update user roles (admin only)
  fastify.put('/bulk/role', {
    preHandler: [authenticateJWT, requireAdmin],
    schema: {
      tags: ['Users'],
      summary: 'Bulk update user roles (Admin only)',
      security: [{ bearerAuth: [] }],
      body: BulkUpdateRoleSchema,
      response: {
        200: ApiResponseSchema(Type.Object({
          successful: Type.Number(),
          failed: Type.Number(),
          errors: Type.Optional(Type.Array(Type.Object({
            id: Type.String(),
            error: Type.String(),
          }))),
        })),
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    try {
      const bulkUpdate = request.body;
      
      // Prevent admin from changing their own role
      if (bulkUpdate.userIds.includes(request.user!.id)) {
        reply.code(HttpStatusCode.BAD_REQUEST).send({
          success: false,
          error: 'Cannot change your own role in bulk operation',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      
      const result = await userService.bulkUpdateRoles(bulkUpdate);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: result,
        message: 'Bulk role update completed',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to bulk update user roles', error, { bulkUpdate: request.body });
      
      if (error.statusCode) {
        reply.code(error.statusCode).send({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else {
        reply.code(HttpStatusCode.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Internal server error',
          timestamp: new Date().toISOString(),
        });
      }
    }
  });
  
  // Get users by role (admin only)
  fastify.get('/role/:role', {
    preHandler: [authenticateJWT, requireAdmin],
    schema: {
      tags: ['Users'],
      summary: 'Get users by role (Admin only)',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        role: Type.Union([
          Type.Literal('admin'),
          Type.Literal('instructor'),
          Type.Literal('student'),
        ]),
      }),
      response: {
        200: ApiResponseSchema(Type.Array(UserSchema)),
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { role: any } }>, reply: FastifyReply) => {
    try {
      const { role } = request.params;
      const users = await userService.getUsersByRole(role);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: users,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to get users by role', error, { role: request.params.role });
      
      if (error.statusCode) {
        reply.code(error.statusCode).send({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else {
        reply.code(HttpStatusCode.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Internal server error',
          timestamp: new Date().toISOString(),
        });
      }
    }
  });
}
