import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { enrollmentService } from '@/services/enrollment.service';
import { 
  authenticateJWT, 
  requireOwnership, 
  extractUserId,
  validateUUID,
} from '@/middleware/auth.middleware';
import {
  UserEnrollmentSchema,
  CreateEnrollmentSchema,
  UpdateEnrollmentSchema,
  ApiResponseSchema,
  ErrorResponseSchema,
  PaginatedResponseSchema,
} from '@/types/user.types';
import { HttpStatusCode, SuccessMessage } from '@/types/api.types';
import { log } from '@/utils/logger';

export async function enrollmentRoutes(fastify: FastifyInstance) {
  // Get current user enrollments
  fastify.get('/me/enrollments', {
    preHandler: [authenticateJWT],
    schema: {
      tags: ['Enrollments'],
      summary: 'Get current user enrollments',
      security: [{ bearerAuth: [] }],
      querystring: Type.Object({
        page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
        status: Type.Optional(Type.Union([
          Type.Literal('active'),
          Type.Literal('completed'),
          Type.Literal('dropped'),
          Type.Literal('suspended'),
        ])),
      }),
      response: {
        200: PaginatedResponseSchema(UserEnrollmentSchema),
        401: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) => {
    try {
      const userId = request.user!.id;
      const { page = 1, limit = 20, status } = request.query;
      
      const result = await enrollmentService.getUserEnrollments(userId, page, limit, status);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: result.enrollments,
        pagination: result.pagination,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to get current user enrollments', error, { userId: request.user?.id });
      
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
  
  // Enroll current user in a course
  fastify.post('/me/enrollments', {
    preHandler: [authenticateJWT],
    schema: {
      tags: ['Enrollments'],
      summary: 'Enroll current user in a course',
      security: [{ bearerAuth: [] }],
      body: CreateEnrollmentSchema,
      response: {
        201: ApiResponseSchema(UserEnrollmentSchema),
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    try {
      const userId = request.user!.id;
      const enrollmentData = request.body;
      
      const enrollment = await enrollmentService.enrollUser(userId, enrollmentData);
      
      reply.code(HttpStatusCode.CREATED).send({
        success: true,
        data: enrollment,
        message: SuccessMessage.ENROLLMENT_CREATED,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to enroll current user', error, { 
        userId: request.user?.id,
        enrollmentData: request.body,
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
  
  // Get user enrollments by user ID
  fastify.get('/:userId/enrollments', {
    preHandler: [authenticateJWT, validateUUID('userId'), extractUserId, requireOwnership('userId')],
    schema: {
      tags: ['Enrollments'],
      summary: 'Get user enrollments by user ID',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        userId: Type.String({ description: 'User ID or "me"' }),
      }),
      querystring: Type.Object({
        page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
        status: Type.Optional(Type.Union([
          Type.Literal('active'),
          Type.Literal('completed'),
          Type.Literal('dropped'),
          Type.Literal('suspended'),
        ])),
      }),
      response: {
        200: PaginatedResponseSchema(UserEnrollmentSchema),
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { userId: string }; Querystring: any }>, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      const { page = 1, limit = 20, status } = request.query;
      
      const result = await enrollmentService.getUserEnrollments(userId, page, limit, status);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: result.enrollments,
        pagination: result.pagination,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to get user enrollments', error, { userId: request.params.userId });
      
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
  
  // Enroll user in a course
  fastify.post('/:userId/enrollments', {
    preHandler: [authenticateJWT, validateUUID('userId'), extractUserId, requireOwnership('userId')],
    schema: {
      tags: ['Enrollments'],
      summary: 'Enroll user in a course',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        userId: Type.String({ description: 'User ID or "me"' }),
      }),
      body: CreateEnrollmentSchema,
      response: {
        201: ApiResponseSchema(UserEnrollmentSchema),
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { userId: string }; Body: any }>, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      const enrollmentData = request.body;
      
      const enrollment = await enrollmentService.enrollUser(userId, enrollmentData);
      
      reply.code(HttpStatusCode.CREATED).send({
        success: true,
        data: enrollment,
        message: SuccessMessage.ENROLLMENT_CREATED,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to enroll user', error, { 
        userId: request.params.userId,
        enrollmentData: request.body,
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
  
  // Update enrollment
  fastify.put('/:userId/enrollments/:courseId', {
    preHandler: [authenticateJWT, validateUUID('userId'), validateUUID('courseId'), extractUserId, requireOwnership('userId')],
    schema: {
      tags: ['Enrollments'],
      summary: 'Update enrollment',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        userId: Type.String({ description: 'User ID or "me"' }),
        courseId: Type.String({ description: 'Course ID' }),
      }),
      body: UpdateEnrollmentSchema,
      response: {
        200: ApiResponseSchema(UserEnrollmentSchema),
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { userId: string; courseId: string }; Body: any }>, reply: FastifyReply) => {
    try {
      const { userId, courseId } = request.params;
      const updates = request.body;
      
      // Get enrollment by user and course
      const enrollment = await enrollmentService.getEnrollmentByUserAndCourse(userId, courseId);
      
      // Update enrollment
      const updatedEnrollment = await enrollmentService.updateEnrollment(enrollment.id, updates);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: updatedEnrollment,
        message: SuccessMessage.ENROLLMENT_UPDATED,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to update enrollment', error, { 
        userId: request.params.userId,
        courseId: request.params.courseId,
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
  
  // Update enrollment progress
  fastify.put('/:userId/enrollments/:courseId/progress', {
    preHandler: [authenticateJWT, validateUUID('userId'), validateUUID('courseId'), extractUserId, requireOwnership('userId')],
    schema: {
      tags: ['Enrollments'],
      summary: 'Update enrollment progress',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        userId: Type.String({ description: 'User ID or "me"' }),
        courseId: Type.String({ description: 'Course ID' }),
      }),
      body: Type.Object({
        progress: Type.Number({ minimum: 0, maximum: 100 }),
      }),
      response: {
        200: ApiResponseSchema(UserEnrollmentSchema),
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { userId: string; courseId: string }; Body: { progress: number } }>, reply: FastifyReply) => {
    try {
      const { userId, courseId } = request.params;
      const { progress } = request.body;
      
      // Get enrollment by user and course
      const enrollment = await enrollmentService.getEnrollmentByUserAndCourse(userId, courseId);
      
      // Update progress
      const updatedEnrollment = await enrollmentService.updateProgress(enrollment.id, progress);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: updatedEnrollment,
        message: 'Progress updated successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to update enrollment progress', error, { 
        userId: request.params.userId,
        courseId: request.params.courseId,
        progress: request.body.progress,
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
  
  // Unenroll from course
  fastify.delete('/:userId/enrollments/:courseId', {
    preHandler: [authenticateJWT, validateUUID('userId'), validateUUID('courseId'), extractUserId, requireOwnership('userId')],
    schema: {
      tags: ['Enrollments'],
      summary: 'Unenroll from course',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        userId: Type.String({ description: 'User ID or "me"' }),
        courseId: Type.String({ description: 'Course ID' }),
      }),
      response: {
        200: ApiResponseSchema(Type.Object({ deleted: Type.Boolean() })),
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { userId: string; courseId: string } }>, reply: FastifyReply) => {
    try {
      const { userId, courseId } = request.params;
      
      const deleted = await enrollmentService.unenrollUser(userId, courseId);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: { deleted },
        message: SuccessMessage.ENROLLMENT_DELETED,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to unenroll from course', error, { 
        userId: request.params.userId,
        courseId: request.params.courseId,
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
  
  // Get enrollment statistics
  fastify.get('/:userId/enrollments/stats', {
    preHandler: [authenticateJWT, validateUUID('userId'), extractUserId, requireOwnership('userId')],
    schema: {
      tags: ['Enrollments'],
      summary: 'Get enrollment statistics',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        userId: Type.String({ description: 'User ID or "me"' }),
      }),
      response: {
        200: ApiResponseSchema(Type.Any()),
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      const stats = await enrollmentService.getUserEnrollmentStats(userId);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to get enrollment statistics', error, { userId: request.params.userId });
      
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
  
  // Get active enrollments
  fastify.get('/:userId/enrollments/active', {
    preHandler: [authenticateJWT, validateUUID('userId'), extractUserId, requireOwnership('userId')],
    schema: {
      tags: ['Enrollments'],
      summary: 'Get active enrollments',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        userId: Type.String({ description: 'User ID or "me"' }),
      }),
      response: {
        200: ApiResponseSchema(Type.Array(UserEnrollmentSchema)),
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      const enrollments = await enrollmentService.getActiveEnrollments(userId);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: enrollments,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to get active enrollments', error, { userId: request.params.userId });
      
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
  
  // Get completed enrollments
  fastify.get('/:userId/enrollments/completed', {
    preHandler: [authenticateJWT, validateUUID('userId'), extractUserId, requireOwnership('userId')],
    schema: {
      tags: ['Enrollments'],
      summary: 'Get completed enrollments',
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        userId: Type.String({ description: 'User ID or "me"' }),
      }),
      response: {
        200: ApiResponseSchema(Type.Array(UserEnrollmentSchema)),
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      const enrollments = await enrollmentService.getCompletedEnrollments(userId);
      
      reply.code(HttpStatusCode.OK).send({
        success: true,
        data: enrollments,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Failed to get completed enrollments', error, { userId: request.params.userId });
      
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
