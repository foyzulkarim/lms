import { Static, Type } from '@sinclair/typebox';

// ============================================================================
// Core File Types
// ============================================================================

export enum FileStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
  DELETED = 'deleted'
}

export enum ProcessingJobType {
  VIRUS_SCAN = 'virus_scan',
  THUMBNAIL_GENERATION = 'thumbnail_generation',
  IMAGE_OPTIMIZATION = 'image_optimization',
  VIDEO_TRANSCODING = 'video_transcoding',
  HLS_GENERATION = 'hls_generation',
  DOCUMENT_PREVIEW = 'document_preview',
  METADATA_EXTRACTION = 'metadata_extraction'
}

export enum StorageBackend {
  LOCAL = 'local',
  MINIO = 'minio',
  S3 = 's3'
}

// ============================================================================
// File Metadata Interfaces
// ============================================================================

export interface FileMetadata {
  id: string;
  originalName: string;
  storagePath: string;
  publicUrl?: string;
  mimeType: string;
  size: number;
  checksum: string;
  
  // Ownership & Access
  uploadedBy: string;
  organizationId?: string;
  courseId?: string;
  permissions: FilePermissions;
  
  // Processing
  status: FileStatus;
  processingMetadata?: ProcessingMetadata;
  
  // Versioning
  version: number;
  parentId?: string;
  isLatest: boolean;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  expiresAt?: Date;
}

export interface FilePermissions {
  isPublic: boolean;
  allowedRoles: string[];
  allowedUsers: string[];
  requiresAuth: boolean;
}

export interface ProcessingMetadata {
  imageVariants?: ImageVariant[];
  videoVariants?: VideoVariant[];
  hlsPlaylist?: HLSPlaylist;
  documentPages?: number;
  thumbnailPath?: string;
  processingError?: string;
  processingSteps?: ProcessingStep[];
}

export interface ImageVariant {
  size: 'thumbnail' | 'small' | 'medium' | 'large';
  width: number;
  height: number;
  path: string;
  format: string;
  fileSize: number;
}

export interface VideoVariant {
  quality: '360p' | '720p' | '1080p';
  width: number;
  height: number;
  path: string;
  duration: number;
  bitrate: number;
  fileSize: number;
  codec: string;
}

export interface HLSPlaylist {
  masterPlaylistPath: string;
  variants: HLSVariant[];
  segmentDuration: number;
  totalDuration: number;
}

export interface HLSVariant {
  quality: string;
  bandwidth: number;
  resolution: string;
  playlistPath: string;
  segmentPaths: string[];
}

export interface ProcessingStep {
  step: ProcessingJobType;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  progress?: number;
}

// ============================================================================
// Storage Interfaces
// ============================================================================

export interface StorageProvider {
  upload(file: Buffer, path: string, options?: UploadOptions): Promise<StorageResult>;
  download(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  getMetadata(path: string): Promise<StorageMetadata>;
  generatePresignedUrl(path: string, expiresIn?: number): Promise<string>;
  listObjects(prefix?: string): Promise<StorageObject[]>;
}

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
  contentDisposition?: string;
}

export interface StorageResult {
  path: string;
  url?: string;
  etag?: string;
  size: number;
}

export interface StorageMetadata {
  size: number;
  lastModified: Date;
  contentType: string;
  etag: string;
  metadata?: Record<string, string>;
}

