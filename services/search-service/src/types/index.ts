import { z } from 'zod';

// Enums
export enum SearchType {
  FULL_TEXT = 'full_text',
  SEMANTIC = 'semantic',
  HYBRID = 'hybrid',
  RAG = 'rag',
  AUTOCOMPLETE = 'autocomplete',
  FACETED = 'faceted'
}

export enum ContentType {
  COURSE = 'course',
  MODULE = 'module',
  CONTENT = 'content',
  FILE = 'file',
  DISCUSSION = 'discussion',
  ASSIGNMENT = 'assignment',
  QUIZ = 'quiz',
  ANNOUNCEMENT = 'announcement'
}

export enum SearchSortBy {
  RELEVANCE = 'relevance',
  DATE = 'date',
  TITLE = 'title',
  POPULARITY = 'popularity',
  RATING = 'rating'
}

// Zod Schemas
export const SearchFiltersSchema = z.object({
  courseIds: z.array(z.string().uuid()).optional(),
  moduleIds: z.array(z.string().uuid()).optional(),
  contentTypes: z.array(z.nativeEnum(ContentType)).optional(),
  tags: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  dateRange: z.object({
    from: z.date(),
    to: z.date(),
  }).optional(),
  language: z.string().optional(),
  difficulty: z.array(z.string()).optional(),
  authors: z.array(z.string()).optional(),
  minScore: z.number().min(0).max(1).optional(),
});

export const SearchOptionsSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  includeHighlights: z.boolean().default(true),
  includeFacets: z.boolean().default(false),
  includeRAG: z.boolean().default(false),
  minScore: z.number().min(0).max(1).optional(),
  sortBy: z.nativeEnum(SearchSortBy).default(SearchSortBy.RELEVANCE),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const SearchContextSchema = z.object({
  userId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  sessionId: z.string().optional(),
  previousQueries: z.array(z.string()).optional(),
  userPreferences: z.record(z.any()).optional(),
});

export const SearchRequestSchema = z.object({
  query: z.string().min(1),
  type: z.nativeEnum(SearchType).default(SearchType.HYBRID),
  filters: SearchFiltersSchema.optional(),
  options: SearchOptionsSchema.optional(),
  context: SearchContextSchema.optional(),
});

export const RAGSourceSchema = z.object({
  contentId: z.string().uuid(),
  chunkId: z.string().uuid(),
  text: z.string(),
  relevanceScore: z.number(),
  metadata: z.object({
    title: z.string(),
    courseId: z.string().uuid().optional(),
    moduleId: z.string().uuid().optional(),
    page: z.number().optional(),
    timestamp: z.number().optional(),
    section: z.string().optional(),
  }),
});

export const RAGResponseSchema = z.object({
  answer: z.string(),
  sources: z.array(RAGSourceSchema),
  confidence: z.number(),
  model: z.string(),
  reasoning: z.string().optional(),
  followUpQuestions: z.array(z.string()).optional(),
});

export const SearchResultSourceSchema = z.object({
  type: z.nativeEnum(ContentType),
  id: z.string().uuid(),
  url: z.string(),
  thumbnail: z.string().optional(),
  metadata: z.record(z.any()),
});

export const SearchResultSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(ContentType),
  title: z.string(),
  description: z.string(),
  content: z.string().optional(),
  highlights: z.array(z.string()),
  score: z.number(),
  relevanceScore: z.number(),
  semanticScore: z.number().optional(),
  source: SearchResultSourceSchema,
  courseId: z.string().uuid().optional(),
  moduleId: z.string().uuid().optional(),
  tags: z.array(z.string()),
  categories: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const SearchFacetValueSchema = z.object({
  value: z.string(),
  count: z.number(),
  selected: z.boolean().default(false),
});

export const SearchFacetSchema = z.object({
  field: z.string(),
  values: z.array(SearchFacetValueSchema),
});

export const SearchMetadataSchema = z.object({
  totalResults: z.number(),
  searchTime: z.number(),
  searchId: z.string().uuid(),
  strategies: z.array(z.string()),
  cacheHit: z.boolean().default(false),
});

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  totalResults: z.number(),
  searchTime: z.number(),
  searchId: z.string().uuid(),
  suggestions: z.array(z.string()).optional(),
  facets: z.array(SearchFacetSchema).optional(),
  ragResponse: RAGResponseSchema.optional(),
  metadata: SearchMetadataSchema,
});

