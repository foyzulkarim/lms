# Content Ingestion Service Technical Specification

## 🎯 **Service Overview**

The Content Ingestion Service is a critical microservice responsible for processing various types of educational content, extracting meaningful information, generating embeddings for semantic search, and preparing content for RAG (Retrieval-Augmented Generation) operations.

### **Core Responsibilities**
- Content extraction from multiple sources (files, URLs, APIs)
- Text extraction from documents, images, videos, and audio
- Content normalization and preprocessing
- Metadata extraction and enrichment
- Vector embedding generation via LLM Gateway
- Vector database storage for semantic search
- Content indexing for traditional search
- Event-driven content processing pipeline
- Content versioning and change detection

### **Service Characteristics**
- **Technology Stack:** Node.js + Fastify + TypeScript
- **Processing:** Background workers with queue-based processing
- **Database:** PostgreSQL (metadata) + Vector Database (embeddings)
- **Queue:** BullMQ for job processing
- **External Integrations:** LLM Gateway, File Service, Search Service
- **Content Processing:** PDF.js, Tesseract OCR, FFmpeg, Whisper

---

## 🏗️ **Architecture Design**

### **High-Level Architecture**
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

### **Service Integration Flow**

```mermaid
graph TD
    A[Content Upload] --> B[File Service]
    B --> C[Content Ingestion Service]
    C --> D[Text Extraction]
    D --> E[Content Chunking]
    E --> F[LLM Gateway - Embedding Generation]
    F --> G[Vector Database Storage]
    G --> H[Search Service Indexing]
    H --> I[RAG-Enabled Search]
    I --> J[LLM Gateway - Answer Generation]

```


---

## 📊 **Data Models**

### **Content Models**
```typescript
interface ContentItem {
  id: string;                      // UUID
  sourceId: string;               // Original source identifier
  sourceType: ContentSourceType;  // file | url | api | manual
  sourceMetadata: Record<string, any>; // Source-specific metadata
  
  // Content Information
  title: string;
  description?: string;
  content: string;                // Extracted text content
  contentType: string;           // text/plain, text/html, etc.
  language: string;              // ISO language code
  
  // Processing Information
  processingStatus: ProcessingStatus;
  processingMetadata: ProcessingMetadata;
  extractionMethod: ExtractionMethod;
  
  // Chunking Information
  chunks: ContentChunk[];
  totalChunks: number;
  
  // Context Information
  courseId?: string;
  moduleId?: string;
  tags: string[];
  categories: string[];
  
  // Versioning
  version: number;
  parentId?: string;
  isLatest: boolean;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  processedAt?: Date;
  deletedAt?: Date;
}

interface ContentChunk {
  id: string;                     // UUID
  contentId: string;             // Parent content ID
  chunkIndex: number;            // Order in content
  text: string;                  // Chunk text content
  tokens: number;                // Token count
  
  // Context
  startPosition: number;         // Start position in original content
  endPosition: number;           // End position in original content
  metadata: ChunkMetadata;       // Additional chunk metadata
  
  // Embeddings
  embedding?: number[];          // Vector embedding
  embeddingModel: string;        // Model used for embedding
  embeddingDimensions: number;   // Vector dimensions
  
  // Timestamps
  createdAt: Date;
  embeddedAt?: Date;
}

interface ChunkMetadata {
  section?: string;              // Document section
  page?: number;                // Page number (for documents)
  timestamp?: number;           // Timestamp (for video/audio)
  speaker?: string;             // Speaker (for transcripts)
  confidence?: number;          // Extraction confidence
}

enum ContentSourceType {
  FILE = 'file',
  URL = 'url',
  API = 'api',
  MANUAL = 'manual',
  YOUTUBE = 'youtube',
  GITHUB = 'github',
  SCORM = 'scorm'
}

enum ProcessingStatus {
  PENDING = 'pending',
  EXTRACTING = 'extracting',
  PROCESSING = 'processing',
  CHUNKING = 'chunking',
  EMBEDDING = 'embedding',
  INDEXING = 'indexing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

enum ExtractionMethod {
  PDF_JS = 'pdf_js',
  OCR = 'ocr',
  SPEECH_TO_TEXT = 'speech_to_text',
  HTML_PARSER = 'html_parser',
  MARKDOWN_PARSER = 'markdown_parser',
  PLAIN_TEXT = 'plain_text'
}

interface ProcessingMetadata {
  extractionDuration: number;
  processingDuration: number;
  embeddingDuration: number;
  totalTokens: number;
  confidence: number;
  errors?: string[];
  warnings?: string[];
}
```

