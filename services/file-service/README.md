# File Service

The File Service is a critical microservice in the LMS platform responsible for handling all file operations including upload, storage, processing, and delivery. It provides a secure, scalable, and performant solution for managing educational content assets.

## 🎯 **Overview**

This service handles the complete file lifecycle from upload to delivery, supporting multiple storage backends, advanced media processing, and comprehensive security features.

### **Key Features**

- **Secure File Operations**: Upload, download, and management with authentication
- **Multi-Storage Backend**: Local filesystem, MinIO, S3-compatible storage
- **Media Processing**: Image optimization, video transcoding, thumbnail generation
- **File Versioning**: Complete version control and metadata management
- **Access Control**: Role-based permissions and secure access
- **Virus Scanning**: Optional ClamAV integration for security
- **CDN Integration**: Optimized content delivery
- **Audit Logging**: Comprehensive access and operation logging

## 🏗️ **Architecture**

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

The service supports pluggable storage backends:
- **Local Filesystem**: Direct file storage on server
- **MinIO**: S3-compatible object storage
- **AWS S3**: Cloud object storage (via S3-compatible interface)

## 🚀 **Getting Started**

### **Prerequisites**

- Docker 20.10+
- Docker Compose v2.0+
- Node.js 20+ (for development)
- PostgreSQL 15+
- Redis 7+
- MinIO or S3-compatible storage

### **Environment Variables**

Copy the environment template and configure:

```bash
cp .env.example .env
```

Key configuration variables:

```bash
# Server Configuration
NODE_ENV=production
PORT=3004
LOG_LEVEL=info

# Database Configuration
DATABASE_URL=postgresql://user:pass@postgres:5432/lms_files
REDIS_URL=redis://redis:6379/4

# Storage Configuration
STORAGE_BACKEND=minio
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key
MINIO_BUCKET=lms-files

# File Processing
PROCESSING_ENABLED=true
MAX_CONCURRENT_JOBS=10
IMAGE_PROCESSING_QUALITY=85
VIDEO_PROCESSING_PRESETS=360p,720p,1080p

# Security
MAX_FILE_SIZE=104857600
VIRUS_SCAN_ENABLED=false
ALLOWED_MIME_TYPES=image/*,video/*,application/pdf
```

### **Development Setup**

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up database:**
   ```bash
   # Run migrations
   npm run db:migrate
   
   # Seed with sample data
   npm run db:seed
   ```

3. **Initialize storage:**
   ```bash
   # Create storage buckets/directories
   npm run storage:init
   ```

4. **Start development environment:**
   ```bash
   # Start infrastructure services
   docker-compose -f ../../infra/docker-compose.yml -f ../../infra/docker-compose.dev.yml up -d postgresql redis-master minio kafka-1

   # Start the service in development mode
   npm run dev
   ```

5. **Start workers (optional):**
   ```bash
   # Processing worker
   npm run worker:processing
   
   # Cleanup worker
   npm run worker:cleanup
   ```

### **Production Deployment**

```bash
# Deploy with Docker Compose
docker-compose -f ../../infra/docker-compose.yml -f ../../infra/docker-compose.prod.yml up -d file-service

# Or build and run locally
npm run build
npm start
```

## 📊 **Service Components**

### **Main Service (Port 3004)**
- REST API for file operations
- Upload and download endpoints
- File metadata management
- Access control and permissions
- Health checks and metrics

### **Processing Worker (Port 3014)**
- Image optimization and thumbnail generation
- Video transcoding to multiple formats
- Document preview generation
- Metadata extraction
- Virus scanning integration

### **Cleanup Worker (Port 3015)**
- Expired file cleanup
- Orphaned file detection
- Storage optimization
- Audit log maintenance

### **ClamAV (Optional)**
- Virus scanning service
- Real-time threat detection
- Quarantine management

## 🔌 **API Endpoints**

### **File Upload**

#### **Single File Upload**
```http
POST /api/v1/files/upload
Content-Type: multipart/form-data
Authorization: Bearer <jwt-token>

Form Data:
- file: File (binary)
- courseId?: string
- permissions?: object
- isTemporary?: boolean

Response: 201 Created
{
  "id": "uuid",
  "originalName": "document.pdf",
  "url": "/api/v1/files/uuid/download",
  "mimeType": "application/pdf",
  "size": 1024000,
  "status": "pending"
}
```

