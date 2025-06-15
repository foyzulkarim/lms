import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { 
  CourseSchema, 
  CreateCourseSchema, 
  UpdateCourseSchema,
  CourseQuerySchema,
  PaginatedCoursesSchema,
  SuccessResponseSchema,
  CourseWithModulesSchema,
} from '../types/course';
import { CourseModel } from '../models/course';
import { ModuleModel } from '../models/module';
import { LessonModel } from '../models/lesson';
import { authenticate, requireInstructor, optionalAuth } from '../middleware/auth';
import { NotFoundError, AuthorizationError, ValidationError } from '../middleware/error-handler';
import { CacheService } from '../redis';
import { EventPublisher } from '../kafka';

export const courseRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  
  // Get published courses (public endpoint)
  fastify.get('/', {
    schema: {
      tags: ['Courses'],
      summary: 'Get published courses',
      querystring: CourseQuerySchema,
      response: {
        200: PaginatedCoursesSchema,
      },
    },
    preHandler: [optionalAuth],
  }, async (request, reply) => {
    const query = request.query as any;
    
    const { courses, total } = await CourseModel.findPublished(query);
    
    const page = query.page || 1;
    const limit = query.limit || 20;
    const totalPages = Math.ceil(total / limit);
    
    return {
      courses,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  });

  // Get course by ID or slug
  fastify.get('/:identifier', {
    schema: {
      tags: ['Courses'],
      summary: 'Get course by ID or slug',
      params: {
        type: 'object',
        properties: {
          identifier: { type: 'string' },
        },
        required: ['identifier'],
      },
      response: {
        200: CourseSchema,
        404: { type: 'object' },
      },
    },
    preHandler: [optionalAuth],
  }, async (request, reply) => {
    const { identifier } = request.params as { identifier: string };
    
    // Check cache first
    let course = await CacheService.getCourse(identifier);
    
    if (!course) {
      // Try to find by ID first, then by slug
      course = await CourseModel.findById(identifier) || await CourseModel.findBySlug(identifier);
      
      if (!course) {
        throw new NotFoundError('Course not found');
      }
      
      // Cache the result
      await CacheService.setCourse(course.id, course);
    }
    
    // Check if user has access to unpublished courses
    if (course.status !== 'published') {
      if (!request.user || (request.user.id !== course.instructorId && !request.user.roles?.includes('admin'))) {
        throw new NotFoundError('Course not found');
      }
    }
    
    return course;
  });

  // Get course with modules and lessons
  fastify.get('/:identifier/full', {
    schema: {
      tags: ['Courses'],
      summary: 'Get course with modules and lessons',
      params: {
        type: 'object',
        properties: {
          identifier: { type: 'string' },
        },
        required: ['identifier'],
      },
      response: {
        200: CourseWithModulesSchema,
        404: { type: 'object' },
      },
    },
    preHandler: [optionalAuth],
  }, async (request, reply) => {
    const { identifier } = request.params as { identifier: string };
    
    // Check cache first
    let courseWithModules = await CacheService.getCourseWithModules(identifier);
    
    if (!courseWithModules) {
      // Get course
      const course = await CourseModel.findById(identifier) || await CourseModel.findBySlug(identifier);
      
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
      
      // Get modules and lessons
      const modules = isOwner || isAdmin 
        ? await ModuleModel.findByCourse(course.id)
        : await ModuleModel.findPublishedByCourse(course.id);
      
      const modulesWithLessons = await Promise.all(
        modules.map(async (module) => {
          const lessons = isOwner || isAdmin
            ? await LessonModel.findByModule(module.id)
            : await LessonModel.findPublishedByModule(module.id);
          
          return {
            ...module,
            lessons,
          };
        })
      );
      
      courseWithModules = {
        ...course,
        modules: modulesWithLessons,
      };
      
      // Cache the result
      await CacheService.setCourseWithModules(course.id, courseWithModules);
    }
    
    return courseWithModules;
  });

  // Create course (instructor only)
  fastify.post('/', {
    schema: {
      tags: ['Courses'],
      summary: 'Create a new course',
      security: [{ bearerAuth: [] }],
      body: CreateCourseSchema,
      response: {
        201: CourseSchema,
        400: { type: 'object' },
        401: { type: 'object' },
        403: { type: 'object' },
      },
    },
    preHandler: [authenticate, requireInstructor],
  }, async (request, reply) => {
    const courseData = request.body as any;
    const user = request.user!;
    
    const course = await CourseModel.create(
      courseData,
      user.id,
      `${user.firstName} ${user.lastName}`,
      user.email
    );
    
    // Publish event
    await EventPublisher.publishCourseCreated(course.id, user.id, {
      title: course.title,
      difficulty: course.difficulty,
    });
    
    reply.status(201);
    return course;
  });

  // Update course (owner or admin only)
  fastify.put('/:id', {
    schema: {
      tags: ['Courses'],
      summary: 'Update course',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      body: UpdateCourseSchema,
      response: {
        200: CourseSchema,
        400: { type: 'object' },
        401: { type: 'object' },
        403: { type: 'object' },
        404: { type: 'object' },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const courseData = request.body as any;
    const user = request.user!;
    
    const existingCourse = await CourseModel.findById(id);
    if (!existingCourse) {
      throw new NotFoundError('Course not found');
    }
    
    // Check ownership
    const isOwner = user.id === existingCourse.instructorId;
    const isAdmin = user.roles?.includes('admin');
    
    if (!isOwner && !isAdmin) {
      throw new AuthorizationError('You can only update your own courses');
    }
    
    const course = await CourseModel.update(id, courseData);
    if (!course) {
      throw new NotFoundError('Course not found');
    }
    
    // Invalidate cache
    await CacheService.invalidateCourseCache(id);
    
    // Publish event
    await EventPublisher.publishCourseUpdated(course.id, existingCourse.instructorId, {
      title: course.title,
      changes: Object.keys(courseData),
    });
    
    return course;
  });

  // Publish course
  fastify.post('/:id/publish', {
    schema: {
      tags: ['Courses'],
      summary: 'Publish course',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      response: {
        200: CourseSchema,
        401: { type: 'object' },
        403: { type: 'object' },
        404: { type: 'object' },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;
    
    const existingCourse = await CourseModel.findById(id);
    if (!existingCourse) {
      throw new NotFoundError('Course not found');
    }
    
    // Check ownership
    const isOwner = user.id === existingCourse.instructorId;
    const isAdmin = user.roles?.includes('admin');
    
    if (!isOwner && !isAdmin) {
      throw new AuthorizationError('You can only publish your own courses');
    }
    
    // Validate course has content
    const moduleCount = await ModuleModel.getPublishedModuleCount(id);
    if (moduleCount === 0) {
      throw new ValidationError('Course must have at least one published module to be published');
    }
    
    const course = await CourseModel.updateStatus(id, 'published');
    if (!course) {
      throw new NotFoundError('Course not found');
    }
    
    // Invalidate cache
    await CacheService.invalidateCourseCache(id);
    
    // Publish event
    await EventPublisher.publishCoursePublished(course.id, existingCourse.instructorId, {
      title: course.title,
    });
    
    return course;
  });

  // Unpublish course
  fastify.post('/:id/unpublish', {
    schema: {
      tags: ['Courses'],
      summary: 'Unpublish course',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      response: {
        200: CourseSchema,
        401: { type: 'object' },
        403: { type: 'object' },
        404: { type: 'object' },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;
    
    const existingCourse = await CourseModel.findById(id);
    if (!existingCourse) {
      throw new NotFoundError('Course not found');
    }
    
    // Check ownership
    const isOwner = user.id === existingCourse.instructorId;
    const isAdmin = user.roles?.includes('admin');
    
    if (!isOwner && !isAdmin) {
      throw new AuthorizationError('You can only unpublish your own courses');
    }
    
    const course = await CourseModel.updateStatus(id, 'draft');
    if (!course) {
      throw new NotFoundError('Course not found');
    }
    
    // Invalidate cache
    await CacheService.invalidateCourseCache(id);
    
    // Publish event
    await EventPublisher.publishCourseUnpublished(course.id, existingCourse.instructorId, {
      title: course.title,
    });
    
    return course;
  });

  // Delete course (owner or admin only)
  fastify.delete('/:id', {
    schema: {
      tags: ['Courses'],
      summary: 'Delete course',
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
    
    const existingCourse = await CourseModel.findById(id);
    if (!existingCourse) {
      throw new NotFoundError('Course not found');
    }
    
    // Check ownership
    const isOwner = user.id === existingCourse.instructorId;
    const isAdmin = user.roles?.includes('admin');
    
    if (!isOwner && !isAdmin) {
      throw new AuthorizationError('You can only delete your own courses');
    }
    
    const deleted = await CourseModel.delete(id);
    if (!deleted) {
      throw new NotFoundError('Course not found');
    }
    
    // Invalidate cache
    await CacheService.invalidateCourseCache(id);
    
    // Publish event
    await EventPublisher.publishCourseDeleted(id, existingCourse.instructorId, {
      title: existingCourse.title,
    });
    
    return {
      success: true,
      message: 'Course deleted successfully',
    };
  });

  // Get instructor's courses
  fastify.get('/instructor/:instructorId', {
    schema: {
      tags: ['Courses'],
      summary: 'Get courses by instructor',
      params: {
        type: 'object',
        properties: {
          instructorId: { type: 'string', format: 'uuid' },
        },
        required: ['instructorId'],
      },
      querystring: CourseQuerySchema,
      response: {
        200: PaginatedCoursesSchema,
      },
    },
    preHandler: [optionalAuth],
  }, async (request, reply) => {
    const { instructorId } = request.params as { instructorId: string };
    const query = request.query as any;
    
    // If not the instructor themselves or admin, only show published courses
    if (!request.user || (request.user.id !== instructorId && !request.user.roles?.includes('admin'))) {
      query.status = 'published';
    }
    
    const { courses, total } = await CourseModel.findByInstructor(instructorId, query);
    
    const page = query.page || 1;
    const limit = query.limit || 20;
    const totalPages = Math.ceil(total / limit);
    
    return {
      courses,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  });
};
