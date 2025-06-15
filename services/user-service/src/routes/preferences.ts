import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { preferenceService } from '@/services/preference.service';
import { 
  authenticateJWT, 
  requireOwnership, 
  extractUserId,
  validateUUID,
} from '@/middleware/auth.middleware';
import {
  UserPreferenceSchema,
  UpsertPreferenceSchema,
  ApiResponseSchema,
  ErrorResponseSchema,
} from '@/types/user.types';
import { HttpStatusCode, SuccessMessage } from '@/types/api.types';
import { log } from '@/utils/logger';

export async function preferenceRoutes(fastify: FastifyInstance) {
  // Get current user preferences
  fastify.get('/me/preferences', {
    preHandler: [authenticateJWT],
    schema: {
      tags: ['Preferences'],
      summary: 'Get current user preferences',
      security: [{ bearerAuth: [] }],
      response: {
        200: ApiResponseSchema(Type.Array(UserPreferenceSchema)),
        401: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user!.id;
      const preferences = await preferenceService.getUserPreferences(userId);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: preferences,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to get current user preferences', error, { userId: request.user?.id });
      
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
  
  // Get current user preferences as object
  fastify.get('/me/preferences/object', {
    preHandler: [authenticateJWT],
    schema: {
      tags: ['Preferences'],
      summary: 'Get current user preferences as structured object',
      security: [{ bearerAuth: [] }],
      response: {
        200: ApiResponseSchema(Type.Any()),
        401: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user!.id;
      const preferencesObject = await preferenceService.getPreferencesObject(userId);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: preferencesObject,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to get current user preferences object', error, { userId: request.user?.id });
      
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
  
  // Update current user preferences (bulk)
  fastify.put('/me/preferences', {
    preHandler: [authenticateJWT],
    schema: {
      tags: ['Preferences'],
      summary: 'Bulk update current user preferences',
      security: [{ bearerAuth: [] }],
      body: Type.Array(UpsertPreferenceSchema),
      response: {
        200: ApiResponseSchema(Type.Array(UserPreferenceSchema)),
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Body: any[] }>, reply: FastifyReply) => {
    try {
      const userId = request.user!.id;
      const preferences = request.body;
      
      const updatedPreferences = await preferenceService.bulkUpdatePreferences(userId, preferences);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: updatedPreferences,
        message: SuccessMessage.PREFERENCES_UPDATED,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to bulk update current user preferences', error, { 
        userId: request.user?.id,
        preferences: request.body,
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
  
  // Get current user preferences by category
  fastify.get('/me/preferences/:category', {
    preHandler: [authenticateJWT],
    schema: {
      tags: ['Preferences'],
      summary: 'Get current user preferences by category',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        category: Type.String(),
      }),
      response: {
        200: ApiResponseSchema(Type.Array(UserPreferenceSchema)),
        401: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { category: string } }>, reply: FastifyReply) => {
    try {
      const userId = request.user!.id;
      const { category } = request.params;
      
      const preferences = await preferenceService.getCategoryPreferences(userId, category);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: preferences,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to get current user category preferences', error, { 
        userId: request.user?.id,
        category: request.params.category,
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
  
  // Update current user preferences by category
  fastify.put('/me/preferences/:category', {
    preHandler: [authenticateJWT],
    schema: {
      tags: ['Preferences'],
      summary: 'Update current user preferences by category',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        category: Type.String(),
      }),
      body: Type.Record(Type.String(), Type.Any()),
      response: {
        200: ApiResponseSchema(Type.Array(UserPreferenceSchema)),
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { category: string }; Body: Record<string, any> }>, reply: FastifyReply) => {
    try {
      const userId = request.user!.id;
      const { category } = request.params;
      const preferences = request.body;
      
      const updatedPreferences = await preferenceService.updateCategoryPreferences(userId, category, preferences);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: updatedPreferences,
        message: SuccessMessage.PREFERENCES_UPDATED,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to update current user category preferences', error, { 
        userId: request.user?.id,
        category: request.params.category,
        preferences: request.body,
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
  
  // Get user preferences by user ID
  fastify.get('/:userId/preferences', {
    preHandler: [authenticateJWT, validateUUID('userId'), extractUserId, requireOwnership('userId')],
    schema: {
      tags: ['Preferences'],
      summary: 'Get user preferences by user ID',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        userId: Type.String({ description: 'User ID or "me"' }),
      }),
      response: {
        200: ApiResponseSchema(Type.Array(UserPreferenceSchema)),
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      const preferences = await preferenceService.getUserPreferences(userId);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: preferences,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to get user preferences', error, { userId: request.params.userId });
      
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
  
  // Update user preferences
  fastify.put('/:userId/preferences', {
    preHandler: [authenticateJWT, validateUUID('userId'), extractUserId, requireOwnership('userId')],
    schema: {
      tags: ['Preferences'],
      summary: 'Bulk update user preferences',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        userId: Type.String({ description: 'User ID or "me"' }),
      }),
      body: Type.Array(UpsertPreferenceSchema),
      response: {
        200: ApiResponseSchema(Type.Array(UserPreferenceSchema)),
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { userId: string }; Body: any[] }>, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      const preferences = request.body;
      
      const updatedPreferences = await preferenceService.bulkUpdatePreferences(userId, preferences);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: updatedPreferences,
        message: SuccessMessage.PREFERENCES_UPDATED,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to bulk update user preferences', error, { 
        userId: request.params.userId,
        preferences: request.body,
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
  
  // Get user preferences by category
  fastify.get('/:userId/preferences/:category', {
    preHandler: [authenticateJWT, validateUUID('userId'), extractUserId, requireOwnership('userId')],
    schema: {
      tags: ['Preferences'],
      summary: 'Get user preferences by category',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        userId: Type.String({ description: 'User ID or "me"' }),
        category: Type.String(),
      }),
      response: {
        200: ApiResponseSchema(Type.Array(UserPreferenceSchema)),
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { userId: string; category: string } }>, reply: FastifyReply) => {
    try {
      const { userId, category } = request.params;
      const preferences = await preferenceService.getCategoryPreferences(userId, category);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: preferences,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to get user category preferences', error, { 
        userId: request.params.userId,
        category: request.params.category,
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
  
  // Update user preferences by category
  fastify.put('/:userId/preferences/:category', {
    preHandler: [authenticateJWT, validateUUID('userId'), extractUserId, requireOwnership('userId')],
    schema: {
      tags: ['Preferences'],
      summary: 'Update user preferences by category',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        userId: Type.String({ description: 'User ID or "me"' }),
        category: Type.String(),
      }),
      body: Type.Record(Type.String(), Type.Any()),
      response: {
        200: ApiResponseSchema(Type.Array(UserPreferenceSchema)),
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { userId: string; category: string }; Body: Record<string, any> }>, reply: FastifyReply) => {
    try {
      const { userId, category } = request.params;
      const preferences = request.body;
      
      const updatedPreferences = await preferenceService.updateCategoryPreferences(userId, category, preferences);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: updatedPreferences,
        message: SuccessMessage.PREFERENCES_UPDATED,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to update user category preferences', error, { 
        userId: request.params.userId,
        category: request.params.category,
        preferences: request.body,
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
  
  // Delete user preference
  fastify.delete('/:userId/preferences/:category/:key', {
    preHandler: [authenticateJWT, validateUUID('userId'), extractUserId, requireOwnership('userId')],
    schema: {
      tags: ['Preferences'],
      summary: 'Delete user preference',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        userId: Type.String({ description: 'User ID or "me"' }),
        category: Type.String(),
        key: Type.String(),
      }),
      response: {
        200: ApiResponseSchema(Type.Object({ deleted: Type.Boolean() })),
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { userId: string; category: string; key: string } }>, reply: FastifyReply) => {
    try {
      const { userId, category, key } = request.params;
      
      const deleted = await preferenceService.deletePreference(userId, category, key);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: { deleted },
        message: deleted ? 'Preference deleted successfully' : 'Preference not found',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to delete user preference', error, { 
        userId: request.params.userId,
        category: request.params.category,
        key: request.params.key,
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
  
  // Delete user category preferences
  fastify.delete('/:userId/preferences/:category', {
    preHandler: [authenticateJWT, validateUUID('userId'), extractUserId, requireOwnership('userId')],
    schema: {
      tags: ['Preferences'],
      summary: 'Delete user category preferences',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        userId: Type.String({ description: 'User ID or "me"' }),
        category: Type.String(),
      }),
      response: {
        200: ApiResponseSchema(Type.Object({ deletedCount: Type.Number() })),
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { userId: string; category: string } }>, reply: FastifyReply) => {
    try {
      const { userId, category } = request.params;
      
      const deletedCount = await preferenceService.deleteCategoryPreferences(userId, category);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: { deletedCount },
        message: `${deletedCount} preferences deleted successfully`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to delete user category preferences', error, { 
        userId: request.params.userId,
        category: request.params.category,
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
}
