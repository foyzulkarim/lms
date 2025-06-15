import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { 
  ModuleSchema, 
  CreateModuleSchema, 
  UpdateModuleSchema,
  SuccessResponseSchema,
} from '../types/course';
import { ModuleModel } from '../models/module';
import { CourseModel } from '../models/course';
import { LessonModel } from '../models/lesson';
import { authenticate, optionalAuth } from '../middleware/auth';
import { NotFoundError, AuthorizationError, ValidationError } from '../middleware/error-handler';
import { CacheService } from '../redis';
import { EventPublisher } from '../kafka';

export const moduleRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  
  // Get modules by course
  fastify.get('/course/:courseId', {
    schema: {
      tags: ['Modules'],
      summary: 'Get modules by course',
      params: {
        type: 'object',
        properties: {
          courseId: { type: 'string', format: 'uuid' },
        },
        required: ['courseId'],
      },
      response: {
        200: Type.Array(ModuleSchema),
        404: { type: 'object' },
      },
    },
    preHandler: [optionalAuth],
  }, async (request, reply) => {
    const { courseId } = request.params as { courseId: string };
    
    // Check if course exists
    const course = await CourseModel.findById(courseId);
    if (!course) {
      throw new NotFoundError('Course not found');
    }
    
    // Check access
    const isOwner = request.user?.id === course.instructorId;
    const isAdmin = request.user?.roles?.includes('admin');
    const hasAccess = course.status === 'published' || isOwner || isAdmin;
    
    if (!hasAccess) {
      throw new NotFoundError('Course not found');
    }
    
    // Check cache first
    let modules = await CacheService.getCourseModules(courseId);
    
    if (!modules) {
      // Get modules based on access level
      modules = isOwner || isAdmin 
        ? await ModuleModel.findByCourse(courseId)
        : await ModuleModel.findPublishedByCourse(courseId);
      
      // Cache the result
      await CacheService.setCourseModules(courseId, modules);
    }
    
    return modules;
  });

  // Get module by ID
  fastify.get('/:id', {
    schema: {
      tags: ['Modules'],
      summary: 'Get module by ID',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      response: {
        200: ModuleSchema,
        404: { type: 'object' },
      },
    },
    preHandler: [optionalAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    // Check cache first
    let module = await CacheService.getModule(id);
    
    if (!module) {
      module = await ModuleModel.findById(id);
      if (!module) {
        throw new NotFoundError('Module not found');
      }
      
      // Cache the result
      await CacheService.setModule(id, module);
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
    
    return module;
  });

  // Create module (course owner only)
  fastify.post('/course/:courseId', {
    schema: {
      tags: ['Modules'],
      summary: 'Create a new module',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          courseId: { type: 'string', format: 'uuid' },
        },
        required: ['courseId'],
      },
      body: CreateModuleSchema,
      response: {
        201: ModuleSchema,
        400: { type: 'object' },
        401: { type: 'object' },
        403: { type: 'object' },
        404: { type: 'object' },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { courseId } = request.params as { courseId: string };
    const moduleData = request.body as any;
    const user = request.user!;
    
    // Check if course exists and user owns it
    const course = await CourseModel.findById(courseId);
    if (!course) {
      throw new NotFoundError('Course not found');
    }
    
    const isOwner = user.id === course.instructorId;
    const isAdmin = user.roles?.includes('admin');
    
    if (!isOwner && !isAdmin) {
      throw new AuthorizationError('You can only add modules to your own courses');
    }
    
    const module = await ModuleModel.create(courseId, moduleData);
    
    // Invalidate cache
    await CacheService.invalidateModuleCache(module.id, courseId);
    
    // Publish event
    await EventPublisher.publishModuleCreated(module.id, courseId, course.instructorId, {
      title: module.title,
    });
    
    reply.status(201);
    return module;
  });

  // Update module (course owner only)
  fastify.put('/:id', {
    schema: {
      tags: ['Modules'],
      summary: 'Update module',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      body: UpdateModuleSchema,
      response: {
        200: ModuleSchema,
        400: { type: 'object' },
        401: { type: 'object' },
        403: { type: 'object' },
        404: { type: 'object' },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const moduleData = request.body as any;
    const user = request.user!;
    
    const existingModule = await ModuleModel.findById(id);
    if (!existingModule) {
      throw new NotFoundError('Module not found');
    }
    
    // Check course ownership
    const course = await CourseModel.findById(existingModule.courseId);
    if (!course) {
      throw new NotFoundError('Course not found');
    }
    
    const isOwner = user.id === course.instructorId;
    const isAdmin = user.roles?.includes('admin');
    
    if (!isOwner && !isAdmin) {
      throw new AuthorizationError('You can only update modules in your own courses');
    }
    
    const module = await ModuleModel.update(id, moduleData);
    if (!module) {
      throw new NotFoundError('Module not found');
    }
    
    // Invalidate cache
    await CacheService.invalidateModuleCache(id, existingModule.courseId);
    
    // Publish event
    await EventPublisher.publishModuleUpdated(module.id, existingModule.courseId, course.instructorId, {
      title: module.title,
      changes: Object.keys(moduleData),
    });
    
    return module;
  });

  // Reorder modules
  fastify.put('/course/:courseId/reorder', {
    schema: {
      tags: ['Modules'],
      summary: 'Reorder modules in a course',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          courseId: { type: 'string', format: 'uuid' },
        },
        required: ['courseId'],
      },
      body: {
        type: 'object',
        properties: {
          moduleIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
          },
        },
        required: ['moduleIds'],
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
    const { courseId } = request.params as { courseId: string };
    const { moduleIds } = request.body as { moduleIds: string[] };
    const user = request.user!;
    
    // Check course ownership
    const course = await CourseModel.findById(courseId);
    if (!course) {
      throw new NotFoundError('Course not found');
    }
    
    const isOwner = user.id === course.instructorId;
    const isAdmin = user.roles?.includes('admin');
    
    if (!isOwner && !isAdmin) {
      throw new AuthorizationError('You can only reorder modules in your own courses');
    }
    
    // Validate all modules belong to the course
    const modules = await ModuleModel.findByCourse(courseId);
    const existingModuleIds = modules.map(m => m.id);
    
    if (moduleIds.length !== existingModuleIds.length || 
        !moduleIds.every(id => existingModuleIds.includes(id))) {
      throw new ValidationError('Invalid module IDs provided');
    }
    
    const success = await ModuleModel.reorderModules(courseId, moduleIds);
    if (!success) {
      throw new ValidationError('Failed to reorder modules');
    }
    
    // Invalidate cache
    await CacheService.invalidateCourseCache(courseId);
    
    return {
      success: true,
      message: 'Modules reordered successfully',
    };
  });

  // Publish module
  fastify.post('/:id/publish', {
    schema: {
      tags: ['Modules'],
      summary: 'Publish module',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      response: {
        200: ModuleSchema,
        401: { type: 'object' },
        403: { type: 'object' },
        404: { type: 'object' },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;
    
    const existingModule = await ModuleModel.findById(id);
    if (!existingModule) {
      throw new NotFoundError('Module not found');
    }
    
    // Check course ownership
    const course = await CourseModel.findById(existingModule.courseId);
    if (!course) {
      throw new NotFoundError('Course not found');
    }
    
    const isOwner = user.id === course.instructorId;
    const isAdmin = user.roles?.includes('admin');
    
    if (!isOwner && !isAdmin) {
      throw new AuthorizationError('You can only publish modules in your own courses');
    }
    
    // Validate module has content
    const lessonCount = await LessonModel.getPublishedLessonCount(id);
    if (lessonCount === 0) {
      throw new ValidationError('Module must have at least one published lesson to be published');
    }
    
    const module = await ModuleModel.publish(id);
    if (!module) {
      throw new NotFoundError('Module not found');
    }
    
    // Update module estimated duration
    const totalDuration = await LessonModel.getPublishedTotalDuration(id);
    await ModuleModel.updateEstimatedDuration(id, totalDuration);
    
    // Invalidate cache
    await CacheService.invalidateModuleCache(id, existingModule.courseId);
    
    return module;
  });

  // Unpublish module
  fastify.post('/:id/unpublish', {
    schema: {
      tags: ['Modules'],
      summary: 'Unpublish module',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      response: {
        200: ModuleSchema,
        401: { type: 'object' },
        403: { type: 'object' },
        404: { type: 'object' },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;
    
    const existingModule = await ModuleModel.findById(id);
    if (!existingModule) {
      throw new NotFoundError('Module not found');
    }
    
    // Check course ownership
    const course = await CourseModel.findById(existingModule.courseId);
    if (!course) {
      throw new NotFoundError('Course not found');
    }
    
    const isOwner = user.id === course.instructorId;
    const isAdmin = user.roles?.includes('admin');
    
    if (!isOwner && !isAdmin) {
      throw new AuthorizationError('You can only unpublish modules in your own courses');
    }
    
    const module = await ModuleModel.unpublish(id);
    if (!module) {
      throw new NotFoundError('Module not found');
    }
    
    // Invalidate cache
    await CacheService.invalidateModuleCache(id, existingModule.courseId);
    
    return module;
  });

  // Delete module (course owner only)
  fastify.delete('/:id', {
    schema: {
      tags: ['Modules'],
      summary: 'Delete module',
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
    
    const existingModule = await ModuleModel.findById(id);
    if (!existingModule) {
      throw new NotFoundError('Module not found');
    }
    
    // Check course ownership
    const course = await CourseModel.findById(existingModule.courseId);
    if (!course) {
      throw new NotFoundError('Course not found');
    }
    
    const isOwner = user.id === course.instructorId;
    const isAdmin = user.roles?.includes('admin');
    
    if (!isOwner && !isAdmin) {
      throw new AuthorizationError('You can only delete modules from your own courses');
    }
    
    const deleted = await ModuleModel.delete(id);
    if (!deleted) {
      throw new NotFoundError('Module not found');
    }
    
    // Invalidate cache
    await CacheService.invalidateModuleCache(id, existingModule.courseId);
    
    // Publish event
    await EventPublisher.publishModuleDeleted(id, existingModule.courseId, course.instructorId, {
      title: existingModule.title,
    });
    
    return {
      success: true,
      message: 'Module deleted successfully',
    };
  });
};
