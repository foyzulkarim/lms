# File Service Technical Specification

## 🎯 **Service Overview**

The File Service is a critical microservice in the LMS platform responsible for handling all file operations including upload, storage, processing, and delivery. It provides a secure, scalable, and performant solution for managing educational content assets.

### **Core Responsibilities**
- Secure file upload and download with authentication
- Multi-storage backend support (Local filesystem, MinIO, S3-compatible)
- Media processing (image optimization, video transcoding)
- File versioning and metadata management
- Access control and permission validation
- Virus scanning and content validation
- CDN integration for optimized delivery
- Audit logging for compliance

### **Service Characteristics**
- **Technology Stack:** Node.js + Fastify + TypeScript
- **Storage:** Pluggable storage backends (Local/MinIO/S3-compatible)
- **Processing:** Sharp (images), FFmpeg (videos)
- **Database:** PostgreSQL for metadata
- **Cache:** Redis for temporary data
- **Queue:** BullMQ for background processing

---

## 🏗️ **Architecture Design**

### **High-Level Architecture**
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   API Gateway   │────│   File Service   │────│  Storage Layer  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                    ┌─────────┼─────────┐
                    │         │         │
            ┌───────▼───┐ ┌──▼──┐ ┌────▼─────┐
            │Processing │ │Cache│ │Database  │
            │  Queue    │ │     │ │(Metadata)│
            └───────────┘ └─────┘ └──────────┘
```

### **Storage Architecture**
```typescript
interface StorageProvider {
  upload(file: FileBuffer, path: string): Promise<StorageResult>;
  download(path: string): Promise<FileBuffer>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  getMetadata(path: string): Promise<StorageMetadata>;
}
```

---

## 📊 **Data Models**

### **File Metadata Model**
```typescript
interface FileMetadata {
  id: string;                    // UUID
  originalName: string;          // Original filename
  storagePath: string;          // Internal storage path
  publicUrl?: string;           // CDN/public URL
  mimeType: string;             // Content type
  size: number;                 // File size in bytes
  checksum: string;             // SHA-256 hash
  
  // Ownership & Access
  uploadedBy: string;           // User ID
  organizationId?: string;      // Multi-tenant support
  courseId?: string;            // Associated course
  permissions: FilePermissions;
  
  // Processing
  status: FileStatus;           // pending | processing | ready | failed
  processingMetadata?: ProcessingMetadata;
  
  // Versioning
  version: number;              // Version number
  parentId?: string;            // Previous version
  isLatest: boolean;           // Latest version flag
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;            // Soft delete
  expiresAt?: Date;            // Temporary files
}

enum FileStatus {
  PENDING = 'pending',
  PROCESSING = 'processing', 
  READY = 'ready',
  FAILED = 'failed',
  DELETED = 'deleted'
}

interface FilePermissions {
  isPublic: boolean;
  allowedRoles: string[];
  allowedUsers: string[];
  requiresAuth: boolean;
}

interface ProcessingMetadata {
  imageVariants?: ImageVariant[];
  videoVariants?: VideoVariant[];
  documentPages?: number;
  thumbnailPath?: string;
  processingError?: string;
}

interface ImageVariant {
  size: 'thumbnail' | 'small' | 'medium' | 'large';
  width: number;
  height: number;
  path: string;
  format: string;
}

interface VideoVariant {
  quality: '360p' | '720p' | '1080p';
  width: number;
  height: number;
  path: string;
  duration: number;
  bitrate: number;
}
```

### **Database Schema**
```sql
-- Files table
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_name VARCHAR(255) NOT NULL,
    storage_path VARCHAR(500) NOT NULL UNIQUE,
    public_url VARCHAR(500),
    mime_type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    
    -- Ownership
    uploaded_by UUID NOT NULL,
    organization_id UUID,
    course_id UUID,
    
    -- Processing
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    processing_metadata JSONB,
    
    -- Versioning
    version INTEGER NOT NULL DEFAULT 1,
    parent_id UUID REFERENCES files(id),
    is_latest BOOLEAN NOT NULL DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX idx_files_course_id ON files(course_id);