### **Database Schema**
```sql
-- Content items table
CREATE TABLE content_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id VARCHAR(500) NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    source_metadata JSONB,
    
    -- Content information
    title VARCHAR(500) NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    language VARCHAR(10) DEFAULT 'en',
    
    -- Processing information
    processing_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    processing_metadata JSONB,
    extraction_method VARCHAR(50),
    
    -- Context
    course_id UUID,
    module_id UUID,
    tags TEXT[],
    categories TEXT[],
    
    -- Versioning
    version INTEGER NOT NULL DEFAULT 1,
    parent_id UUID REFERENCES content_items(id),
    is_latest BOOLEAN NOT NULL DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Content chunks table
CREATE TABLE content_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    tokens INTEGER NOT NULL,
    
    -- Position information
    start_position INTEGER NOT NULL,
    end_position INTEGER NOT NULL,
    metadata JSONB,
    
    -- Embedding information
    embedding_model VARCHAR(100),
    embedding_dimensions INTEGER,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    embedded_at TIMESTAMP WITH TIME ZONE
);

-- Vector embeddings (separate table for performance)
CREATE TABLE content_embeddings (
    chunk_id UUID PRIMARY KEY REFERENCES content_chunks(id) ON DELETE CASCADE,
    content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    embedding VECTOR(1536), -- Adjust dimensions based on model
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Processing jobs tracking
CREATE TABLE ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID REFERENCES content_items(id),
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    priority INTEGER DEFAULT 5,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    
    -- Job data
    input_data JSONB,
    output_data JSONB,
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    next_retry_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_content_items_source ON content_items(source_type, source_id);
CREATE INDEX idx_content_items_course ON content_items(course_id);
CREATE INDEX idx_content_items_status ON content_items(processing_status);
CREATE INDEX idx_content_chunks_content ON content_chunks(content_id);
CREATE INDEX idx_ingestion_jobs_status ON ingestion_jobs(status, next_retry_at);

-- Vector similarity search index (using pgvector)
CREATE INDEX idx_content_embeddings_vector ON content_embeddings 
USING hnsw (embedding vector_cosine_ops);
```

---

## 🔌 **API Specification**

### **Content Ingestion Endpoints**

#### **Ingest from File**
```http
POST /api/v1/ingestion/file
Authorization: Bearer <jwt-token>

Request Body:
{
  "fileId": "file-uuid",
  "courseId": "course-uuid",
  "moduleId": "module-uuid",
  "title": "Content Title",
  "description": "Content description",
  "tags": ["tag1", "tag2"],
  "categories": ["category1"],
  "priority": 5,
  "extractionMethod": "auto" // auto | pdf_js | ocr | speech_to_text
}

Response: 202 Accepted
{
  "contentId": "content-uuid",
  "jobId": "job-uuid",
  "status": "pending",
  "estimatedDuration": 300,
  "message": "Content ingestion started"
}
```

#### **Ingest from URL**
```http
POST /api/v1/ingestion/url
Authorization: Bearer <jwt-token>

Request Body:
{
  "url": "https://example.com/content",
  "courseId": "course-uuid",
  "title": "Web Content",
  "extractionMethod": "html_parser",
  "followLinks": false,
  "maxDepth": 1
}

Response: 202 Accepted
{
  "contentId": "content-uuid",
  "jobId": "job-uuid",
  "status": "pending"
}
```

#### **Ingest YouTube Video**
```http
POST /api/v1/ingestion/youtube
Authorization: Bearer <jwt-token>

Request Body:
{
  "videoId": "youtube-video-id",
  "courseId": "course-uuid",
  "extractTranscript": true,
  "extractMetadata": true,
  "language": "en"
}

Response: 202 Accepted
```