// Type definitions
export type SearchFilters = z.infer<typeof SearchFiltersSchema>;
export type SearchOptions = z.infer<typeof SearchOptionsSchema>;
export type SearchContext = z.infer<typeof SearchContextSchema>;
export type SearchRequest = z.infer<typeof SearchRequestSchema>;
export type RAGSource = z.infer<typeof RAGSourceSchema>;
export type RAGResponse = z.infer<typeof RAGResponseSchema>;
export type SearchResultSource = z.infer<typeof SearchResultSourceSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchFacet = z.infer<typeof SearchFacetSchema>;
export type SearchFacetValue = z.infer<typeof SearchFacetValueSchema>;
export type SearchMetadata = z.infer<typeof SearchMetadataSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

// Additional interfaces
export interface ProcessedQuery {
  originalQuery: string;
  expandedQuery: string;
  tokens: string[];
  strategy: SearchType;
  filters: SearchFilters;
  options: SearchOptions;
  context: SearchContext;
  searchId: string;
}

export interface RAGContext {
  text: string;
  metadata: {
    contentId: string;
    chunkId: string;
    title: string;
    courseId?: string;
    moduleId?: string;
    section?: string;
    page?: number;
    timestamp?: number;
  };
  relevanceScore: number;
}

export interface VectorSearchRequest {
  vector: number[];
  limit?: number;
  threshold?: number;
  filters?: SearchFilters;
}

export interface VectorSearchResult {
  id: string;
  contentId: string;
  chunkId: string;
  text: string;
  similarity: number;
  metadata: Record<string, any>;
}

export interface ElasticsearchDocument {
  id: string;
  type: ContentType;
  title: string;
  description: string;
  content: string;
  courseId?: string;
  moduleId?: string;
  tags: string[];
  categories: string[];
  language: string;
  difficulty?: string;
  author?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, any>;
}

export interface IndexingJob {
  id: string;
  type: 'index' | 'update' | 'delete';
  documentId: string;
  document?: ElasticsearchDocument;
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  scheduledAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface SearchAnalytics {
  queryId: string;
  query: string;
  searchType: SearchType;
  userId?: string;
  sessionId?: string;
  totalResults: number;
  searchTime: number;
  clickedResults: number;
  filters: SearchFilters;
  context: SearchContext;
  timestamp: Date;
}

export interface UserSearchPreferences {
  preferredContentTypes: ContentType[];
  preferredLanguages: string[];
  searchFilters: Partial<SearchFilters>;
  ragEnabled: boolean;
  semanticSearchEnabled: boolean;
}

export interface SearchSuggestion {
  text: string;
  frequency: number;
  category: 'query' | 'topic' | 'course' | 'content';
  contextTags: string[];
}

export interface AutocompleteRequest {
  query: string;
  limit?: number;
  context?: {
    courseId?: string;
    contentTypes?: ContentType[];
  };
}

export interface AutocompleteResponse {
  suggestions: SearchSuggestion[];
  searchTime: number;
}

// LLM Gateway Integration Types
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

export interface LLMGatewayCompletionRequest {
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface LLMGatewayCompletionResponse {
  text: string;
  model: string;
  confidence?: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Error Types
export class SearchError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'SearchError';
  }
}

export class ElasticsearchError extends SearchError {
  constructor(message: string, details?: any) {
    super(message, 'ELASTICSEARCH_ERROR', 502, details);
    this.name = 'ElasticsearchError';
  }
}

export class VectorSearchError extends SearchError {
  constructor(message: string, details?: any) {
    super(message, 'VECTOR_SEARCH_ERROR', 502, details);
    this.name = 'VectorSearchError';
  }
}

export class RAGError extends SearchError {
  constructor(message: string, details?: any) {
    super(message, 'RAG_ERROR', 502, details);
    this.name = 'RAGError';
  }
}

export class QueryProcessingError extends SearchError {
  constructor(message: string, details?: any) {
    super(message, 'QUERY_PROCESSING_ERROR', 400, details);
    this.name = 'QueryProcessingError';
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

// Search Strategy Interface
export interface SearchStrategy {
  name: string;
  search(query: ProcessedQuery): Promise<SearchResult[]>;
  canHandle(query: ProcessedQuery): boolean;
  priority: number;
}

// Search Result Fusion Interface
export interface ResultFusion {
  fuse(results: SearchResult[][], query: ProcessedQuery): Promise<SearchResult[]>;
}

// Cache Interface
export interface SearchCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
}

// Event Types
export enum SearchEventType {
  SEARCH_PERFORMED = 'search.performed',
  SEARCH_RESULTS_CLICKED = 'search.results.clicked',
  RAG_INTERACTION = 'search.rag.interaction',
  SEARCH_FEEDBACK = 'search.feedback',
  INDEX_UPDATED = 'search.index.updated',
  AUTOCOMPLETE_USED = 'search.autocomplete.used'
}

export interface SearchEvent {
  type: SearchEventType;
  searchId: string;
  userId?: string;
  query?: string;
  results?: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}
