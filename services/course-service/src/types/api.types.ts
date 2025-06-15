// API-related type definitions

// Common API response structure
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}

// Paginated API response
export interface PaginatedApiResponse<T = any> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  links?: {
    first?: string;
    prev?: string;
    next?: string;
    last?: string;
  };
}

// Error response
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    stack?: string; // Only in development
  };
  meta: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}

// Health check response
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: {
      status: 'connected' | 'disconnected';
      responseTime?: number;
    };
    redis: {
      status: 'connected' | 'disconnected';
      responseTime?: number;
    };
    rabbitmq: {
      status: 'connected' | 'disconnected';
      responseTime?: number;
    };
  };
  metrics?: {
    memoryUsage: {
      used: number;
      total: number;
      percentage: number;
    };
    cpuUsage: number;
  };
}

// Request context
export interface RequestContext {
  requestId: string;
  userId?: string;
  userRole?: string;
  timestamp: Date;
  ip: string;
  userAgent: string;
}

// Authentication context
export interface AuthContext {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
  sessionId?: string;
}

// Query parameters for course listing
export interface CourseListQuery {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  level?: string;
  language?: string;
  isFree?: boolean;
  minRating?: number;
  tags?: string;
  instructor?: string;
  status?: string;
  visibility?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Query parameters for lesson listing
export interface LessonListQuery {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
  isPublished?: boolean;
  isPreview?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// File upload response
export interface FileUploadResponse {
  fileId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
  };
}

// Bulk operation request
export interface BulkOperationRequest<T = any> {
  operation: 'create' | 'update' | 'delete';
  items: T[];
  options?: {
    skipValidation?: boolean;
    continueOnError?: boolean;
  };
}

// Bulk operation response
export interface BulkOperationResponse {
  successful: number;
  failed: number;
  total: number;
  results: Array<{
    id?: string;
    success: boolean;
    error?: string;
  }>;
  summary: {
    duration: number;
    startedAt: string;
    completedAt: string;
  };
}

// Search request
export interface SearchRequest {
  query: string;
  filters?: {
    category?: string[];
    level?: string[];
    language?: string[];
    tags?: string[];
    priceRange?: {
      min?: number;
      max?: number;
    };
    rating?: {
      min?: number;
    };
  };
  sort?: {
    field: string;
    order: 'asc' | 'desc';
  };
  pagination?: {
    page: number;
    limit: number;
  };
}

// Search response
export interface SearchResponse<T = any> {
  results: T[];
  total: number;
  took: number; // Search time in milliseconds
  facets?: {
    categories: Array<{ name: string; count: number }>;
    levels: Array<{ name: string; count: number }>;
    languages: Array<{ name: string; count: number }>;
    tags: Array<{ name: string; count: number }>;
  };
  suggestions?: string[];
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Analytics request
export interface AnalyticsRequest {
  courseId?: string;
  instructorId?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  metrics?: string[];
  groupBy?: 'day' | 'week' | 'month';
}

// Analytics response
export interface AnalyticsResponse {
  metrics: {
    [key: string]: number | string;
  };
  timeSeries?: Array<{
    date: string;
    value: number;
  }>;
  breakdown?: {
    [key: string]: number;
  };
  summary: {
    period: string;
    totalDataPoints: number;
    generatedAt: string;
  };
}

// Export request
export interface ExportRequest {
  format: 'json' | 'csv' | 'xlsx' | 'pdf';
  filters?: {
    courseIds?: string[];
    dateRange?: {
      start: string;
      end: string;
    };
  };
  options?: {
    includeContent?: boolean;
    includeAnalytics?: boolean;
    includeProgress?: boolean;
  };
}

// Export response
export interface ExportResponse {
  exportId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
  expiresAt?: string;
  metadata: {
    format: string;
    fileSize?: number;
    recordCount?: number;
    createdAt: string;
  };
}

// Import request
export interface ImportRequest {
  format: 'json' | 'csv' | 'xlsx';
  fileUrl: string;
  options?: {
    skipValidation?: boolean;
    updateExisting?: boolean;
    dryRun?: boolean;
  };
}

// Import response
export interface ImportResponse {
  importId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: {
    processed: number;
    total: number;
    percentage: number;
  };
  results?: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: Array<{
      row: number;
      field?: string;
      message: string;
    }>;
  };
  metadata: {
    format: string;
    startedAt: string;
    completedAt?: string;
  };
}

// Validation error details
export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

// Rate limiting response
export interface RateLimitResponse {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

// Cache control headers
export interface CacheControl {
  maxAge?: number;
  sMaxAge?: number;
  noCache?: boolean;
  noStore?: boolean;
  mustRevalidate?: boolean;
  etag?: string;
  lastModified?: string;
}

// WebSocket message types
export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: string;
  id: string;
}

// Real-time progress update
export interface ProgressUpdateMessage extends WebSocketMessage {
  type: 'progress.update';
  payload: {
    courseId: string;
    lessonId: string;
    userId: string;
    progress: number;
    timeSpent: number;
  };
}

// Real-time notification
export interface NotificationMessage extends WebSocketMessage {
  type: 'notification';
  payload: {
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    actionUrl?: string;
  };
}

// API versioning
export interface ApiVersion {
  version: string;
  deprecated?: boolean;
  deprecationDate?: string;
  supportedUntil?: string;
  migrationGuide?: string;
}

// Feature flags
export interface FeatureFlags {
  [key: string]: boolean | string | number;
}

// Service status
export interface ServiceStatus {
  name: string;
  version: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  uptime: number;
  lastHealthCheck: string;
  dependencies: Array<{
    name: string;
    status: 'healthy' | 'unhealthy';
    responseTime?: number;
  }>;
}

export default {
  ApiResponse,
  PaginatedApiResponse,
  ErrorResponse,
  HealthCheckResponse,
  RequestContext,
  AuthContext,
  CourseListQuery,
  LessonListQuery,
  FileUploadResponse,
  BulkOperationRequest,
  BulkOperationResponse,
  SearchRequest,
  SearchResponse,
  AnalyticsRequest,
  AnalyticsResponse,
  ExportRequest,
  ExportResponse,
  ImportRequest,
  ImportResponse,
  ValidationError,
  RateLimitResponse,
  CacheControl,
  WebSocketMessage,
  ProgressUpdateMessage,
  NotificationMessage,
  ApiVersion,
  FeatureFlags,
  ServiceStatus,
};