#### **Ingest GitHub Repository**
```http
POST /api/v1/ingestion/github
Authorization: Bearer <jwt-token>

Request Body:
{
  "repository": "owner/repo",
  "branch": "main",
  "paths": ["README.md", "docs/"],
  "includeCode": false,
  "courseId": "course-uuid"
}

Response: 202 Accepted
```

#### **Manual Content Input**
```http
POST /api/v1/ingestion/manual
Authorization: Bearer <jwt-token>

Request Body:
{
  "title": "Manual Content",
  "content": "Content text...",
  "contentType": "text/plain",
  "courseId": "course-uuid",
  "tags": ["manual"],
  "language": "en"
}

Response: 201 Created
{
  "contentId": "content-uuid",
  "status": "processing"
}
```

### **Content Management Endpoints**

#### **Get Content Details**
```http
GET /api/v1/ingestion/content/{contentId}
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "id": "content-uuid",
  "title": "Content Title",
  "description": "Description",
  "processingStatus": "completed",
  "totalChunks": 15,
  "sourceType": "file",
  "courseId": "course-uuid",
  "tags": ["tag1", "tag2"],
  "processingMetadata": {
    "extractionDuration": 30000,
    "totalTokens": 5000,
    "confidence": 0.95
  },
  "createdAt": "2024-01-01T00:00:00Z",
  "processedAt": "2024-01-01T00:05:00Z"
}
```

#### **List Content Items**
```http
GET /api/v1/ingestion/content
Authorization: Bearer <jwt-token>

Query Parameters:
- courseId?: string
- status?: ProcessingStatus
- sourceType?: ContentSourceType
- page?: number (default: 1)
- limit?: number (default: 20)

Response: 200 OK
{
  "content": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

#### **Get Content Chunks**
```http
GET /api/v1/ingestion/content/{contentId}/chunks
Authorization: Bearer <jwt-token>

Query Parameters:
- page?: number
- limit?: number
- includeEmbeddings?: boolean (default: false)

Response: 200 OK
{
  "chunks": [
    {
      "id": "chunk-uuid",
      "chunkIndex": 0,
      "text": "Chunk content...",
      "tokens": 150,
      "metadata": {
        "section": "Introduction",
        "page": 1
      },
      "embeddedAt": "2024-01-01T00:05:30Z"
    }
  ],
  "totalChunks": 15
}
```

#### **Reprocess Content**
```http
POST /api/v1/ingestion/content/{contentId}/reprocess
Authorization: Bearer <jwt-token>

Request Body:
{
  "steps": ["chunking", "embedding"], // Steps to reprocess
  "force": false
}

Response: 202 Accepted
{
  "jobId": "job-uuid",
  "message": "Reprocessing initiated"
}
```

#### **Delete Content**
```http
DELETE /api/v1/ingestion/content/{contentId}
Authorization: Bearer <jwt-token>

Query Parameters:
- deleteEmbeddings?: boolean (default: true)
- deleteFromSearch?: boolean (default: true)

Response: 204 No Content
```

### **Job Management Endpoints**

#### **Get Job Status**
```http
GET /api/v1/ingestion/jobs/{jobId}
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "id": "job-uuid",
  "contentId": "content-uuid",
  "jobType": "content_extraction",
  "status": "processing",
  "progress": 75,
  "attempts": 1,
  "maxAttempts": 3,
  "startedAt": "2024-01-01T00:01:00Z",
  "estimatedCompletion": "2024-01-01T00:05:00Z",
  "outputData": {
    "extractedTokens": 1500,
    "chunksCreated": 10
  }
}
```

#### **List Jobs**
```http
GET /api/v1/ingestion/jobs
Authorization: Bearer <jwt-token>

Query Parameters:
- status?: string
- jobType?: string
- contentId?: string

Response: 200 OK
{
  "jobs": [...],
  "pagination": {...}
}
```

#### **Retry Failed Job**
```http
POST /api/v1/ingestion/jobs/{jobId}/retry
Authorization: Bearer <jwt-token>