CREATE INDEX idx_files_status ON files(status);
CREATE INDEX idx_files_created_at ON files(created_at);
CREATE INDEX idx_files_checksum ON files(checksum);

-- File permissions table
CREATE TABLE file_permissions (
    file_id UUID REFERENCES files(id) ON DELETE CASCADE,
    permission_type VARCHAR(20) NOT NULL, -- 'role' | 'user' | 'public'
    permission_value VARCHAR(100), -- role name or user id
    granted_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    PRIMARY KEY (file_id, permission_type, permission_value)
);

-- File access logs for audit
CREATE TABLE file_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES files(id),
    user_id UUID,
    action VARCHAR(20) NOT NULL, -- 'upload' | 'download' | 'delete' | 'view'
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_access_logs_file_id ON file_access_logs(file_id);
CREATE INDEX idx_access_logs_user_id ON file_access_logs(user_id);
CREATE INDEX idx_access_logs_created_at ON file_access_logs(created_at);
```

---

## 🔌 **API Specification**

### **Upload Endpoints**

#### **Single File Upload**
```http
POST /api/v1/files/upload
Content-Type: multipart/form-data
Authorization: Bearer <jwt-token>

Request Body:
- file: File (binary)
- courseId?: string
- permissions?: FilePermissions
- isTemporary?: boolean (default: false)
- expiresIn?: number (seconds, for temporary files)

Response: 201 Created
{
  "id": "uuid",
  "originalName": "document.pdf",
  "url": "/api/v1/files/uuid/download",
  "publicUrl": "https://cdn.example.com/uuid",
  "mimeType": "application/pdf",
  "size": 1024000,
  "status": "pending",
  "uploadedAt": "2024-01-01T00:00:00Z"
}
```

#### **Multiple File Upload**
```http
POST /api/v1/files/upload/batch
Content-Type: multipart/form-data
Authorization: Bearer <jwt-token>

Request Body:
- files: File[] (multiple files)
- courseId?: string
- permissions?: FilePermissions

Response: 201 Created
{
  "files": [
    {
      "id": "uuid1",
      "originalName": "image1.jpg",
      "status": "pending"
    },
    {
      "id": "uuid2", 
      "originalName": "image2.jpg",
      "status": "pending"
    }
  ],
  "batchId": "batch-uuid"
}
```

#### **Chunked Upload (Large Files)**
```http
// Initialize chunked upload
POST /api/v1/files/upload/chunked/init
{
  "fileName": "large-video.mp4",
  "fileSize": 1073741824,
  "mimeType": "video/mp4",
  "chunkSize": 1048576,
  "courseId": "course-uuid"
}

Response: 201 Created
{
  "uploadId": "upload-uuid",
  "chunkSize": 1048576,
  "totalChunks": 1024,
  "expiresAt": "2024-01-01T01:00:00Z"
}

// Upload chunk
PUT /api/v1/files/upload/chunked/{uploadId}/chunks/{chunkNumber}
Content-Type: application/octet-stream
Content-Length: 1048576

Response: 200 OK
{
  "chunkNumber": 1,
  "uploaded": true,
  "checksum": "sha256-hash"
}

// Complete chunked upload
POST /api/v1/files/upload/chunked/{uploadId}/complete
{
  "chunks": [
    {"number": 1, "checksum": "hash1"},
    {"number": 2, "checksum": "hash2"}
  ]
}
```

### **Download Endpoints**

#### **File Download**
```http
GET /api/v1/files/{fileId}/download
Authorization: Bearer <jwt-token> (optional for public files)

Query Parameters:
- variant?: string (thumbnail, small, medium, large for images)
- quality?: string (360p, 720p, 1080p for videos)
- inline?: boolean (default: true, false for attachment)

