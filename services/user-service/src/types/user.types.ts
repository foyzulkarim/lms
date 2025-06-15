import { Type, Static } from '@sinclair/typebox';

// Enums
export const UserRole = Type.Union([
  Type.Literal('admin'),
  Type.Literal('instructor'),
  Type.Literal('student'),
]);

export const UserStatus = Type.Union([
  Type.Literal('active'),
  Type.Literal('inactive'),
  Type.Literal('suspended'),
  Type.Literal('deleted'),
]);

export const EnrollmentStatus = Type.Union([
  Type.Literal('active'),
  Type.Literal('completed'),
  Type.Literal('dropped'),
  Type.Literal('suspended'),
]);

// Base User Schema
export const UserSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  authId: Type.String({ format: 'uuid' }),
  email: Type.String({ format: 'email' }),
  username: Type.Optional(Type.String({ minLength: 3, maxLength: 50 })),
  firstName: Type.String({ minLength: 1, maxLength: 100 }),
  lastName: Type.String({ minLength: 1, maxLength: 100 }),
  displayName: Type.Optional(Type.String({ maxLength: 200 })),
  avatarUrl: Type.Optional(Type.String({ format: 'uri' })),
  bio: Type.Optional(Type.String({ maxLength: 1000 })),
  phone: Type.Optional(Type.String({ maxLength: 20 })),
  timezone: Type.String({ default: 'UTC' }),
  language: Type.String({ default: 'en', maxLength: 10 }),
  role: UserRole,
  status: UserStatus,
  emailVerified: Type.Boolean({ default: false }),
  profileCompleted: Type.Boolean({ default: false }),
  lastActiveAt: Type.Optional(Type.String({ format: 'date-time' })),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
});

// Create User Schema (for registration)
export const CreateUserSchema = Type.Object({
  authId: Type.String({ format: 'uuid' }),
  email: Type.String({ format: 'email' }),
  username: Type.Optional(Type.String({ minLength: 3, maxLength: 50 })),
  firstName: Type.String({ minLength: 1, maxLength: 100 }),
  lastName: Type.String({ minLength: 1, maxLength: 100 }),
  displayName: Type.Optional(Type.String({ maxLength: 200 })),
  avatarUrl: Type.Optional(Type.String({ format: 'uri' })),
  bio: Type.Optional(Type.String({ maxLength: 1000 })),
  phone: Type.Optional(Type.String({ maxLength: 20 })),
  timezone: Type.Optional(Type.String({ default: 'UTC' })),
  language: Type.Optional(Type.String({ default: 'en', maxLength: 10 })),
  role: Type.Optional(UserRole),
});

// Update User Schema
export const UpdateUserSchema = Type.Object({
  username: Type.Optional(Type.String({ minLength: 3, maxLength: 50 })),
  firstName: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  lastName: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  displayName: Type.Optional(Type.String({ maxLength: 200 })),
  avatarUrl: Type.Optional(Type.String({ format: 'uri' })),
  bio: Type.Optional(Type.String({ maxLength: 1000 })),
  phone: Type.Optional(Type.String({ maxLength: 20 })),
  timezone: Type.Optional(Type.String()),
  language: Type.Optional(Type.String({ maxLength: 10 })),
});

// User Preference Schema
export const UserPreferenceSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
  category: Type.String({ minLength: 1, maxLength: 50 }),
  key: Type.String({ minLength: 1, maxLength: 100 }),
  value: Type.Any(),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
});

// Create/Update Preference Schema
export const UpsertPreferenceSchema = Type.Object({
  category: Type.String({ minLength: 1, maxLength: 50 }),
  key: Type.String({ minLength: 1, maxLength: 100 }),
  value: Type.Any(),
});

// User Enrollment Schema
export const UserEnrollmentSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
  courseId: Type.String({ format: 'uuid' }),
  enrollmentStatus: EnrollmentStatus,
  progress: Type.Number({ minimum: 0, maximum: 100 }),
  enrolledAt: Type.String({ format: 'date-time' }),
  completedAt: Type.Optional(Type.String({ format: 'date-time' })),
  lastAccessedAt: Type.Optional(Type.String({ format: 'date-time' })),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
});

// Create Enrollment Schema
export const CreateEnrollmentSchema = Type.Object({
  courseId: Type.String({ format: 'uuid' }),
});

// Update Enrollment Schema
export const UpdateEnrollmentSchema = Type.Object({
  enrollmentStatus: Type.Optional(EnrollmentStatus),
  progress: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
});

// User Session Schema
export const UserSessionSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
  sessionToken: Type.String(),
  deviceInfo: Type.Optional(Type.Any()),
  ipAddress: Type.Optional(Type.String()),
  userAgent: Type.Optional(Type.String()),
  isActive: Type.Boolean({ default: true }),
  expiresAt: Type.String({ format: 'date-time' }),
  createdAt: Type.String({ format: 'date-time' }),
  lastAccessedAt: Type.String({ format: 'date-time' }),
});

// Search and Filter Schemas
export const UserSearchSchema = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  search: Type.Optional(Type.String({ minLength: 1 })),
  role: Type.Optional(UserRole),
  status: Type.Optional(UserStatus),
  sortBy: Type.Optional(Type.Union([
    Type.Literal('createdAt'),
    Type.Literal('updatedAt'),
    Type.Literal('firstName'),
    Type.Literal('lastName'),
    Type.Literal('email'),
    Type.Literal('lastActiveAt'),
  ])),
  sortOrder: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')])),
});

