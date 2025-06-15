import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { 
  LessonSchema, 
  CreateLessonSchema, 
  UpdateLessonSchema,
  SuccessResponseSchema,
} from '../types/course';
import { LessonModel } from '../models/lesson';
import { ModuleModel } from '../models/module';
import { CourseModel } from '../models/course';
import { authenticate, optionalAuth } from '../middleware/auth';
import { NotFoundError, AuthorizationError, ValidationError } from '../middleware/error-handler';
import { CacheService } from '../redis';
import { EventPublisher } from '../kafka';

export const lessonRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  
  // Get lessons by module
  fastify.get('/module/:moduleId', {
    schema: {
      tags: ['Lessons'],
      summary: 'Get lessons by module',
      params: {
        type: 'object',
        properties: {
          moduleId: { type: 'string', format: 'uuid' },
        },
        required: ['moduleId'],
      },
      response: {
        200: Type.Array(LessonSchema),
        404: { type: 'object' },
      },
    },
    preHandler: [optionalAuth],
  }, async (request, reply) => {
    const { moduleId } = request.params as { moduleId: string };
    
    // Check if module exists
    const module = await ModuleModel.findById(moduleId);
    if (!module) {
      throw new NotFoundError('Module not found');
    }
    
    // Check course access
    const course = await CourseModel.findById(module.courseId);
    if (!course) {
      throw new NotFoundError('Course not found');
    }
    
    const isOwner = request.user?.id === course.instructorId;
    const isAdmin = request.user?.roles?.includes('admin');
    const hasAccess = (course.status === 'published' && module.isPublished) || isOwner || isAdmin;
    
    if (!hasAccess) {
      throw new NotFoundError('Module not found');
    }
    
    // Check cache first
    let lessons = await CacheService.getModuleLessons(moduleId);
    
    if (!lessons) {
      // Get lessons based on access level
      lessons = isOwner || isAdmin 
        ? await LessonModel.findByModule(moduleId)
        : await LessonModel.findPublishedByModule(moduleId);
      
      // Cache the result
      await CacheService.setModuleLessons(moduleId, lessons);
    }
    
    return lessons;
  });

  // Get lesson by ID
  fastify.get('/:id', {
    schema: {
      tags: ['Lessons'],
      summary: 'Get lesson by ID',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      response: {
        200: LessonSchema,
        404: { type: 'object' },
      },
    },
    preHandler: [optionalAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    // Check cache first
    let lesson = await CacheService.getLesson(id);
    
    if (!lesson) {
      lesson = await LessonModel.findById(id);
      if (!lesson) {
        throw new NotFoundError('Lesson not found');
      }
      
      // Cache the result
      await CacheService.setLesson(id, lesson);
    }
    
    // Check access
    const module = await ModuleModel.findById(lesson.moduleId);
    if (!module) {
      throw new NotFoundError('Module not found');
    }
    
    const course = await CourseModel.findById(lesson.courseId);
    if (!course) {
      throw new NotFoundError('Course not found');
    }
    
    const isOwner = request.user?.id === course.instructorId;
    const isAdmin = request.user?.roles?.includes('admin');
    const isFreeLesson = lesson.isFree && lesson.isPublished;
    const hasAccess = (course.status === 'published' && module.isPublished && lesson.isPublished) || 
                     isFreeLesson || isOwner || isAdmin;
    
    if (!hasAccess) {
      throw new NotFoundError('Lesson not found');
    }
    
    return lesson;
  });

  // Get free lessons by course
  fastify.get('/course/:courseId/free', {
    schema: {
      tags: ['Lessons'],
      summary: 'Get free lessons by course',
      params: {
        type: 'object',
        properties: {
          courseId: { type: 'string', format: 'uuid' },
        },
        required: ['courseId'],
      },
      response: {
        200: Type.Array(LessonSchema),
        404: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    const { courseId } = request.params as { courseId: string };
    
    // Check if course exists and is published
    const course = await CourseModel.findById(courseId);
    if (!course || course.status !== 'published') {
      throw new NotFoundError('Course not found');
    }
    
    const lessons = await LessonModel.findFreeLessons(courseId);
    return lessons;
  });

  // Create lesson (course owner only)
  fastify.post('/module/:moduleId', {
    schema: {
      tags: ['Lessons'],
      summary: 'Create a new lesson',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          moduleId: { type: 'string', format: 'uuid' },
        },
        required: ['moduleId'],
      },
      body: CreateLessonSchema,
      response: {
        201: LessonSchema,
        400: { type: 'object' },
        401: { type: 'object' },
        403: { type: 'object' },
        404: { type: 'object' },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { moduleId } = request.params as { moduleId: string };
    const lessonData = request.body as any;
    const user = request.user!;
    
    // Check if module exists
    const module = await ModuleModel.findById(moduleId);
    if (!module) {
      throw new NotFoundError('Module not found');
    }
    
    // Check course ownership
    const course = await CourseModel.findById(module.courseId);
    if (!course) {
      throw new NotFoundError('Course not found');
    }
    
    const isOwner = user.id === course.instructorId;
    const isAdmin = user.roles?.includes('admin');
    
    if (!isOwner && !isAdmin) {
      throw new AuthorizationError('You can only add lessons to your own courses');
    }
    
    const lesson = await LessonModel.create(moduleId, module.courseId, lessonData);
    
    // Invalidate cache
    await CacheService.invalidateLessonCache(lesson.id, moduleId, module.courseId);
    
    // Publish event
    await EventPublisher.publishLessonCreated(lesson.id, moduleId, module.courseId, course.instructorId, {
      title: lesson.title,
      type: lesson.type,
    });
    
    reply.status(201);
    return lesson;
  });

  // Update lesson (course owner only)
  fastify.put('/:id', {
    schema: {
      tags: ['Lessons'],
      summary: 'Update lesson',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      body: UpdateLessonSchema,
      response: {
        200: LessonSchema,
        400: { type: 'object' },
        401: { type: 'object' },
        403: { type: 'object' },
        404: { type: 'object' },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const lessonData = request.body as any;
    const user = request.user!;
    
    const existingLesson = await LessonModel.findById(id);
    if (!existingLesson) {
      throw new NotFoundError('Lesson not found');
    }
    
    // Check course ownership
    const course = await CourseModel.findById(existingLesson.courseId);
    if (!course) {
      throw new NotFoundError('Course not found');
    }
    
    const isOwner = user.id === course.instructorId;
    const isAdmin = user.roles?.includes('admin');
    
    if (!isOwner && !isAdmin) {
      throw new AuthorizationError('You can only update lessons in your own courses');
    }
    
    const lesson = await LessonModel.update(id, lessonData);
    if (!lesson) {
      throw new NotFoundError('Lesson not found');
    }
    
    // Invalidate cache
    await CacheService.invalidateLessonCache(id, existingLesson.moduleId, existingLesson.courseId);
    
    // Publish event
    await EventPublisher.publishLessonUpdated(lesson.id, existingLesson.moduleId, existingLesson.courseId, course.instructorId, {
      title: lesson.title,
      changes: Object.keys(lessonData),
    });
    
    return lesson;
  });

  // Reorder lessons
  fastify.put('/module/:moduleId/reorder', {
    schema: {
      tags: ['Lessons'],
      summary: 'Reorder lessons in a module',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          moduleId: { type: 'string', format: 'uuid' },
        },
        required: ['moduleId'],
      },
      body: {
        type: 'object',
        properties: {
          lessonIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
          },
        },
        required: ['lessonIds'],
      },
      response: {
        200: SuccessResponseSchema,
        400: { type: 'object' },
        401: { type: 'object' },
        403: { type: 'object' },
        404: { type: 'object' },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { moduleId } = request.params as { moduleId: string };
    const { lessonIds } = request.body as { lessonIds: string[] };
    const user = request.user!;
    
    // Check module exists
    const module = await ModuleModel.findById(moduleId);
    if (!module) {
      throw new NotFoundError('Module not found');
    }
    
    // Check course ownership
    const course = await CourseModel.findById(module.courseId);
    if (!course) {
      throw new NotFoundError('Course not found');
    }
    
    const isOwner = user.id === course.instructorId;
    const isAdmin = user.roles?.includes('admin');
    
    if (!isOwner && !isAdmin) {
      throw new AuthorizationError('You can only reorder lessons in your own courses');
    }
    
    // Validate all lessons belong to the module
    const lessons = await LessonModel.findByModule(moduleId);
    const existingLessonIds = lessons.map(l => l.id);
    
    if (lessonIds.length !== existingLessonIds.length || 
        !lessonIds.every(id => existingLessonIds.includes(id))) {
      throw new ValidationError('Invalid lesson IDs provided');
    }
    
    const success = await LessonModel.reorderLessons(moduleId, lessonIds);
    if (!success) {
      throw new ValidationError('Failed to reorder lessons');
    }
    
    // Invalidate cache
    await CacheService.invalidateModuleCache(moduleId, module.courseId);
    
    return {
      success: true,
      message: 'Lessons reordered successfully',
    };
  });

  // Publish lesson
  fastify.post('/:id/publish', {
    schema: {
      tags: ['Lessons'],
      summary: 'Publish lesson',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      response: {
        200: LessonSchema,
        401: { type: 'object' },
        403: { type: 'object' },
        404: { type: 'object' },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;
    
    const existingLesson = await LessonModel.findById(id);
    if (!existingLesson) {
      throw new NotFoundError('Lesson not found');
    }
    
    // Check course ownership
    const course = await CourseModel.findById(existingLesson.courseId);
    if (!course) {
      throw new NotFoundError('Course not found');
    }
    
    const isOwner = user.id === course.instructorId;
    const isAdmin = user.roles?.includes('admin');
    
    if (!isOwner && !isAdmin) {
      throw new AuthorizationError('You can only publish lessons in your own courses');
    }
    
    // Validate lesson has content
    if (!existingLesson.content && !existingLesson.videoUrl) {
      throw new ValidationError('Lesson must have content or video to be published');
    }
    
    const lesson = await LessonModel.publish(id);
    if (!lesson) {
      throw new NotFoundError('Lesson not found');
    }
    
    // Update module estimated duration
    const totalDuration = await LessonModel.getPublishedTotalDuration(existingLesson.moduleId);
    await ModuleModel.updateEstimatedDuration(existingLesson.moduleId, totalDuration);
    
    // Invalidate cache
    await CacheService.invalidateLessonCache(id, existingLesson.moduleId, existingLesson.courseId);
    
    return lesson;
  });

  // Unpublish lesson
  fastify.post('/:id/unpublish', {
    schema: {
      tags: ['Lessons'],
      summary: 'Unpublish lesson',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      response: {
        200: LessonSchema,
        401: { type: 'object' },
        403: { type: 'object' },
        404: { type: 'object' },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;
    
    const existingLesson = await LessonModel.findById(id);
    if (!existingLesson) {
      throw new NotFoundError('Lesson not found');
    }
    
    // Check course ownership
    const course = await CourseModel.findById(existingLesson.courseId);
    if (!course) {
      throw new NotFoundError('Course not found');
    }
    
    const isOwner = user.id === course.instructorId;
    const isAdmin = user.roles?.includes('admin');
    
    if (!isOwner && !isAdmin) {
      throw new AuthorizationError('You can only unpublish lessons in your own courses');
    }
    
    const lesson = await LessonModel.unpublish(id);
    if (!lesson) {
      throw new NotFoundError('Lesson not found');
    }
    
    // Update module estimated duration
    const totalDuration = await LessonModel.getPublishedTotalDuration(existingLesson.moduleId);
    await ModuleModel.updateEstimatedDuration(existingLesson.moduleId, totalDuration);
    
    // Invalidate cache
    await CacheService.invalidateLessonCache(id, existingLesson.moduleId, existingLesson.courseId);
    
    return lesson;
  });

  // Delete lesson (course owner only)
  fastify.delete('/:id', {
    schema: {
      tags: ['Lessons'],
      summary: 'Delete lesson',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      response: {
        200: SuccessResponseSchema,
        401: { type: 'object' },
        403: { type: 'object' },
        404: { type: 'object' },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;
    
    const existingLesson = await LessonModel.findById(id);
    if (!existingLesson) {
      throw new NotFoundError('Lesson not found');
    }
    
    // Check course ownership
    const course = await CourseModel.findById(existingLesson.courseId);
    if (!course) {
      throw new NotFoundError('Course not found');
    }
    
    const isOwner = user.id === course.instructorId;
    const isAdmin = user.roles?.includes('admin');
    
    if (!isOwner && !isAdmin) {
      throw new AuthorizationError('You can only delete lessons from your own courses');
    }
    
    const deleted = await LessonModel.delete(id);
    if (!deleted) {
      throw new NotFoundError('Lesson not found');
    }
    
    // Update module estimated duration
    const totalDuration = await LessonModel.getPublishedTotalDuration(existingLesson.moduleId);
    await ModuleModel.updateEstimatedDuration(existingLesson.moduleId, totalDuration);
    
    // Invalidate cache
    await CacheService.invalidateLessonCache(id, existingLesson.moduleId, existingLesson.courseId);
    
    // Publish event
    await EventPublisher.publishLessonDeleted(id, existingLesson.moduleId, existingLesson.courseId, course.instructorId, {
      title: existingLesson.title,
    });
    
    return {
      success: true,
      message: 'Lesson deleted successfully',
    };
  });
};