Response: 200 OK
Content-Type: <file-mime-type>
Content-Length: <file-size>
Content-Disposition: inline; filename="original-name.ext"
Cache-Control: public, max-age=31536000
ETag: "<file-checksum>"

<file-binary-data>
```

#### **Streaming Download (Large Files)**
```http
GET /api/v1/files/{fileId}/stream
Authorization: Bearer <jwt-token>
Range: bytes=0-1023 (optional)

Response: 206 Partial Content (if Range header present)
Content-Type: <file-mime-type>
Content-Range: bytes 0-1023/1048576
Accept-Ranges: bytes

<partial-file-data>
```

### **Management Endpoints**

#### **Get File Info**
```http
GET /api/v1/files/{fileId}
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "id": "uuid",
  "originalName": "document.pdf",
  "mimeType": "application/pdf",
  "size": 1024000,
  "checksum": "sha256-hash",
  "status": "ready",
  "uploadedBy": "user-uuid",
  "courseId": "course-uuid",
  "permissions": {
    "isPublic": false,
    "allowedRoles": ["instructor", "student"]
  },
  "processingMetadata": {
    "thumbnailPath": "/thumbnails/uuid.jpg"
  },
  "version": 1,
  "createdAt": "2024-01-01T00:00:00Z",
  "urls": {
    "download": "/api/v1/files/uuid/download",
    "thumbnail": "/api/v1/files/uuid/download?variant=thumbnail"
  }
}
```

#### **List Files**
```http
GET /api/v1/files
Authorization: Bearer <jwt-token>

Query Parameters:
- courseId?: string
- mimeType?: string
- status?: FileStatus
- uploadedBy?: string
- page?: number (default: 1)
- limit?: number (default: 20, max: 100)
- sortBy?: string (createdAt, size, name)
- sortOrder?: 'asc' | 'desc' (default: desc)

Response: 200 OK
{
  "files": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

#### **Update File Metadata**
```http
PATCH /api/v1/files/{fileId}
Authorization: Bearer <jwt-token>

Request Body:
{
  "originalName": "new-name.pdf",
  "courseId": "new-course-uuid",
  "permissions": {
    "isPublic": true,
    "allowedRoles": ["student"]
  }
}

Response: 200 OK
{
  "id": "uuid",
  "originalName": "new-name.pdf",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

#### **Delete File**
```http
DELETE /api/v1/files/{fileId}
Authorization: Bearer <jwt-token>

Query Parameters:
- force?: boolean (default: false, true for hard delete)

Response: 204 No Content
```

### **Processing Endpoints**

#### **Get Processing Status**
```http
GET /api/v1/files/{fileId}/processing
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "fileId": "uuid",
  "status": "processing",
  "progress": 75,
  "estimatedTimeRemaining": 30,
  "processingSteps": [
    {
      "step": "virus_scan",
      "status": "completed",
      "completedAt": "2024-01-01T00:00:30Z"
    },
    {
      "step": "thumbnail_generation", 
      "status": "in_progress",
      "startedAt": "2024-01-01T00:00:45Z"
    },
    {
      "step": "variant_generation",
      "status": "pending"
    }
  ]
}
```

#### **Retry Processing**
```http
POST /api/v1/files/{fileId}/processing/retry
Authorization: Bearer <jwt-token>

Response: 202 Accepted
{
  "message": "Processing retry initiated",
  "jobId": "job-uuid"
}
```

### **Admin Endpoints**

#### **Storage Stats**
```http
GET /api/v1/admin/storage/stats
Authorization: Bearer <admin-jwt-token>