Response: 202 Accepted
{
  "message": "Job retry initiated"
}
```

### **Admin Endpoints**

#### **Processing Statistics**
```http
GET /api/v1/admin/ingestion/stats
Authorization: Bearer <admin-jwt-token>

Response: 200 OK
{
  "totalContent": 10000,
  "processingStats": {
    "pending": 50,
    "processing": 25,
    "completed": 9800,
    "failed": 125
  },
  "sourceTypeBreakdown": {
    "file": 5000,
    "url": 2000,
    "youtube": 1500,
    "manual": 1500
  },
  "averageProcessingTime": 45000,
  "totalTokensProcessed": 50000000,
  "embeddingsGenerated": 250000
}
```

#### **Bulk Operations**
```http
POST /api/v1/admin/ingestion/bulk-reprocess
Authorization: Bearer <admin-jwt-token>

Request Body:
{
  "filters": {
    "courseId": "course-uuid",
    "status": "failed",
    "createdAfter": "2024-01-01T00:00:00Z"
  },
  "steps": ["embedding"],
  "batchSize": 100
}

Response: 202 Accepted
{
  "batchId": "batch-uuid",
  "totalItems": 500,
  "estimatedDuration": 3600
}
```

---

## 🔄 **Processing Pipeline**

### **Content Extraction Workers**

#### **File Content Extractor**
```typescript
class FileContentExtractor {
  async extractFromFile(fileId: string, method: ExtractionMethod): Promise<ExtractionResult> {
    const file = await this.fileService.getFile(fileId);
    
    switch (file.mimeType) {
      case 'application/pdf':
        return this.extractFromPDF(file, method);
      case 'image/*':
        return this.extractFromImage(file);
      case 'video/*':
        return this.extractFromVideo(file);
      case 'audio/*':
        return this.extractFromAudio(file);
      default:
        return this.extractPlainText(file);
    }
  }
  
  private async extractFromPDF(file: FileBuffer, method: ExtractionMethod): Promise<ExtractionResult> {
    if (method === ExtractionMethod.OCR) {
      return this.ocrExtractor.extract(file);
    }
    
    // Use PDF.js for text extraction
    const pdf = await pdfjsLib.getDocument(file.buffer).promise;
    let content = '';
    const metadata: ChunkMetadata[] = [];
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      
      content += pageText + '\n\n';
      metadata.push({
        page: i,
        section: `Page ${i}`,
        confidence: 1.0
      });
    }
    
    return {
      content,
      metadata,
      extractionMethod: ExtractionMethod.PDF_JS,
      confidence: 1.0
    };
  }
  
  private async extractFromVideo(file: FileBuffer): Promise<ExtractionResult> {
    // Extract audio using FFmpeg
    const audioBuffer = await this.extractAudio(file);
    
    // Use Whisper for speech-to-text
    const transcription = await this.whisperService.transcribe(audioBuffer);
    
    return {
      content: transcription.text,
      metadata: transcription.segments.map(segment => ({
        timestamp: segment.start,
        confidence: segment.confidence,
        speaker: segment.speaker
      })),
      extractionMethod: ExtractionMethod.SPEECH_TO_TEXT,
      confidence: transcription.confidence
    };
  }
}
```

#### **Web Content Extractor**
```typescript
class WebContentExtractor {
  async extractFromURL(url: string, options: WebExtractionOptions): Promise<ExtractionResult> {
    const response = await this.httpClient.get(url);
    const contentType = response.headers['content-type'];
    
    if (contentType.includes('text/html')) {
      return this.extractFromHTML(response.data, url);
    } else if (contentType.includes('application/json')) {
      return this.extractFromJSON(response.data);
    } else {
      return this.extractPlainText(response.data);
    }
  }
  
