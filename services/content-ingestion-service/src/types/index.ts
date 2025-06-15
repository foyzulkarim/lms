import { z } from 'zod';

// Enums
export enum ContentSourceType {
  FILE = 'file',
  URL = 'url',
  API = 'api',
  MANUAL = 'manual',
  YOUTUBE = 'youtube',
  GITHUB = 'github',
  SCORM = 'scorm'
}

export enum ProcessingStatus {
  PENDING = 'pending',
  EXTRACTING = 'extracting',
  PROCESSING = 'processing',
  CHUNKING = 'chunking',
  EMBEDDING = 'embedding',
  INDEXING = 'indexing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum ExtractionMethod {
  PDF_JS = 'pdf_js',
  OCR = 'ocr',
  SPEECH_TO_TEXT = 'speech_to_text',
  HTML_PARSER = 'html_parser',
  MARKDOWN_PARSER = 'markdown_parser',
  PLAIN_TEXT = 'plain_text',
  AUTO = 'auto'
}

export enum JobType {
  CONTENT_EXTRACTION = 'content_extraction',
  CONTENT_PROCESSING = 'content_processing',
  CONTENT_CHUNKING = 'content_chunking',
  EMBEDDING_GENERATION = 'embedding_generation',
  SEARCH_INDEXING = 'search_indexing'
}

export enum JobStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELAYED = 'delayed',
  PAUSED = 'paused'
}

// Zod Schemas
export const ChunkMetadataSchema = z.object({
  section: z.string().optional(),
  page: z.number().optional(),
  timestamp: z.number().optional(),
  speaker: z.string().optional(),
  confidence: z.number().optional(),
  url: z.string().optional(),
  keywords: z.array(z.string()).optional(),
});

export const ProcessingMetadataSchema = z.object({
  extractionDuration: z.number(),
  processingDuration: z.number(),
  embeddingDuration: z.number().optional(),
  totalTokens: z.number(),
  confidence: z.number(),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
});

export const ContentChunkSchema = z.object({
  id: z.string().uuid(),
  contentId: z.string().uuid(),
  chunkIndex: z.number(),
  text: z.string(),
  tokens: z.number(),
  startPosition: z.number(),
  endPosition: z.number(),
  metadata: ChunkMetadataSchema,
  embedding: z.array(z.number()).optional(),
  embeddingModel: z.string().optional(),
  embeddingDimensions: z.number().optional(),
  createdAt: z.date(),
  embeddedAt: z.date().optional(),
});

export const ContentItemSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string(),
  sourceType: z.nativeEnum(ContentSourceType),
  sourceMetadata: z.record(z.any()).optional(),
  title: z.string(),
  description: z.string().optional(),
  content: z.string(),
  contentType: z.string(),
  language: z.string().default('en'),
  processingStatus: z.nativeEnum(ProcessingStatus),
  processingMetadata: ProcessingMetadataSchema.optional(),
  extractionMethod: z.nativeEnum(ExtractionMethod).optional(),
  chunks: z.array(ContentChunkSchema).optional(),
  totalChunks: z.number().default(0),
  courseId: z.string().uuid().optional(),
  moduleId: z.string().uuid().optional(),
  tags: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  version: z.number().default(1),
  parentId: z.string().uuid().optional(),
  isLatest: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
  processedAt: z.date().optional(),
  deletedAt: z.date().optional(),
});

export const IngestionJobSchema = z.object({
  id: z.string().uuid(),
  contentId: z.string().uuid().optional(),
  jobType: z.nativeEnum(JobType),
  status: z.nativeEnum(JobStatus),
  priority: z.number().default(5),
  attempts: z.number().default(0),
  maxAttempts: z.number().default(3),
  inputData: z.record(z.any()).optional(),
  outputData: z.record(z.any()).optional(),
  errorMessage: z.string().optional(),
  createdAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  nextRetryAt: z.date().optional(),
});

// Type definitions
export type ChunkMetadata = z.infer<typeof ChunkMetadataSchema>;
export type ProcessingMetadata = z.infer<typeof ProcessingMetadataSchema>;
export type ContentChunk = z.infer<typeof ContentChunkSchema>;
export type ContentItem = z.infer<typeof ContentItemSchema>;
export type IngestionJob = z.infer<typeof IngestionJobSchema>;

