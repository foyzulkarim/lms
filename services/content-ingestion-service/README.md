# Content Ingestion Service

The Content Ingestion Service is a critical microservice responsible for processing various types of educational content, extracting meaningful information, generating embeddings for semantic search, and preparing content for RAG (Retrieval-Augmented Generation) operations.

## 🎯 **Overview**

This service handles the complete content processing pipeline from ingestion to vector storage, supporting multiple content sources and formats while maintaining high performance and reliability.

### **Key Features**

- **Multi-Source Content Ingestion**: Files, URLs, YouTube videos, GitHub repositories
- **Advanced Text Extraction**: PDF, images (OCR), audio/video (speech-to-text), documents
- **Intelligent Content Chunking**: Context-aware text segmentation with overlap
- **Vector Embedding Generation**: Integration with LLM Gateway for semantic embeddings
- **Vector Database Storage**: Efficient storage and retrieval using PostgreSQL + pgvector
- **Search Integration**: Automatic indexing for traditional and semantic search
- **Event-Driven Architecture**: Real-time processing with Kafka integration
- **Background Workers**: Specialized workers for extraction, embedding, and indexing

## 🏗️ **Architecture**

```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│   File Service  │────│Content Ingestion     │────│  LLM Gateway    │
│   API Gateway   │    │     Service          │    │                 │
│   External APIs │    └──────────────────────┘    └─────────────────┘
└─────────────────┘              │                           │
                                 │                           │
                    ┌────────────┼─────────────┐             │
                    │            │             │             │
            ┌───────▼───┐ ┌──────▼──────┐ ┌──▼──▼──┐ ┌──────▼──────┐
            │Processing │ │   Metadata  │ │  Cache  │ │   Vector    │
            │  Queue    │ │  Database   │ │ (Redis) │ │  Database   │
            └───────────┘ └─────────────┘ └─────────┘ └─────────────┘
```

### **Processing Pipeline**

```
Content Source → Content Extraction → Text Processing → Chunking → 
Embedding Generation → Vector Storage → Search Indexing → Event Publishing
```

## 🚀 **Getting Started**

### **Prerequisites**

- Docker 20.10+
- Docker Compose v2.0+
- Node.js 18+ (for development)
- PostgreSQL with pgvector extension
- Redis for job queues
- Kafka for event streaming

### **Environment Variables**

Copy the environment template and configure:

```bash
cp .env.example .env
```

Key configuration variables:

```bash
# Server Configuration
NODE_ENV=production
PORT=3008
LOG_LEVEL=info

# Database URLs
POSTGRES_URL=postgresql://user:pass@postgres:5432/lms_db
REDIS_URL=redis://redis:6379/7
MONGODB_URI=mongodb://user:pass@mongodb:27017/content_db

# External Services
LLM_GATEWAY_URL=http://llm-gateway:3009
FILE_SERVICE_URL=http://file-service:3004
SEARCH_SERVICE_URL=http://search-service:3005

# Content Processing
CHUNK_SIZE=500
CHUNK_OVERLAP=50
EMBEDDING_MODEL=text-embedding-ada-002
MAX_CONCURRENT_JOBS=5

# External APIs
YOUTUBE_API_KEY=your-youtube-api-key
GITHUB_TOKEN=your-github-token
```

### **Development Setup**

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development environment:**
   ```bash
   # Start infrastructure services
   docker-compose -f ../../infra/docker-compose.yml -f ../../infra/docker-compose.dev.yml up -d postgresql redis-master mongodb kafka-1

   # Start the service in development mode
   npm run dev
   ```

3. **Start workers (in separate terminals):**
   ```bash
   npm run worker:extraction
   npm run worker:embedding
   npm run worker:indexing
   ```

### **Production Deployment**

```bash
# Deploy with Docker Compose
docker-compose -f ../../infra/docker-compose.yml -f ../../infra/docker-compose.prod.yml up -d content-ingestion-service

# Or build and run locally
npm run build
npm start
```

## 📊 **Service Components**

### **Main Service (Port 3008)**
- REST API for content ingestion
- Job management and status tracking
- Content metadata management
- Health checks and metrics

### **Extraction Worker (Port 3009)**
- PDF text extraction (PDF.js)
- OCR processing (Tesseract)
- Speech-to-text (Whisper)
- Document processing (Word, Excel, PowerPoint)
- Web content scraping
- YouTube video processing
- GitHub repository ingestion