  private async extractFromHTML(html: string, baseUrl: string): Promise<ExtractionResult> {
    const $ = cheerio.load(html);
    
    // Remove script and style elements
    $('script, style, nav, footer, aside').remove();
    
    // Extract title
    const title = $('title').text() || $('h1').first().text();
    
    // Extract main content
    const content = $('main, article, .content, #content').text() || $('body').text();
    
    // Extract metadata
    const description = $('meta[name="description"]').attr('content');
    const keywords = $('meta[name="keywords"]').attr('content');
    
    return {
      content: this.cleanText(content),
      title,
      description,
      metadata: [{
        section: 'Web Page',
        url: baseUrl,
        keywords: keywords?.split(',') || []
      }],
      extractionMethod: ExtractionMethod.HTML_PARSER,
      confidence: 0.9
    };
  }
}
```

### **Content Processing Pipeline**
```typescript
class ContentProcessor {
  async processContent(contentId: string): Promise<void> {
    const content = await this.contentRepository.findById(contentId);
    
    try {
      // Step 1: Normalize content
      await this.normalizeContent(content);
      
      // Step 2: Chunk content
      const chunks = await this.chunkContent(content);
      
      // Step 3: Generate embeddings
      await this.generateEmbeddings(chunks);
      
      // Step 4: Store in vector database
      await this.storeEmbeddings(chunks);
      
      // Step 5: Index for search
      await this.indexForSearch(content, chunks);
      
      // Step 6: Publish events
      await this.publishContentProcessed(content);
      
      // Update status
      await this.contentRepository.updateStatus(contentId, ProcessingStatus.COMPLETED);
      
    } catch (error) {
      await this.handleProcessingError(contentId, error);
    }
  }
  
  private async chunkContent(content: ContentItem): Promise<ContentChunk[]> {
    const chunks: ContentChunk[] = [];
    const chunkSize = this.config.chunkSize; // 500 tokens
    const overlap = this.config.chunkOverlap; // 50 tokens
    
    const sentences = this.sentenceSplitter.split(content.content);
    let currentChunk = '';
    let currentTokens = 0;
    let chunkIndex = 0;
    let startPosition = 0;
    
    for (const sentence of sentences) {
      const sentenceTokens = this.tokenizer.count(sentence);
      
      if (currentTokens + sentenceTokens > chunkSize && currentChunk) {
        // Create chunk
        const chunk = this.createChunk(
          content.id,
          chunkIndex++,
          currentChunk,
          currentTokens,
          startPosition,
          startPosition + currentChunk.length
        );
        chunks.push(chunk);
        
        // Start new chunk with overlap
        const overlapText = this.getOverlapText(currentChunk, overlap);
        currentChunk = overlapText + sentence;
        currentTokens = this.tokenizer.count(currentChunk);
        startPosition += currentChunk.length - overlapText.length;
      } else {
        currentChunk += sentence;
        currentTokens += sentenceTokens;
      }
    }
    
    // Add final chunk
    if (currentChunk) {
      chunks.push(this.createChunk(
        content.id,
        chunkIndex,
        currentChunk,
        currentTokens,
        startPosition,
        startPosition + currentChunk.length
      ));
    }
    
    return chunks;
  }
  