// API Request/Response Types
export interface FileIngestionRequest {
  fileId: string;
  courseId?: string;
  moduleId?: string;
  title?: string;
  description?: string;
  tags?: string[];
  categories?: string[];
  priority?: number;
  extractionMethod?: ExtractionMethod;
}

export interface URLIngestionRequest {
  url: string;
  courseId?: string;
  moduleId?: string;
  title?: string;
  description?: string;
  extractionMethod?: ExtractionMethod;
  followLinks?: boolean;
  maxDepth?: number;
  tags?: string[];
  categories?: string[];
}

export interface YouTubeIngestionRequest {
  videoId: string;
  courseId?: string;
  moduleId?: string;
  extractTranscript?: boolean;
  extractMetadata?: boolean;
  language?: string;
  tags?: string[];
  categories?: string[];
}

export interface GitHubIngestionRequest {
  repository: string;
  branch?: string;
  paths?: string[];
  includeCode?: boolean;
  courseId?: string;
  moduleId?: string;
  tags?: string[];
  categories?: string[];
}

export interface ManualContentRequest {
  title: string;
  content: string;
  contentType?: string;
  courseId?: string;
  moduleId?: string;
  tags?: string[];
  categories?: string[];
  language?: string;
}

export interface IngestionResponse {
  contentId: string;
  jobId?: string;
  status: ProcessingStatus;
  estimatedDuration?: number;
  message: string;
}

export interface ContentListResponse {
  content: ContentItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ChunkListResponse {
  chunks: ContentChunk[];
  totalChunks: number;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface JobResponse {
  id: string;
  contentId?: string;
  jobType: JobType;
  status: JobStatus;
  progress?: number;
  attempts: number;
  maxAttempts: number;
  startedAt?: Date;
  estimatedCompletion?: Date;
  outputData?: Record<string, any>;
  errorMessage?: string;
}

export interface ProcessingStatsResponse {
  totalContent: number;
  processingStats: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  sourceTypeBreakdown: Record<ContentSourceType, number>;
  averageProcessingTime: number;
  totalTokensProcessed: number;
  embeddingsGenerated: number;
}

// Extraction Result Types
export interface ExtractionResult {
  content: string;
  title?: string;
  description?: string;
  metadata?: ChunkMetadata[];
  extractionMethod: ExtractionMethod;
  confidence: number;
  language?: string;
  contentType?: string;
}

// External Service Types
export interface FileServiceFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  buffer?: Buffer;
}

export interface LLMGatewayEmbeddingRequest {
  texts: string[];
  model?: string;
}

export interface LLMGatewayEmbeddingResponse {
  embeddings: number[][];
  model: string;
  usage: {
    totalTokens: number;
  };
}

// Event Types
export enum ContentIngestionEventType {
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

export interface ContentIngestionEvent {
  type: ContentIngestionEventType;
  contentId: string;
  sourceType: ContentSourceType;
  courseId?: string;
  moduleId?: string;
  totalChunks?: number;
  processingMetadata?: ProcessingMetadata;
  timestamp: Date;
  userId?: string;
}

// Error Types
export class ContentIngestionError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'ContentIngestionError';
  }
}

export class ExtractionError extends ContentIngestionError {
  constructor(message: string, details?: any) {
    super(message, 'EXTRACTION_ERROR', 422, details);
    this.name = 'ExtractionError';
  }
}

export class ProcessingError extends ContentIngestionError {
  constructor(message: string, details?: any) {
    super(message, 'PROCESSING_ERROR', 500, details);
    this.name = 'ProcessingError';
  }
}

export class EmbeddingError extends ContentIngestionError {
  constructor(message: string, details?: any) {
    super(message, 'EMBEDDING_ERROR', 502, details);
    this.name = 'EmbeddingError';
  }
}

// User Context (from JWT)
export interface UserContext {
  id: string;
  email: string;
  role: 'admin' | 'instructor' | 'student';
  organizationId?: string;
  permissions: string[];
}

// Fastify Request Extensions
declare module 'fastify' {
  interface FastifyRequest {
    user?: UserContext;
  }
}
