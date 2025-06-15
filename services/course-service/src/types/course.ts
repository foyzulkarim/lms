import { Type, Static } from '@sinclair/typebox';

// Enums
export const CourseStatusSchema = Type.Union([
  Type.Literal('draft'),
  Type.Literal('published'),
  Type.Literal('archived'),
]);

export const CourseDifficultySchema = Type.Union([
  Type.Literal('beginner'),
  Type.Literal('intermediate'),
  Type.Literal('advanced'),
]);

export const LessonTypeSchema = Type.Union([
  Type.Literal('video'),
  Type.Literal('text'),
  Type.Literal('quiz'),
  Type.Literal('assignment'),
  Type.Literal('interactive'),
]);

export const ContentTypeSchema = Type.Union([
  Type.Literal('markdown'),
  Type.Literal('html'),
  Type.Literal('text'),
]);

// Course Types
export const CourseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  title: Type.String({ minLength: 1, maxLength: 200 }),
  slug: Type.String({ minLength: 1, maxLength: 250 }),
  description: Type.String({ maxLength: 1000 }),
  shortDescription: Type.Optional(Type.String({ maxLength: 300 })),
  thumbnailUrl: Type.Optional(Type.String({ format: 'uri' })),
  bannerUrl: Type.Optional(Type.String({ format: 'uri' })),
  status: CourseStatusSchema,
  difficulty: CourseDifficultySchema,
  estimatedDuration: Type.Number({ minimum: 0 }), // in minutes
  price: Type.Number({ minimum: 0 }),
  currency: Type.String({ default: 'USD' }),
  language: Type.String({ default: 'en' }),
  tags: Type.Array(Type.String()),
  categories: Type.Array(Type.String()),
  prerequisites: Type.Array(Type.String()),
  learningObjectives: Type.Array(Type.String()),
  instructorId: Type.String({ format: 'uuid' }),
  instructorName: Type.String(),
  instructorEmail: Type.String({ format: 'email' }),
  enrollmentCount: Type.Number({ minimum: 0, default: 0 }),
  rating: Type.Number({ minimum: 0, maximum: 5, default: 0 }),
  reviewCount: Type.Number({ minimum: 0, default: 0 }),
  isPublic: Type.Boolean({ default: true }),
  allowEnrollment: Type.Boolean({ default: true }),
  certificateEnabled: Type.Boolean({ default: false }),
  publishedAt: Type.Optional(Type.String({ format: 'date-time' })),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
});

export const CreateCourseSchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.String({ maxLength: 1000 }),
  shortDescription: Type.Optional(Type.String({ maxLength: 300 })),
  difficulty: CourseDifficultySchema,
  estimatedDuration: Type.Number({ minimum: 0 }),
  price: Type.Number({ minimum: 0 }),
  currency: Type.Optional(Type.String({ default: 'USD' })),
  language: Type.Optional(Type.String({ default: 'en' })),
  tags: Type.Optional(Type.Array(Type.String())),
  categories: Type.Optional(Type.Array(Type.String())),
  prerequisites: Type.Optional(Type.Array(Type.String())),
  learningObjectives: Type.Optional(Type.Array(Type.String())),
  isPublic: Type.Optional(Type.Boolean({ default: true })),
  allowEnrollment: Type.Optional(Type.Boolean({ default: true })),
  certificateEnabled: Type.Optional(Type.Boolean({ default: false })),
});

export const UpdateCourseSchema = Type.Partial(CreateCourseSchema);

// Module Types
export const ModuleSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  courseId: Type.String({ format: 'uuid' }),
  title: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.String({ maxLength: 1000 })),
  orderIndex: Type.Number({ minimum: 0 }),
  estimatedDuration: Type.Number({ minimum: 0 }), // in minutes
  isPublished: Type.Boolean({ default: false }),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
});

export const CreateModuleSchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.String({ maxLength: 1000 })),
  orderIndex: Type.Optional(Type.Number({ minimum: 0 })),
});

export const UpdateModuleSchema = Type.Partial(CreateModuleSchema);

// Lesson Types
export const LessonSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  moduleId: Type.String({ format: 'uuid' }),
  courseId: Type.String({ format: 'uuid' }),
  title: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.String({ maxLength: 1000 })),
  type: LessonTypeSchema,
  content: Type.Optional(Type.String()),
  contentType: Type.Optional(ContentTypeSchema),
  videoUrl: Type.Optional(Type.String({ format: 'uri' })),
  videoDuration: Type.Optional(Type.Number({ minimum: 0 })),
  attachments: Type.Optional(Type.Array(Type.String({ format: 'uri' }))),
  orderIndex: Type.Number({ minimum: 0 }),
  estimatedDuration: Type.Number({ minimum: 0 }), // in minutes
  isPublished: Type.Boolean({ default: false }),
  isFree: Type.Boolean({ default: false }),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
});

export const CreateLessonSchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.String({ maxLength: 1000 })),
  type: LessonTypeSchema,
  content: Type.Optional(Type.String()),
  contentType: Type.Optional(ContentTypeSchema),
  videoUrl: Type.Optional(Type.String({ format: 'uri' })),
  videoDuration: Type.Optional(Type.Number({ minimum: 0 })),
  attachments: Type.Optional(Type.Array(Type.String({ format: 'uri' }))),
  orderIndex: Type.Optional(Type.Number({ minimum: 0 })),
  estimatedDuration: Type.Number({ minimum: 0 }),
  isFree: Type.Optional(Type.Boolean({ default: false })),
});

export const UpdateLessonSchema = Type.Partial(CreateLessonSchema);