Response: 200 OK
{
  "totalFiles": 10000,
  "totalSize": 1073741824000,
  "storageUsage": {
    "local": {
      "files": 5000,
      "size": 536870912000,
      "percentage": 50
    },
    "minio": {
      "files": 5000,
      "size": 536870912000,
      "percentage": 50
    }
  },
  "mimeTypeBreakdown": {
    "image/jpeg": {"files": 3000, "size": 321523654000},
    "video/mp4": {"files": 1000, "size": 752147436000}
  }
}
```

#### **Cleanup Expired Files**
```http
POST /api/v1/admin/files/cleanup
Authorization: Bearer <admin-jwt-token>

Request Body:
{
  "dryRun": true,
  "olderThan": "2024-01-01T00:00:00Z",
  "status": ["deleted", "failed"]
}

Response: 200 OK
{
  "filesFound": 150,
  "filesDeleted": 0, // 0 for dry run
  "spaceFreed": 1073741824,
  "details": [
    {
      "fileId": "uuid",
      "originalName": "old-file.pdf",
      "size": 1024000,
      "reason": "expired"
    }
  ]
}
```

---

## 🛡️ **Security Requirements**

### **Authentication & Authorization**
```typescript
// JWT token validation middleware
interface AuthContext {
  userId: string;
  roles: string[];
  permissions: string[];
  organizationId?: string;
}

// Permission validation
class FilePermissionService {
  async canAccess(fileId: string, context: AuthContext, action: 'read' | 'write' | 'delete'): Promise<boolean> {
    // Check file permissions against user context
  }
  
  async canUpload(courseId: string, context: AuthContext): Promise<boolean> {
    // Check course upload permissions
  }
}
```

### **File Validation**
```typescript
interface FileValidationConfig {
  maxFileSize: number;              // 100MB default
  allowedMimeTypes: string[];       // Whitelist approach
  blockedExtensions: string[];      // Additional security
  virusScanEnabled: boolean;        // ClamAV integration
  contentTypeValidation: boolean;   // Validate actual content vs extension
}

class FileValidator {
  async validateFile(file: FileBuffer, config: FileValidationConfig): Promise<ValidationResult> {
    // Size validation
    // MIME type validation
    // Content type validation
    // Virus scanning
    // Malware detection
  }
}
```

### **Access Control**
```typescript
// Rate limiting per user
const uploadRateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // requests per window
  message: 'Too many upload requests'
};