// User Statistics Schema
export const UserStatsSchema = Type.Object({
  totalEnrollments: Type.Number(),
  activeEnrollments: Type.Number(),
  completedEnrollments: Type.Number(),
  totalProgress: Type.Number(),
  averageProgress: Type.Number(),
  lastLoginAt: Type.Optional(Type.String({ format: 'date-time' })),
  totalLoginCount: Type.Number(),
  profileCompletionPercentage: Type.Number(),
});

// Enrollment Statistics Schema
export const EnrollmentStatsSchema = Type.Object({
  totalCourses: Type.Number(),
  activeCourses: Type.Number(),
  completedCourses: Type.Number(),
  droppedCourses: Type.Number(),
  averageProgress: Type.Number(),
  totalTimeSpent: Type.Number(),
  lastAccessedCourse: Type.Optional(Type.String({ format: 'uuid' })),
  lastAccessedAt: Type.Optional(Type.String({ format: 'date-time' })),
});

// Pagination Schema
export const PaginationSchema = Type.Object({
  page: Type.Number({ minimum: 1 }),
  limit: Type.Number({ minimum: 1, maximum: 100 }),
  total: Type.Number({ minimum: 0 }),
  totalPages: Type.Number({ minimum: 0 }),
  hasNext: Type.Boolean(),
  hasPrev: Type.Boolean(),
});

// Paginated Response Schema
export const PaginatedResponseSchema = <T>(itemSchema: T) => Type.Object({
  data: Type.Array(itemSchema),
  pagination: PaginationSchema,
});

// Role Update Schema
export const UpdateRoleSchema = Type.Object({
  role: UserRole,
});

// Bulk Role Update Schema
export const BulkUpdateRoleSchema = Type.Object({
  userIds: Type.Array(Type.String({ format: 'uuid' })),
  role: UserRole,
});

// API Response Schemas
export const ApiResponseSchema = <T>(dataSchema: T) => Type.Object({
  success: Type.Boolean(),
  data: Type.Optional(dataSchema),
  message: Type.Optional(Type.String()),
  error: Type.Optional(Type.String()),
  timestamp: Type.String({ format: 'date-time' }),
});

export const ErrorResponseSchema = Type.Object({
  success: Type.Literal(false),
  error: Type.String(),
  message: Type.Optional(Type.String()),
  details: Type.Optional(Type.Any()),
  timestamp: Type.String({ format: 'date-time' }),
});

// Type exports
export type User = Static<typeof UserSchema>;
export type CreateUser = Static<typeof CreateUserSchema>;
export type UpdateUser = Static<typeof UpdateUserSchema>;
export type UserPreference = Static<typeof UserPreferenceSchema>;
export type UpsertPreference = Static<typeof UpsertPreferenceSchema>;
export type UserEnrollment = Static<typeof UserEnrollmentSchema>;
export type CreateEnrollment = Static<typeof CreateEnrollmentSchema>;
export type UpdateEnrollment = Static<typeof UpdateEnrollmentSchema>;
export type UserSession = Static<typeof UserSessionSchema>;
export type UserSearch = Static<typeof UserSearchSchema>;
export type UserStats = Static<typeof UserStatsSchema>;
export type EnrollmentStats = Static<typeof EnrollmentStatsSchema>;
export type Pagination = Static<typeof PaginationSchema>;
export type UpdateRole = Static<typeof UpdateRoleSchema>;
export type BulkUpdateRole = Static<typeof BulkUpdateRoleSchema>;

export type UserRoleType = Static<typeof UserRole>;
export type UserStatusType = Static<typeof UserStatus>;
export type EnrollmentStatusType = Static<typeof EnrollmentStatus>;

// Utility types
export type PaginatedUsers = {
  data: User[];
  pagination: Pagination;
};

export type PaginatedEnrollments = {
  data: UserEnrollment[];
  pagination: Pagination;
};

export type PaginatedPreferences = {
  data: UserPreference[];
  pagination: Pagination;
};

// Event types for RabbitMQ
export interface UserEvent {
  type: 'user.created' | 'user.updated' | 'user.deleted' | 'user.role_changed' | 'user.status_changed';
  userId: string;
  data: Partial<User>;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface EnrollmentEvent {
  type: 'user.enrolled' | 'user.unenrolled' | 'user.progress_updated' | 'user.course_completed';
  userId: string;
  courseId: string;
  enrollmentId?: string;
  progress?: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AuthEvent {
  type: 'user.login' | 'user.logout' | 'user.registered' | 'user.password_changed';
  userId: string;
  authId: string;
  email: string;
  profile?: {
    firstName: string;
    lastName: string;
    avatarUrl?: string;
  };
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Database row types (snake_case)
export interface UserRow {
  id: string;
  auth_id: string;
  email: string;
  username?: string;
  first_name: string;
  last_name: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  phone?: string;
  timezone: string;
  language: string;
  role: UserRoleType;
  status: UserStatusType;
  email_verified: boolean;
  profile_completed: boolean;
  last_active_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface UserPreferenceRow {
  id: string;
  user_id: string;
  category: string;
  key: string;
  value: any;
  created_at: Date;
  updated_at: Date;
}

export interface UserEnrollmentRow {
  id: string;
  user_id: string;
  course_id: string;
  enrollment_status: EnrollmentStatusType;
  progress: number;
  enrolled_at: Date;
  completed_at?: Date;
  last_accessed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface UserSessionRow {
  id: string;
  user_id: string;
  session_token: string;
  device_info?: any;
  ip_address?: string;
  user_agent?: string;
  is_active: boolean;
  expires_at: Date;
  created_at: Date;
  last_accessed_at: Date;
}