#### **Multiple File Upload**
```http
POST /api/v1/files/upload/batch
Content-Type: multipart/form-data
Authorization: Bearer <jwt-token>

Form Data:
- files: File[] (multiple files)
- courseId?: string

Response: 201 Created
{
  "files": [
    {
      "id": "uuid1",
      "originalName": "image1.jpg",
      "status": "pending"
    }
  ],
  "batchId": "batch-uuid"
}
```

#### **Chunked Upload (Large Files)**
```http
# Initialize chunked upload
POST /api/v1/files/upload/chunked/init
{
  "fileName": "large-video.mp4",
  "fileSize": 1073741824,
  "mimeType": "video/mp4"
}

# Upload chunk
PUT /api/v1/files/upload/chunked/{uploadId}/chunks/{chunkNumber}
Content-Type: application/octet-stream

# Complete upload
POST /api/v1/files/upload/chunked/{uploadId}/complete
```

### **File Download**

#### **File Download**
```http
GET /api/v1/files/{fileId}/download
Authorization: Bearer <jwt-token> (optional for public files)

Query Parameters:
- variant?: string (thumbnail, small, medium, large)
- quality?: string (360p, 720p, 1080p)
- inline?: boolean

Response: 200 OK
Content-Type: <file-mime-type>
Content-Disposition: inline; filename="original-name.ext"
<file-binary-data>
```

#### **Streaming Download**
```http
GET /api/v1/files/{fileId}/stream
Authorization: Bearer <jwt-token>
Range: bytes=0-1023 (optional)

Response: 206 Partial Content
Content-Range: bytes 0-1023/1048576
<partial-file-data>
```