// File size limits by role
const fileSizeLimits = {
  student: 10 * 1024 * 1024,    // 10MB
  instructor: 100 * 1024 * 1024, // 100MB
  admin: 1024 * 1024 * 1024     // 1GB
};
```

---

## ⚡ **Performance Requirements**

### **Response Time Targets**
- File upload initiation: < 200ms
- Small file upload (< 1MB): < 2 seconds
- Large file upload (100MB): < 60 seconds
- File download: < 100ms (first byte)
- Metadata queries: < 50ms

### **Throughput Targets**
- Concurrent uploads: 100 simultaneous
- Download bandwidth: 1GB/s aggregate
- Processing queue: 1000 jobs/minute
- Database queries: 1000 QPS

### **Caching Strategy**
```typescript
// Redis cache configuration
const cacheConfig = {
  fileMetadata: {
    ttl: 3600, // 1 hour
    key: 'file:metadata:{fileId}'
  },
  downloadUrls: {
    ttl: 1800, // 30 minutes
    key: 'file:url:{fileId}:{variant}'
  },
  permissions: {
    ttl: 900, // 15 minutes
    key: 'file:perms:{fileId}:{userId}'
  }
};
```

---

## 🔄 **Event Integration**

### **Published Events**
```typescript
// File lifecycle events
interface FileEvent {
  eventType: string;
  fileId: string;
  userId: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

// Event types
enum FileEventType {
  FILE_UPLOADED = 'file.uploaded',
  FILE_PROCESSING_STARTED = 'file.processing.started',
  FILE_PROCESSING_COMPLETED = 'file.processing.completed',
  FILE_PROCESSING_FAILED = 'file.processing.failed',
  FILE_DOWNLOADED = 'file.downloaded',
  FILE_DELETED = 'file.deleted',
  FILE_PERMISSION_CHANGED = 'file.permission.changed'
}

// Event publishing
class FileEventPublisher {
  async publishFileUploaded(fileId: string, metadata: FileMetadata): Promise<void> {
    await this.eventBus.publish('file.uploaded', {
      fileId,
      originalName: metadata.originalName,
      mimeType: metadata.mimeType,
      size: metadata.size,
      uploadedBy: metadata.uploadedBy,
      courseId: metadata.courseId
    });
  }
}
```

### **Consumed Events**
```typescript
// Handle user deletion
class UserDeletedHandler {
  async handle(event: UserDeletedEvent): Promise<void> {
    // Anonymize or delete user's files
    await this.fileService.handleUserDeletion(event.userId);
  }
}

// Handle course deletion
class CourseDeletedHandler {
  async handle(event: CourseDeletedEvent): Promise<void> {
    // Delete or archive course files
    await this.fileService.handleCourseDeletion(event.courseId);
  }
}
```

---

## 🏭 **Processing Pipeline**

### **Background Processing Architecture**
```typescript
// Job types
enum ProcessingJobType {
  VIRUS_SCAN = 'virus_scan',
  THUMBNAIL_GENERATION = 'thumbnail_generation',
  IMAGE_OPTIMIZATION = 'image_optimization',
  VIDEO_TRANSCODING = 'video_transcoding',
  DOCUMENT_PREVIEW = 'document_preview',
  METADATA_EXTRACTION = 'metadata_extraction'
}

// Job queue configuration
const queueConfig = {
  name: 'file-processing',
  redis: {
    host: 'redis',
    port: 6379
  },
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
};
```

### **Processing Workers**
```typescript
class ImageProcessor {
  async process(fileId: string, options: ImageProcessingOptions): Promise<ProcessingResult> {
    const variants = ['thumbnail', 'small', 'medium', 'large'];
    const results: ImageVariant[] = [];
    
    for (const variant of variants) {
      const processed = await this.generateVariant(fileId, variant);
      results.push(processed);
    }
    
    return { variants: results };
  }
  
  private async generateVariant(fileId: string, size: string): Promise<ImageVariant> {
    // Use Sharp for image processing
    const dimensions = this.getSizeDimensions(size);
    const outputPath = this.generateVariantPath(fileId, size);
    
    await sharp(inputPath)
      .resize(dimensions.width, dimensions.height, { fit: 'inside' })
      .jpeg({ quality: 85 })
      .toFile(outputPath);
      
    return {
      size,
      width: dimensions.width,
      height: dimensions.height,
      path: outputPath,
      format: 'jpeg'
    };
  }
}

class VideoProcessor {
  async process(fileId: string, options: VideoProcessingOptions): Promise<ProcessingResult> {
    const qualities = ['360p', '720p', '1080p'];
    const results: VideoVariant[] = [];
    
    for (const quality of qualities) {
      const processed = await this.transcodeVideo(fileId, quality);
      results.push(processed);
    }
    
    // Generate thumbnail
    const thumbnail = await this.generateThumbnail(fileId);
    
    return { 
      variants: results,
      thumbnail: thumbnail.path
    };
  }
  