// Course with nested data
export const CourseWithModulesSchema = Type.Intersect([
  CourseSchema,
  Type.Object({
    modules: Type.Array(Type.Intersect([
      ModuleSchema,
      Type.Object({
        lessons: Type.Array(LessonSchema),
      }),
    ])),
  }),
]);

// Enrollment Types
export const EnrollmentSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  courseId: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
  enrolledAt: Type.String({ format: 'date-time' }),
  completedAt: Type.Optional(Type.String({ format: 'date-time' })),
  progress: Type.Number({ minimum: 0, maximum: 100, default: 0 }),
  lastAccessedAt: Type.Optional(Type.String({ format: 'date-time' })),
  certificateIssued: Type.Boolean({ default: false }),
  certificateIssuedAt: Type.Optional(Type.String({ format: 'date-time' })),
});

export const CreateEnrollmentSchema = Type.Object({
  courseId: Type.String({ format: 'uuid' }),
});

// Progress Types
export const LessonProgressSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
  courseId: Type.String({ format: 'uuid' }),
  moduleId: Type.String({ format: 'uuid' }),
  lessonId: Type.String({ format: 'uuid' }),
  isCompleted: Type.Boolean({ default: false }),
  completedAt: Type.Optional(Type.String({ format: 'date-time' })),
  timeSpent: Type.Number({ minimum: 0, default: 0 }), // in seconds
  lastPosition: Type.Optional(Type.Number({ minimum: 0 })), // for video lessons
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
});

export const UpdateLessonProgressSchema = Type.Object({
  isCompleted: Type.Optional(Type.Boolean()),
  timeSpent: Type.Optional(Type.Number({ minimum: 0 })),
  lastPosition: Type.Optional(Type.Number({ minimum: 0 })),
});

// Review Types
export const ReviewSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  courseId: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
  userName: Type.String(),
  rating: Type.Number({ minimum: 1, maximum: 5 }),
  comment: Type.Optional(Type.String({ maxLength: 1000 })),
  isPublic: Type.Boolean({ default: true }),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
});

export const CreateReviewSchema = Type.Object({
  rating: Type.Number({ minimum: 1, maximum: 5 }),
  comment: Type.Optional(Type.String({ maxLength: 1000 })),
  isPublic: Type.Optional(Type.Boolean({ default: true })),
});

export const UpdateReviewSchema = Type.Partial(CreateReviewSchema);

// Query Types
export const CourseQuerySchema = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  search: Type.Optional(Type.String()),
  category: Type.Optional(Type.String()),
  difficulty: Type.Optional(CourseDifficultySchema),
  status: Type.Optional(CourseStatusSchema),
  instructorId: Type.Optional(Type.String({ format: 'uuid' })),
  tags: Type.Optional(Type.String()), // comma-separated
  minPrice: Type.Optional(Type.Number({ minimum: 0 })),
  maxPrice: Type.Optional(Type.Number({ minimum: 0 })),
  sortBy: Type.Optional(Type.Union([
    Type.Literal('title'),
    Type.Literal('createdAt'),
    Type.Literal('updatedAt'),
    Type.Literal('rating'),
    Type.Literal('enrollmentCount'),
    Type.Literal('price'),
  ])),
  sortOrder: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')])),
});

// Response Types
export const PaginatedCoursesSchema = Type.Object({
  courses: Type.Array(CourseSchema),
  pagination: Type.Object({
    page: Type.Number(),
    limit: Type.Number(),
    total: Type.Number(),
    totalPages: Type.Number(),
    hasNext: Type.Boolean(),
    hasPrev: Type.Boolean(),
  }),
});

export const ErrorResponseSchema = Type.Object({
  error: Type.String(),
  message: Type.String(),
  statusCode: Type.Number(),
  correlationId: Type.Optional(Type.String()),
});

export const SuccessResponseSchema = Type.Object({
  success: Type.Boolean(),
  message: Type.String(),
});

// Type exports
export type Course = Static<typeof CourseSchema>;
export type CreateCourse = Static<typeof CreateCourseSchema>;
export type UpdateCourse = Static<typeof UpdateCourseSchema>;
export type CourseStatus = Static<typeof CourseStatusSchema>;
export type CourseDifficulty = Static<typeof CourseDifficultySchema>;

export type Module = Static<typeof ModuleSchema>;
export type CreateModule = Static<typeof CreateModuleSchema>;
export type UpdateModule = Static<typeof UpdateModuleSchema>;

export type Lesson = Static<typeof LessonSchema>;
export type CreateLesson = Static<typeof CreateLessonSchema>;
export type UpdateLesson = Static<typeof UpdateLessonSchema>;
export type LessonType = Static<typeof LessonTypeSchema>;
export type ContentType = Static<typeof ContentTypeSchema>;

export type CourseWithModules = Static<typeof CourseWithModulesSchema>;

export type Enrollment = Static<typeof EnrollmentSchema>;
export type CreateEnrollment = Static<typeof CreateEnrollmentSchema>;

export type LessonProgress = Static<typeof LessonProgressSchema>;
export type UpdateLessonProgress = Static<typeof UpdateLessonProgressSchema>;

export type Review = Static<typeof ReviewSchema>;
export type CreateReview = Static<typeof CreateReviewSchema>;
export type UpdateReview = Static<typeof UpdateReviewSchema>;

export type CourseQuery = Static<typeof CourseQuerySchema>;
export type PaginatedCourses = Static<typeof PaginatedCoursesSchema>;

export type ErrorResponse = Static<typeof ErrorResponseSchema>;
export type SuccessResponse = Static<typeof SuccessResponseSchema>;