### **File Management**

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
  "status": "ready",
  "permissions": {
    "isPublic": false,
    "allowedRoles": ["instructor", "student"]
  },
  "processingMetadata": {
    "thumbnailPath": "/thumbnails/uuid.jpg"
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
- status?: string
- page?: number
- limit?: number

Response: 200 OK
{
  "files": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

#### **Update File Metadata**
```http
PATCH /api/v1/files/{fileId}
Authorization: Bearer <jwt-token>

{
  "originalName": "new-name.pdf",
  "permissions": {
    "isPublic": true
  }
}

Response: 200 OK
```

#### **Delete File**
```http
DELETE /api/v1/files/{fileId}
Authorization: Bearer <jwt-token>

Query Parameters:
- force?: boolean (hard delete)

Response: 204 No Content
```

### **Processing Status**

#### **Get Processing Status**
```http
GET /api/v1/files/{fileId}/processing
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "fileId": "uuid",
  "status": "processing",
  "progress": 75,
  "processingSteps": [
    {
      "step": "virus_scan",
      "status": "completed"
    },
    {
      "step": "thumbnail_generation",
      "status": "in_progress"
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

## 🔄 **Event Integration**

### **Published Events**

- `file.uploaded` - File upload completed
- `file.processing.started` - Processing initiated
- `file.processing.completed` - Processing finished
- `file.processing.failed` - Processing failed
- `file.downloaded` - File accessed
- `file.deleted` - File removed
- `file.permission.changed` - Permissions updated

### **Consumed Events**

- `user.deleted` - Clean up user files
- `course.deleted` - Remove course files
- `content.ingestion.requested` - Process uploaded content

## 📊 **Monitoring & Observability**

### **Health Checks**

```bash
# Basic health check
curl http://localhost:3004/health

# Detailed health check with service status
curl http://localhost:3004/health/detailed
```

### **Metrics**

The service exposes Prometheus metrics on `/metrics`:

- `file_service_upload_duration_seconds` - Upload time by file type
- `file_service_downloads_total` - Total downloads by type
- `file_service_processing_queue_size` - Processing queue size
- `file_service_storage_bytes` - Storage usage by backend
- `file_service_active_uploads` - Concurrent uploads

### **Logging**

Structured JSON logging with correlation IDs:

```bash
# View service logs
docker-compose logs -f file-service

# View worker logs
docker-compose logs -f file-processing-worker
docker-compose logs -f file-cleanup-worker
```

## 🛠️ **Development**

### **Project Structure**

```
src/
├── main.ts                     # Application entry point
├── app.ts                      # Fastify app configuration
├── routes/                     # API route handlers
│   ├── upload.ts              # File upload endpoints
│   ├── download.ts            # File download endpoints
│   ├── files.ts               # File management endpoints
│   └── processing.ts          # Processing status endpoints
├── services/                   # Business logic services
│   ├── file-service.ts        # Core file operations
│   ├── storage-service.ts     # Storage backend abstraction
│   ├── processing-service.ts  # File processing coordination
│   └── permission-service.ts  # Access control
├── storage/                    # Storage backend implementations
│   ├── local-storage.ts       # Local filesystem storage
│   ├── minio-storage.ts       # MinIO storage
│   └── s3-storage.ts          # S3-compatible storage
├── processors/                 # File processing workers
│   ├── image-processor.ts     # Image optimization
│   ├── video-processor.ts     # Video transcoding
│   └── document-processor.ts  # Document processing
├── middleware/                 # Custom middleware
│   ├── auth.ts                # Authentication
│   ├── upload.ts              # Upload handling
│   └── rate-limit.ts          # Rate limiting
├── database/                   # Database configuration
│   ├── connection.ts          # Database connection
│   ├── migrations/            # Database migrations
│   └── seeds/                 # Sample data
├── events/                     # Event handling
│   ├── publishers/            # Event publishers
│   └── handlers/              # Event handlers
├── utils/                      # Utility functions
│   ├── logger.ts              # Logging configuration
│   ├── validation.ts          # File validation
│   └── security.ts            # Security utilities
└── types/                      # TypeScript type definitions
    ├── file.ts                # File-related types
    ├── storage.ts             # Storage-related types
    └── api.ts                 # API request/response types
```

### **Database Management**

```bash
# Create new migration
npx knex migrate:make create_files_table

# Run migrations
npm run db:migrate

# Rollback last migration
npm run db:rollback

# Seed database
npm run db:seed

# Reset database
npm run db:reset
```

### **Testing**

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Run load tests
npm run test:load
```

### **Code Quality**

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Type checking
npm run typecheck

# Generate documentation
npm run docs:generate
```

## 🔧 **Configuration**

### **Storage Settings**

```bash
# Storage Backend
STORAGE_BACKEND=minio  # local | minio | s3

# MinIO Configuration
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key
MINIO_BUCKET=lms-files

# Local Storage
LOCAL_STORAGE_PATH=/app/uploads
LOCAL_STORAGE_PUBLIC_URL=http://localhost:3004/files
```

### **Processing Settings**

```bash
# Image Processing
IMAGE_PROCESSING_QUALITY=85
IMAGE_VARIANTS=thumbnail,small,medium,large

# Video Processing
VIDEO_PROCESSING_PRESETS=360p,720p,1080p
VIDEO_TRANSCODING_ENABLED=true

# Processing Limits
MAX_CONCURRENT_JOBS=10
MAX_PROCESSING_TIME=1800
PROCESSING_TIMEOUT=3600
```

### **Security Settings**

```bash
# File Limits
MAX_FILE_SIZE=104857600  # 100MB
MAX_CHUNK_SIZE=1048576   # 1MB

# Allowed Types
ALLOWED_MIME_TYPES=image/*,video/*,application/pdf
BLOCKED_EXTENSIONS=exe,bat,cmd,scr

# Security Features
VIRUS_SCAN_ENABLED=false
CONTENT_TYPE_VALIDATION=true
```

## 🚨 **Troubleshooting**

### **Common Issues**

1. **Upload failures:**
   ```bash
   # Check file size limits
   echo $MAX_FILE_SIZE
   
   # Check storage connectivity
   curl http://localhost:3004/health/detailed
   ```

2. **Processing delays:**
   ```bash
   # Check processing queue
   docker-compose logs file-processing-worker
   
   # Monitor queue size
   curl http://localhost:3004/metrics | grep queue_size
   ```

3. **Storage issues:**
   ```bash
   # Check MinIO connectivity
   docker-compose exec file-service curl -f http://minio:9000/minio/health/live
   
   # Check storage usage
   curl http://localhost:3004/api/v1/admin/storage/stats
   ```

4. **High memory usage:**
   ```bash
   # Check processing worker memory
   docker stats file-processing-worker
   
   # Reduce concurrent jobs
   MAX_CONCURRENT_JOBS=5
   ```

### **Performance Optimization**

1. **Enable CDN for static content delivery**
2. **Use appropriate image compression settings**
3. **Implement chunked uploads for large files**
4. **Configure proper caching headers**
5. **Monitor and tune processing worker concurrency**

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📞 **Support**

For issues and questions:
- Check the [troubleshooting guide](#-troubleshooting)
- Review service logs: `docker-compose logs file-service`
- Monitor health endpoints: `/health`
- Check metrics: `/metrics`
- Review API documentation: `/docs`
