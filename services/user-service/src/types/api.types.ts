import { Type, Static } from '@sinclair/typebox';

// Generic API Response
export const ApiResponse = <T>(dataSchema: T) => Type.Object({
  success: Type.Boolean(),
  data: Type.Optional(dataSchema),
  message: Type.Optional(Type.String()),
  timestamp: Type.String({ format: 'date-time' }),
});

// Error Response
export const ErrorResponse = Type.Object({
  success: Type.Literal(false),
  error: Type.String(),
  message: Type.Optional(Type.String()),
  details: Type.Optional(Type.Any()),
  timestamp: Type.String({ format: 'date-time' }),
  requestId: Type.Optional(Type.String()),
});

// Health Check Response
export const HealthCheckResponse = Type.Object({
  status: Type.Union([Type.Literal('healthy'), Type.Literal('unhealthy')]),
  timestamp: Type.String({ format: 'date-time' }),
  uptime: Type.Number(),
  version: Type.String(),
  services: Type.Object({
    database: Type.Object({
      status: Type.Union([Type.Literal('connected'), Type.Literal('disconnected')]),
      responseTime: Type.Optional(Type.Number()),
    }),
    redis: Type.Object({
      status: Type.Union([Type.Literal('connected'), Type.Literal('disconnected')]),
      responseTime: Type.Optional(Type.Number()),
    }),
    rabbitmq: Type.Object({
      status: Type.Union([Type.Literal('connected'), Type.Literal('disconnected')]),
      responseTime: Type.Optional(Type.Number()),
    }),
  }),
});

// Metrics Response
export const MetricsResponse = Type.Object({
  users: Type.Object({
    total: Type.Number(),
    active: Type.Number(),
    inactive: Type.Number(),
    suspended: Type.Number(),
    byRole: Type.Object({
      admin: Type.Number(),
      instructor: Type.Number(),
      student: Type.Number(),
    }),
  }),
  enrollments: Type.Object({
    total: Type.Number(),
    active: Type.Number(),
    completed: Type.Number(),
    dropped: Type.Number(),
  }),
  activity: Type.Object({
    dailyActiveUsers: Type.Number(),
    weeklyActiveUsers: Type.Number(),
    monthlyActiveUsers: Type.Number(),
  }),
  performance: Type.Object({
    averageResponseTime: Type.Number(),
    requestsPerSecond: Type.Number(),
    errorRate: Type.Number(),
  }),
});

// JWT Payload
export const JwtPayload = Type.Object({
  sub: Type.String({ format: 'uuid' }), // user ID
  authId: Type.String({ format: 'uuid' }),
  email: Type.String({ format: 'email' }),
  role: Type.Union([
    Type.Literal('admin'),
    Type.Literal('instructor'),
    Type.Literal('student'),
  ]),
  iat: Type.Number(),
  exp: Type.Number(),
  iss: Type.Optional(Type.String()),
  aud: Type.Optional(Type.String()),
});

// Request Context
export const RequestContext = Type.Object({
  user: Type.Optional(Type.Object({
    id: Type.String({ format: 'uuid' }),
    authId: Type.String({ format: 'uuid' }),
    email: Type.String({ format: 'email' }),
    role: Type.Union([
      Type.Literal('admin'),
      Type.Literal('instructor'),
      Type.Literal('student'),
    ]),
  })),
  requestId: Type.String(),
  timestamp: Type.String({ format: 'date-time' }),
  ip: Type.Optional(Type.String()),
  userAgent: Type.Optional(Type.String()),
});

// Pagination Query Parameters
export const PaginationQuery = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  sortBy: Type.Optional(Type.String()),
  sortOrder: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')])),
});

// Search Query Parameters
export const SearchQuery = Type.Intersect([
  PaginationQuery,
  Type.Object({
    search: Type.Optional(Type.String({ minLength: 1 })),
    filters: Type.Optional(Type.Record(Type.String(), Type.Any())),
  }),
]);

// File Upload Response
export const FileUploadResponse = Type.Object({
  filename: Type.String(),
  originalName: Type.String(),
  mimetype: Type.String(),
  size: Type.Number(),
  url: Type.String({ format: 'uri' }),
  uploadedAt: Type.String({ format: 'date-time' }),
});

// Bulk Operation Response
export const BulkOperationResponse = Type.Object({
  total: Type.Number(),
  successful: Type.Number(),
  failed: Type.Number(),
  errors: Type.Optional(Type.Array(Type.Object({
    id: Type.String(),
    error: Type.String(),
  }))),
});

// Rate Limit Headers
export const RateLimitHeaders = Type.Object({
  'x-ratelimit-limit': Type.Number(),
  'x-ratelimit-remaining': Type.Number(),
  'x-ratelimit-reset': Type.Number(),
});

// Cache Headers
export const CacheHeaders = Type.Object({
  'cache-control': Type.Optional(Type.String()),
  'etag': Type.Optional(Type.String()),
  'last-modified': Type.Optional(Type.String()),
});

// CORS Headers
export const CorsHeaders = Type.Object({
  'access-control-allow-origin': Type.String(),
  'access-control-allow-methods': Type.String(),
  'access-control-allow-headers': Type.String(),
  'access-control-allow-credentials': Type.Boolean(),
});