### **Embedding Worker (Port 3010)**
- Text chunking with context preservation
- Vector embedding generation via LLM Gateway
- Batch processing for efficiency
- Vector database storage

### **Indexing Worker (Port 3011)**
- Search index creation
- Elasticsearch integration
- Metadata indexing
- Search optimization

## 🔌 **API Endpoints**

### **Content Ingestion**

#### **Ingest from File**
```http
POST /api/v1/ingestion/file
Content-Type: application/json
Authorization: Bearer <jwt-token>

{
  "fileId": "file-uuid",
  "courseId": "course-uuid",
  "title": "Content Title",
  "extractionMethod": "auto"
}
```

#### **Ingest from URL**
```http
POST /api/v1/ingestion/url
Content-Type: application/json
Authorization: Bearer <jwt-token>

{
  "url": "https://example.com/content",
  "courseId": "course-uuid",
  "title": "Web Content"
}
```

#### **Ingest YouTube Video**
```http
POST /api/v1/ingestion/youtube
Content-Type: application/json
Authorization: Bearer <jwt-token>

{
  "videoId": "youtube-video-id",
  "courseId": "course-uuid",
  "extractTranscript": true
}
```

#### **Manual Content Input**
```http
POST /api/v1/ingestion/manual
Content-Type: application/json
Authorization: Bearer <jwt-token>

{
  "title": "Manual Content",
  "content": "Content text...",
  "courseId": "course-uuid"
}
```

### **Content Management**

#### **Get Content Details**
```http
GET /api/v1/ingestion/content/{contentId}
Authorization: Bearer <jwt-token>
```

#### **List Content Items**
```http
GET /api/v1/ingestion/content?courseId={courseId}&status=completed
Authorization: Bearer <jwt-token>
```

#### **Get Content Chunks**
```http
GET /api/v1/ingestion/content/{contentId}/chunks
Authorization: Bearer <jwt-token>
```

#### **Reprocess Content**
```http
POST /api/v1/ingestion/content/{contentId}/reprocess
Content-Type: application/json
Authorization: Bearer <jwt-token>

{
  "steps": ["chunking", "embedding"]
}
```

### **Job Management**

#### **Get Job Status**
```http
GET /api/v1/ingestion/jobs/{jobId}
Authorization: Bearer <jwt-token>
```

#### **List Jobs**
```http
GET /api/v1/ingestion/jobs?status=processing
Authorization: Bearer <jwt-token>
```

## 🔄 **Event Integration**

### **Published Events**

- `content.ingestion.started` - Content processing initiated
- `content.extracted` - Text extraction completed
- `content.chunked` - Content chunking completed
- `content.embedded` - Embedding generation completed
- `content.indexed` - Search indexing completed
- `content.ingestion.completed` - Full processing completed
- `content.ingestion.failed` - Processing failed
- `content.updated` - Content updated
- `content.deleted` - Content deleted

### **Consumed Events**

- `file.uploaded` - Auto-ingest uploaded files
- `course.deleted` - Clean up course content
- `user.deleted` - Remove user-specific content

## 📊 **Monitoring & Observability**

### **Health Checks**

```bash
# Main service health
curl http://localhost:3008/health

# Worker health
curl http://localhost:3009/health  # Extraction worker
curl http://localhost:3010/health  # Embedding worker
curl http://localhost:3011/health  # Indexing worker
```

### **Metrics**

The service exposes Prometheus metrics on `/metrics`:

- `content_ingestion_processing_duration_seconds` - Processing time by source type
- `content_ingestion_chunks_total` - Total chunks generated
- `content_ingestion_embeddings_total` - Total embeddings generated
- `content_ingestion_job_queue_size` - Job queue size by type

### **Logging**

Structured JSON logging with correlation IDs:

```bash
# View service logs
docker-compose logs -f content-ingestion-service

# View worker logs
docker-compose logs -f content-extraction-worker
docker-compose logs -f content-embedding-worker
docker-compose logs -f content-indexing-worker
```

## 🛠️ **Development**

### **Project Structure**