  private async transcodeVideo(fileId: string, quality: string): Promise<VideoVariant> {
    // Use FFmpeg for video processing
    const outputPath = this.generateVariantPath(fileId, quality);
    const config = this.getQualityConfig(quality);
    
    await ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .size(`${config.width}x${config.height}`)
      .videoBitrate(config.bitrate)
      .output(outputPath)
      .run();
      
    return {
      quality,
      width: config.width,
      height: config.height,
      path: outputPath,
      duration: 0, // Will be extracted
      bitrate: config.bitrate
    };
  }
}
```

---

## 📊 **Monitoring & Observability**

### **Metrics**
```typescript
// Prometheus metrics
const metrics = {
  uploadDuration: new promClient.Histogram({
    name: 'file_service_upload_duration_seconds',
    help: 'File upload duration',
    labelNames: ['status', 'mime_type', 'size_bucket']
  }),
  
  downloadCount: new promClient.Counter({
    name: 'file_service_downloads_total',
    help: 'Total file downloads',
    labelNames: ['status', 'mime_type', 'variant']
  }),
  
  processingQueueSize: new promClient.Gauge({
    name: 'file_service_processing_queue_size',
    help: 'Processing queue size',
    labelNames: ['job_type']
  }),
  
  storageUsage: new promClient.Gauge({
    name: 'file_service_storage_bytes',
    help: 'Storage usage in bytes',
    labelNames: ['backend', 'mime_type']
  })
};
```

### **Health Checks**
```typescript
class HealthCheckService {
  async checkHealth(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(), 
      this.checkStorage(),
      this.checkProcessingQueue()
    ]);
    
    return {
      status: checks.every(c => c.status === 'fulfilled') ? 'healthy' : 'unhealthy',
      checks: {
        database: this.getCheckResult(checks[0]),
        redis: this.getCheckResult(checks[1]),
        storage: this.getCheckResult(checks[2]),
        queue: this.getCheckResult(checks[3])
      },
      timestamp: new Date()
    };
  }
}
```

### **Logging**
```typescript
// Structured logging
const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'file-service' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'file-service.log' })
  ]
});

// Usage
logger.info('File uploaded', {
  fileId: 'uuid',
  userId: 'user-uuid',
  size: 1024000,
  mimeType: 'image/jpeg',
  duration: 250
});
```

---

## ⚙️ **Configuration**

### **Environment Variables**
```bash
# Server Configuration
PORT=3005
NODE_ENV=production
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/lms_files
REDIS_URL=redis://redis:6379

# Storage Configuration
STORAGE_BACKEND=minio # local | minio | s3
STORAGE_BUCKET=lms-files
STORAGE_REGION=us-east-1

# MinIO Configuration (if using MinIO)
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false

# Local Storage Configuration (if using local)
LOCAL_STORAGE_PATH=/app/uploads
LOCAL_STORAGE_PUBLIC_URL=http://localhost:3005/files

# Processing Configuration
PROCESSING_ENABLED=true
MAX_CONCURRENT_JOBS=10
IMAGE_PROCESSING_QUALITY=85
VIDEO_PROCESSING_PRESETS=360p,720p,1080p