// Service Status
export const ServiceStatus = Type.Object({
  name: Type.String(),
  version: Type.String(),
  status: Type.Union([Type.Literal('healthy'), Type.Literal('unhealthy')]),
  uptime: Type.Number(),
  timestamp: Type.String({ format: 'date-time' }),
  dependencies: Type.Array(Type.Object({
    name: Type.String(),
    status: Type.Union([Type.Literal('healthy'), Type.Literal('unhealthy')]),
    responseTime: Type.Optional(Type.Number()),
    lastChecked: Type.String({ format: 'date-time' }),
  })),
});

// Audit Log Entry
export const AuditLogEntry = Type.Object({
  id: Type.String({ format: 'uuid' }),
  userId: Type.Optional(Type.String({ format: 'uuid' })),
  action: Type.String(),
  resource: Type.String(),
  resourceId: Type.Optional(Type.String()),
  changes: Type.Optional(Type.Any()),
  metadata: Type.Optional(Type.Any()),
  ip: Type.Optional(Type.String()),
  userAgent: Type.Optional(Type.String()),
  timestamp: Type.String({ format: 'date-time' }),
});

// Event Message
export const EventMessage = Type.Object({
  id: Type.String({ format: 'uuid' }),
  type: Type.String(),
  source: Type.String(),
  data: Type.Any(),
  timestamp: Type.String({ format: 'date-time' }),
  version: Type.Optional(Type.String()),
  correlationId: Type.Optional(Type.String()),
  metadata: Type.Optional(Type.Any()),
});

// External Service Response
export const ExternalServiceResponse = Type.Object({
  success: Type.Boolean(),
  data: Type.Optional(Type.Any()),
  error: Type.Optional(Type.String()),
  statusCode: Type.Number(),
  headers: Type.Optional(Type.Record(Type.String(), Type.String())),
  responseTime: Type.Number(),
});

// Type exports
export type ApiResponseType<T> = {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
};

export type ErrorResponseType = Static<typeof ErrorResponse>;
export type HealthCheckResponseType = Static<typeof HealthCheckResponse>;
export type MetricsResponseType = Static<typeof MetricsResponse>;
export type JwtPayloadType = Static<typeof JwtPayload>;
export type RequestContextType = Static<typeof RequestContext>;
export type PaginationQueryType = Static<typeof PaginationQuery>;
export type SearchQueryType = Static<typeof SearchQuery>;
export type FileUploadResponseType = Static<typeof FileUploadResponse>;
export type BulkOperationResponseType = Static<typeof BulkOperationResponse>;
export type ServiceStatusType = Static<typeof ServiceStatus>;
export type AuditLogEntryType = Static<typeof AuditLogEntry>;
export type EventMessageType = Static<typeof EventMessage>;
export type ExternalServiceResponseType = Static<typeof ExternalServiceResponse>;

// HTTP Status Codes
export enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
}

// Error Codes
export enum ErrorCode {
  // User Errors
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS = 'USER_ALREADY_EXISTS',
  INVALID_USER_DATA = 'INVALID_USER_DATA',
  USER_INACTIVE = 'USER_INACTIVE',
  USER_SUSPENDED = 'USER_SUSPENDED',
  
  // Authentication Errors
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  
  // Enrollment Errors
  ENROLLMENT_NOT_FOUND = 'ENROLLMENT_NOT_FOUND',
  ALREADY_ENROLLED = 'ALREADY_ENROLLED',
  ENROLLMENT_LIMIT_REACHED = 'ENROLLMENT_LIMIT_REACHED',
  COURSE_NOT_AVAILABLE = 'COURSE_NOT_AVAILABLE',
  
  // Preference Errors
  PREFERENCE_NOT_FOUND = 'PREFERENCE_NOT_FOUND',
  INVALID_PREFERENCE_VALUE = 'INVALID_PREFERENCE_VALUE',
  
  // Validation Errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',
  VALUE_OUT_OF_RANGE = 'VALUE_OUT_OF_RANGE',
  
  // System Errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // File Upload Errors
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
}

// Success Messages
export enum SuccessMessage {
  USER_CREATED = 'User created successfully',
  USER_UPDATED = 'User updated successfully',
  USER_DELETED = 'User deleted successfully',
  ENROLLMENT_CREATED = 'Enrollment created successfully',
  ENROLLMENT_UPDATED = 'Enrollment updated successfully',
  ENROLLMENT_DELETED = 'Enrollment deleted successfully',
  PREFERENCES_UPDATED = 'Preferences updated successfully',
  ROLE_UPDATED = 'User role updated successfully',
  FILE_UPLOADED = 'File uploaded successfully',
}

// Custom Error Classes
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number = HttpStatusCode.INTERNAL_SERVER_ERROR,
    code: ErrorCode = ErrorCode.DATABASE_ERROR,
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, HttpStatusCode.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, true, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with ID ${id} not found` : `${resource} not found`;
    super(message, HttpStatusCode.NOT_FOUND, ErrorCode.USER_NOT_FOUND, true);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, HttpStatusCode.CONFLICT, ErrorCode.USER_ALREADY_EXISTS, true, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized access') {
    super(message, HttpStatusCode.UNAUTHORIZED, ErrorCode.UNAUTHORIZED_ACCESS, true);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, HttpStatusCode.FORBIDDEN, ErrorCode.INSUFFICIENT_PERMISSIONS, true);
  }
}