```
src/
├── main.ts                     # Application entry point
├── routes/                     # API route handlers
│   ├── ingestion.ts           # Content ingestion endpoints
│   ├── content.ts             # Content management endpoints
│   └── jobs.ts                # Job management endpoints
├── services/                   # Business logic services
│   ├── content-processor.ts   # Main processing service
│   ├── extractors/            # Content extraction services
│   ├── chunking.ts            # Text chunking service
│   └── embedding.ts           # Embedding generation service
├── workers/                    # Background workers
│   ├── extraction-worker.ts   # Content extraction worker
│   ├── embedding-worker.ts    # Embedding generation worker
│   └── indexing-worker.ts     # Search indexing worker
├── adapters/                   # External service adapters
│   ├── youtube.ts             # YouTube integration
│   ├── github.ts              # GitHub integration
│   └── web-scraper.ts         # Web content scraping
├── database/                   # Database models and migrations
│   ├── models/                # Data models
│   ├── repositories/          # Data access layer
│   └── migrations/            # Database migrations
├── events/                     # Event handling
│   ├── publishers/            # Event publishers
│   └── handlers/              # Event handlers
└── utils/                      # Utility functions
    ├── logger.ts              # Logging configuration
    ├── metrics.ts             # Prometheus metrics
    └── validation.ts          # Input validation
```

### **Testing**

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- content-processor.test.ts
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
```

## 🔧 **Configuration**

### **Content Processing Settings**

```typescript
interface ProcessingConfig {
  chunking: {
    defaultSize: 500;        // Default chunk size in tokens
    overlap: 50;             // Overlap between chunks
    minChunkSize: 50;        // Minimum chunk size
    maxChunkSize: 1000;      // Maximum chunk size
  };
  embedding: {
    model: 'text-embedding-ada-002';  // Embedding model
    dimensions: 1536;                 // Vector dimensions
    batchSize: 10;                    // Batch size for processing
    timeout: 60000;                   // Request timeout
  };
  extraction: {
    enabledMethods: ['pdf_js', 'ocr', 'speech_to_text'];
    confidenceThreshold: 0.8;         // Minimum confidence score
    timeoutMs: 300000;                // Extraction timeout
  };
}
```

### **Worker Configuration**

```bash
# Extraction Worker
EXTRACTION_WORKER_CONCURRENCY=3
EXTRACTION_MAX_MEMORY_MB=2048
EXTRACTION_MAX_CPU_PERCENT=80

# Embedding Worker
EMBEDDING_WORKER_CONCURRENCY=2
EMBEDDING_BATCH_SIZE=10
EMBEDDING_TIMEOUT_MS=60000

# Indexing Worker
INDEXING_WORKER_CONCURRENCY=2
INDEX_BATCH_SIZE=50
INDEX_TIMEOUT_MS=30000
```

## 🚨 **Troubleshooting**

### **Common Issues**

1. **High memory usage during processing:**
   ```bash
   # Check worker memory usage
   docker stats content-extraction-worker
   
   # Reduce batch sizes
   EMBEDDING_BATCH_SIZE=5
   INDEX_BATCH_SIZE=25
   ```

2. **Slow embedding generation:**
   ```bash
   # Check LLM Gateway connectivity
   curl http://llm-gateway:3009/health
   
   # Monitor embedding queue
   curl http://localhost:3008/api/v1/admin/queue-stats
   ```

3. **OCR extraction failures:**
   ```bash
   # Check Tesseract installation
   docker-compose exec content-extraction-worker tesseract --version
   
   # Verify language data
   docker-compose exec content-extraction-worker ls /usr/share/tesseract-ocr/4.00/tessdata/
   ```

4. **Vector database performance:**
   ```bash
   # Check pgvector extension
   docker-compose exec postgresql psql -U lms_user -d lms_db -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
   
   # Monitor vector index performance
   docker-compose exec postgresql psql -U lms_user -d lms_db -c "EXPLAIN ANALYZE SELECT * FROM content_embeddings ORDER BY embedding <-> '[0,1,0]' LIMIT 10;"
   ```

### **Performance Optimization**

1. **Increase worker concurrency for high-volume processing**
2. **Use batch processing for embedding generation**
3. **Implement content deduplication to avoid reprocessing**
4. **Cache frequently accessed embeddings**
5. **Use appropriate vector index parameters for your use case**

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
- Review service logs: `docker-compose logs content-ingestion-service`
- Monitor health endpoints: `/health`
- Check metrics: `/metrics`