# Security
JWT_SECRET=your-jwt-secret
MAX_FILE_SIZE=104857600 # 100MB
VIRUS_SCAN_ENABLED=true
ALLOWED_MIME_TYPES=image/*,video/*,application/pdf,text/*

# Rate Limiting
UPLOAD_RATE_LIMIT=100
DOWNLOAD_RATE_LIMIT=1000

# CDN Configuration (optional)
CDN_ENABLED=false
CDN_BASE_URL=https://cdn.example.com
CDN_INVALIDATION_ENABLED=false

# Event Bus
KAFKA_BROKERS=kafka:9092
KAFKA_CLIENT_ID=file-service
KAFKA_GROUP_ID=file-service-group
```

### **Feature Flags**
```typescript
interface FeatureFlags {
  chunkUploadEnabled: boolean;
  videoProcessingEnabled: boolean;
  virusScanEnabled: boolean;
  cdnEnabled: boolean;
  fileVersioningEnabled: boolean;
  auditLoggingEnabled: boolean;
  compressionEnabled: boolean;
  watermarkingEnabled: boolean;
}
```

---

## 🧪 **Testing Strategy**

### **Unit Tests**
```typescript
describe('FileService', () => {
  describe('uploadFile', () => {
    it('should upload file successfully', async () => {
      const mockFile = createMockFile();
      const result = await fileService.uploadFile(mockFile, { userId: 'user1' });
      
      expect(result.id).toBeDefined();
      expect(result.status).toBe('pending');
    });
    
    it('should reject oversized files', async () => {
      const largeFile = createMockFile({ size: 1000000000 });
      
      await expect(fileService.uploadFile(largeFile, { userId: 'user1' }))
        .rejects.toThrow('File too large');
    });
  });
});
```

### **Integration Tests**
```typescript
describe('File Upload API', () => {
  it('should handle multipart upload', async () => {
    const response = await request(app)
      .post('/api/v1/files/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', path.join(__dirname, 'fixtures/test.pdf'))
      .expect(201);
      
    expect(response.body.id).toBeDefined();
    expect(response.body.originalName).toBe('test.pdf');
  });
});
```

### **Load Tests**
```typescript
// Artillery load test configuration
const loadTestConfig = {
  config: {
    target: 'http://localhost:3005',
    phases: [
      { duration: 60, arrivalRate: 10 },
      { duration: 120, arrivalRate: 50 },
      { duration: 60, arrivalRate: 100 }
    ]
  },
  scenarios: [
    {
      name: 'File Upload',
      weight: 70,
      flow: [
        {
          post: {
            url: '/api/v1/files/upload',
            formData: {
              file: '@test-file.jpg'
            }
          }
        }
      ]
    },
    {
      name: 'File Download',
      weight: 30,
      flow: [
        {
          get: {
            url: '/api/v1/files/{{ fileId }}/download'
          }
        }
      ]
    }
  ]
};
```

---

## 🚀 **Deployment Configuration**

### **Dockerfile**
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install system dependencies for processing
RUN apk add --no-cache \
    ffmpeg \
    imagemagick \
    clamav \
    curl

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY openapi/ ./openapi/

# Create uploads directory
RUN mkdir -p /app/uploads && \
    chown -R node:node /app/uploads

# Switch to non-root user
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3005}/health || exit 1

EXPOSE 3005

CMD ["node", "src/main.js"]
```

### **Docker Compose Service**
```yaml
file-service:
  build:
    context: ./services/file-service
    dockerfile: Dockerfile
  ports:
    - "3005:3005"
  environment:
    - NODE_ENV=production
    - DATABASE_URL=postgresql://user:pass@postgres:5432/lms_files
    - REDIS_URL=redis://redis:6379
    - STORAGE_BACKEND=minio
    - MINIO_ENDPOINT=minio:9000
  volumes:
    - file-uploads:/app/uploads
  depends_on:
    - postgres
    - redis
    - minio
  networks:
    - lms-network
  restart: unless-stopped
  deploy:
    resources:
      limits:
        cpus: '1.0'
        memory: '1G'
      reservations:
        cpus: '0.5'
        memory: '512M'
```

---
## 🎯 **Success Criteria**

### **Functional Requirements**
- ✅ Support multiple file types (images, videos, documents)
- ✅ Secure upload and download with proper authentication
- ✅ Automatic image optimization and thumbnail generation
- ✅ Video transcoding to multiple formats
- ✅ File versioning and metadata management
- ✅ Integration with other LMS services

### **Non-Functional Requirements**
- ✅ 99.9% uptime availability
- ✅ < 200ms API response time for metadata operations
- ✅ Support for 100 concurrent uploads
- ✅ Horizontal scalability
- ✅ GDPR/FERPA compliance
- ✅ Comprehensive audit logging

### **Technical Requirements**
- ✅ RESTful API with OpenAPI specification
- ✅ Event-driven integration with message bus
- ✅ Pluggable storage backend support
- ✅ Production-ready error handling and logging
- ✅ Comprehensive test coverage (>80%)
- ✅ Container-ready deployment

---

This specification provides a complete blueprint for building an enterprise-grade file service that integrates seamlessly with the LMS microservices architecture. The service is designed to be scalable, secure, and maintainable while providing all the functionality needed for educational content management. 