  private async generateEmbeddings(chunks: ContentChunk[]): Promise<void> {
    const batchSize = 10;
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map(chunk => chunk.text);
      
      try {
        const embeddings = await this.llmGateway.generateEmbeddings({
          texts,
          model: this.config.embeddingModel
        });
        
        for (let j = 0; j < batch.length; j++) {
          batch[j].embedding = embeddings[j];
          batch[j].embeddingModel = this.config.embeddingModel;
          batch[j].embeddingDimensions = embeddings[j].length;
        }
        
      } catch (error) {
        this.logger.error('Embedding generation failed', { error, chunkIds: batch.map(c => c.id) });
        throw error;
      }
    }
  }
}
```

### **External Service Adapters**

#### **YouTube Adapter**
```typescript
class YouTubeAdapter {
  async ingestVideo(videoId: string, options: YouTubeIngestionOptions): Promise<ContentItem> {
    // Get video metadata
    const metadata = await this.youtubeApi.getVideoMetadata(videoId);
    
    // Download transcript if available
    let transcript = '';
    if (options.extractTranscript) {
      transcript = await this.getTranscript(videoId, options.language);
    }
    
    // If no transcript, download audio and transcribe
    if (!transcript && options.extractAudio) {
      const audioUrl = await this.getAudioUrl(videoId);
      const audioBuffer = await this.downloadAudio(audioUrl);
      const transcription = await this.whisperService.transcribe(audioBuffer);
      transcript = transcription.text;
    }
    
    return {
      id: uuidv4(),
      sourceId: videoId,
      sourceType: ContentSourceType.YOUTUBE,
      sourceMetadata: {
        url: `https://youtube.com/watch?v=${videoId}`,
        duration: metadata.duration,
        viewCount: metadata.viewCount,
        publishedAt: metadata.publishedAt
      },
      title: metadata.title,
      description: metadata.description,
      content: transcript,
      contentType: 'text/plain',
      language: options.language || 'en',
      tags: metadata.tags || [],
      processingStatus: ProcessingStatus.EXTRACTING
    };
  }
}
```

#### **GitHub Adapter**
```typescript
class GitHubAdapter {
  async ingestRepository(repository: string, options: GitHubIngestionOptions): Promise<ContentItem[]> {
    const contents: ContentItem[] = [];
    
    for (const path of options.paths) {
      const files = await this.githubApi.getRepositoryContents(repository, path, options.branch);
      
      for (const file of files) {
        if (this.shouldProcessFile(file, options)) {
          const content = await this.processGitHubFile(repository, file, options);
          contents.push(content);
        }
      }
    }
    
    return contents;
  }
  
  private async processGitHubFile(repository: string, file: GitHubFile, options: GitHubIngestionOptions): Promise<ContentItem> {
    const fileContent = await this.githubApi.getFileContent(repository, file.path);
    
    return {
      id: uuidv4(),
      sourceId: `${repository}:${file.path}`,
      sourceType: ContentSourceType.GITHUB,
      sourceMetadata: {
        repository,
        path: file.path,
        branch: options.branch,
        sha: file.sha,
        size: file.size
      },
      title: file.name,
      content: fileContent,
      contentType: this.getContentType(file.name),
      language: 'en',
      processingStatus: ProcessingStatus.PROCESSING
    };
  }
}
```

---

## 🔄 **Event Integration**

### **Published Events**
```typescript
enum ContentIngestionEventType {
  CONTENT_INGESTION_STARTED = 'content.ingestion.started',
  CONTENT_EXTRACTED = 'content.extracted',
  CONTENT_CHUNKED = 'content.chunked',
  CONTENT_EMBEDDED = 'content.embedded',
  CONTENT_INDEXED = 'content.indexed',
  CONTENT_INGESTION_COMPLETED = 'content.ingestion.completed',
  CONTENT_INGESTION_FAILED = 'content.ingestion.failed',
  CONTENT_UPDATED = 'content.updated',
  CONTENT_DELETED = 'content.deleted'
}

class ContentIngestionEventPublisher {
  async publishContentProcessed(content: ContentItem): Promise<void> {
    await this.eventBus.publish(ContentIngestionEventType.CONTENT_INGESTION_COMPLETED, {
      contentId: content.id,
      sourceType: content.sourceType,
      courseId: content.courseId,
      totalChunks: content.totalChunks,
      processingMetadata: content.processingMetadata,
      timestamp: new Date()
    });
  }
  
  async publishContentEmbedded(contentId: string, chunkCount: number): Promise<void> {
    await this.eventBus.publish(ContentIngestionEventType.CONTENT_EMBEDDED, {
      contentId,
      chunkCount,
      embeddingModel: this.config.embeddingModel,
      timestamp: new Date()
    });
  }
}
```

### **Consumed Events**
```typescript
// Handle file uploaded events
class FileUploadedHandler {
  async handle(event: FileUploadedEvent): Promise<void> {
    // Check if file should be auto-ingested
    if (this.shouldAutoIngest(event.mimeType, event.courseId)) {
      await this.contentIngestionService.ingestFromFile({
        fileId: event.fileId,
        courseId: event.courseId,
        title: event.originalName,
        priority: 5
      });
    }
  }
}