export interface StorageObject {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

// Upload Types
export const UploadRequestSchema = Type.Object({
  courseId: Type.Optional(Type.String()),
  permissions: Type.Optional(Type.Object({
    isPublic: Type.Boolean(),
    allowedRoles: Type.Array(Type.String()),
    allowedUsers: Type.Array(Type.String()),
    requiresAuth: Type.Boolean()
  })),
  isTemporary: Type.Optional(Type.Boolean()),
  expiresIn: Type.Optional(Type.Number())
});

export const FileResponseSchema = Type.Object({
  id: Type.String(),
  originalName: Type.String(),
  url: Type.String(),
  publicUrl: Type.Optional(Type.String()),
  mimeType: Type.String(),
  size: Type.Number(),
  status: Type.Enum(FileStatus),
  uploadedAt: Type.String(),
  processingMetadata: Type.Optional(Type.Object({
    imageVariants: Type.Optional(Type.Array(Type.Object({
      size: Type.String(),
      width: Type.Number(),
      height: Type.Number(),
      path: Type.String(),
      format: Type.String()
    }))),
    videoVariants: Type.Optional(Type.Array(Type.Object({
      quality: Type.String(),
      width: Type.Number(),
      height: Type.Number(),
      path: Type.String(),
      duration: Type.Number(),
      bitrate: Type.Number()
    }))),
    hlsPlaylist: Type.Optional(Type.Object({
      masterPlaylistPath: Type.String(),
      variants: Type.Array(Type.Object({
        quality: Type.String(),
        bandwidth: Type.Number(),
        resolution: Type.String(),
        playlistPath: Type.String()
      }))
    }))
  }))
});

export const BatchUploadResponseSchema = Type.Object({
  files: Type.Array(FileResponseSchema),
  batchId: Type.String()
});

// Chunked Upload Types
export const ChunkedUploadInitSchema = Type.Object({
  fileName: Type.String(),
  fileSize: Type.Number(),
  mimeType: Type.String(),
  chunkSize: Type.Number(),
  courseId: Type.Optional(Type.String())
});

export const ChunkedUploadInitResponseSchema = Type.Object({
  uploadId: Type.String(),
  chunkSize: Type.Number(),
  totalChunks: Type.Number(),
  expiresAt: Type.String()
});

export const ChunkUploadResponseSchema = Type.Object({
  chunkNumber: Type.Number(),
  uploaded: Type.Boolean(),
  checksum: Type.String()
});

export const CompleteChunkedUploadSchema = Type.Object({
  chunks: Type.Array(Type.Object({
    number: Type.Number(),
    checksum: Type.String()
  }))
});

// Query Types
export const FileListQuerySchema = Type.Object({
  courseId: Type.Optional(Type.String()),
  mimeType: Type.Optional(Type.String()),
  status: Type.Optional(Type.Enum(FileStatus)),
  uploadedBy: Type.Optional(Type.String()),
  page: Type.Optional(Type.Number({ minimum: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  sortBy: Type.Optional(Type.Union([
    Type.Literal('createdAt'),
    Type.Literal('size'),
    Type.Literal('name')
  ])),
  sortOrder: Type.Optional(Type.Union([
    Type.Literal('asc'),
    Type.Literal('desc')
  ]))
});

export const DownloadQuerySchema = Type.Object({
  variant: Type.Optional(Type.String()),
  quality: Type.Optional(Type.String()),
  inline: Type.Optional(Type.Boolean())
});

// Processing Types
export const ProcessingStatusResponseSchema = Type.Object({
  fileId: Type.String(),
  status: Type.Enum(FileStatus),
  progress: Type.Number(),
  estimatedTimeRemaining: Type.Optional(Type.Number()),
  processingSteps: Type.Array(Type.Object({
    step: Type.Enum(ProcessingJobType),
    status: Type.Union([
      Type.Literal('pending'),
      Type.Literal('in_progress'),
      Type.Literal('completed'),
      Type.Literal('failed')
    ]),
    startedAt: Type.Optional(Type.String()),
    completedAt: Type.Optional(Type.String()),
    error: Type.Optional(Type.String()),
    progress: Type.Optional(Type.Number())
  }))
});

// Admin Types
export const StorageStatsResponseSchema = Type.Object({
  totalFiles: Type.Number(),
  totalSize: Type.Number(),
  storageUsage: Type.Record(Type.String(), Type.Object({
    files: Type.Number(),
    size: Type.Number(),
    percentage: Type.Number()
  })),
  mimeTypeBreakdown: Type.Record(Type.String(), Type.Object({
    files: Type.Number(),
    size: Type.Number()
  }))
});

export const CleanupRequestSchema = Type.Object({
  dryRun: Type.Optional(Type.Boolean()),
  olderThan: Type.Optional(Type.String()),
  status: Type.Optional(Type.Array(Type.Enum(FileStatus)))
});

// ============================================================================
// Type Exports
// ============================================================================

export type UploadRequest = Static<typeof UploadRequestSchema>;
export type FileResponse = Static<typeof FileResponseSchema>;
export type BatchUploadResponse = Static<typeof BatchUploadResponseSchema>;
export type ChunkedUploadInit = Static<typeof ChunkedUploadInitSchema>;
export type ChunkedUploadInitResponse = Static<typeof ChunkedUploadInitResponseSchema>;
export type ChunkUploadResponse = Static<typeof ChunkUploadResponseSchema>;
export type CompleteChunkedUpload = Static<typeof CompleteChunkedUploadSchema>;
export type FileListQuery = Static<typeof FileListQuerySchema>;
export type DownloadQuery = Static<typeof DownloadQuerySchema>;
export type ProcessingStatusResponse = Static<typeof ProcessingStatusResponseSchema>;
export type StorageStatsResponse = Static<typeof StorageStatsResponseSchema>;
export type CleanupRequest = Static<typeof CleanupRequestSchema>;

// ============================================================================
// Event Types
// ============================================================================

export enum FileEventType {
  FILE_UPLOADED = 'file.uploaded',
  FILE_PROCESSING_STARTED = 'file.processing.started',
  FILE_PROCESSING_COMPLETED = 'file.processing.completed',
  FILE_PROCESSING_FAILED = 'file.processing.failed',
  FILE_DOWNLOADED = 'file.downloaded',
  FILE_DELETED = 'file.deleted',
  FILE_PERMISSION_CHANGED = 'file.permission.changed'
}

export interface FileEvent {
  eventType: FileEventType;
  fileId: string;
  userId: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

// ============================================================================
// Authentication Types
// ============================================================================

export interface AuthContext {
  userId: string;
  roles: string[];
  permissions: string[];
  organizationId?: string;
}

export interface JWTPayload {
  sub: string; // userId
  roles: string[];
  permissions: string[];
  organizationId?: string;
  iat: number;
  exp: number;
}

// ============================================================================
// Error Types
// ============================================================================

export class FileServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'FileServiceError';
  }
}

export class ValidationError extends FileServiceError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends FileServiceError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends FileServiceError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends FileServiceError {
  constructor(message: string = 'Resource not found') {
    super(message, 'NOT_FOUND_ERROR', 404);
    this.name = 'NotFoundError';
  }
}

export class StorageError extends FileServiceError {
  constructor(message: string, details?: any) {
    super(message, 'STORAGE_ERROR', 500, details);
    this.name = 'StorageError';
  }
}

export class ProcessingError extends FileServiceError {
  constructor(message: string, details?: any) {
    super(message, 'PROCESSING_ERROR', 500, details);
    this.name = 'ProcessingError';
  }
}

// ============================================================================
// Health Check Types
// ============================================================================

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  uptime: number;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
    storage: HealthCheck;
    queue: HealthCheck;
  };
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  responseTime?: number;
  error?: string;
  details?: any;
}

// ============================================================================
// Pagination Types
// ============================================================================

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CacheOptions {
  ttl?: number;
  tags?: string[];
}

export interface CacheResult<T> {
  data: T;
  cached: boolean;
  ttl?: number;
}