// Handle course deleted events
class CourseDeletedHandler {
  async handle(event: CourseDeletedEvent): Promise<void> {
    // Delete all content associated with the course
    await this.contentRepository.deleteByFilter({
      courseId: event.courseId
    });
    
    // Delete embeddings
    await this.vectorDatabase.deleteByFilter({
      courseId: event.courseId
    });
  }
}
```

---

## ⚙️ **Configuration**

### **Environment Variables**
```bash
# Server Configuration
PORT=3007
NODE_ENV=production
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/lms_content
REDIS_URL=redis://redis:6379
VECTOR_DB_URL=postgresql://user:pass@postgres:5432/lms_vectors

# External Services
LLM_GATEWAY_URL=http://llm-gateway:3010
FILE_SERVICE_URL=http://file-service:3005
SEARCH_SERVICE_URL=http://search-service:3008

# Processing Configuration
CHUNK_SIZE=500
CHUNK_OVERLAP=50
MAX_CONCURRENT_JOBS=5
BATCH_SIZE=10
EMBEDDING_MODEL=text-embedding-ada-002

# Content Extraction
ENABLE_OCR=true
ENABLE_SPEECH_TO_TEXT=true
WHISPER_MODEL=base
TESSERACT_LANG=eng

# External APIs
YOUTUBE_API_KEY=your-youtube-api-key
GITHUB_TOKEN=your-github-token

# Job Queue
QUEUE_REDIS_URL=redis://redis:6379
JOB_CONCURRENCY=10
JOB_RETRY_ATTEMPTS=3
JOB_RETRY_DELAY=5000

# Event Bus
KAFKA_BROKERS=kafka:9092
KAFKA_CLIENT_ID=content-ingestion-service
KAFKA_GROUP_ID=content-ingestion-group
```

### **Processing Configuration**
```typescript
interface ProcessingConfig {
  chunking: {
    defaultSize: number;
    overlap: number;
    minChunkSize: number;
    maxChunkSize: number;
  };
  embedding: {
    model: string;
    dimensions: number;
    batchSize: number;
    timeout: number;
  };
  extraction: {
    enabledMethods: ExtractionMethod[];
    confidenceThreshold: number;
    timeoutMs: number;
  };
  jobs: {
    concurrency: number;
    retryAttempts: number;
    retryDelay: number;
  };
}
```

---

## 📊 **Monitoring & Observability**

### **Metrics**
```typescript
const metrics = {
  contentProcessingDuration: new promClient.Histogram({
    name: 'content_ingestion_processing_duration_seconds',
    help: 'Content processing duration',
    labelNames: ['source_type', 'extraction_method', 'status']
  }),
  
  chunksGenerated: new promClient.Counter({
    name: 'content_ingestion_chunks_total',
    help: 'Total chunks generated',
    labelNames: ['content_type', 'source_type']
  }),
  
  embeddingsGenerated: new promClient.Counter({
    name: 'content_ingestion_embeddings_total',
    help: 'Total embeddings generated',
    labelNames: ['model', 'status']
  }),
  
  jobQueueSize: new promClient.Gauge({
    name: 'content_ingestion_job_queue_size',
    help: 'Job queue size',
    labelNames: ['job_type', 'status']
  })
};
```

---

## 🎯 **Success Criteria**

### **Functional Requirements**
- ✅ Support multiple content sources (files, URLs, YouTube, GitHub)
- ✅ Accurate text extraction from various formats
- ✅ Intelligent content chunking with context preservation
- ✅ High-quality embedding generation
- ✅ Efficient vector storage and retrieval
- ✅ Real-time processing status tracking
- ✅ Event-driven integration with other services

### **Non-Functional Requirements**
- ✅ Process 1000+ documents per hour
- ✅ 99.5% uptime availability
- ✅ < 5 minutes processing time for typical documents
- ✅ Support for 50+ languages
- ✅ Scalable vector storage (millions of embeddings)
- ✅ Comprehensive error handling and recovery

---

This specification provides a complete blueprint for building a production-grade Content Ingestion Service that processes educational content, generates embeddings, and prepares data for RAG-based search operations. 
