// Search-related type definitions

// Content types that can be searched
export type SearchableContentType = 'course' | 'user' | 'assessment' | 'file' | 'all';

// Search query interface
export interface SearchQuery {
  query: string;
  types?: SearchableContentType[];
  filters?: SearchFilters;
  sort?: SearchSort;
  pagination?: SearchPagination;
  userId?: string;
  requestId?: string;
}

// Search filters
export interface SearchFilters {
  categories?: string[];
  subcategories?: string[];
  difficulty?: string[];
  instructors?: string[];
  tags?: string[];
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  priceRange?: {
    min?: number;
    max?: number;
  };
  rating?: {
    min?: number;
    max?: number;
  };
  duration?: {
    min?: number; // in minutes
    max?: number;
  };
  language?: string[];
  status?: string[];
  visibility?: string[];
}

// Search sorting options
export interface SearchSort {
  field: 'relevance' | 'date' | 'rating' | 'title' | 'popularity' | 'price' | 'duration';
  order: 'asc' | 'desc';
}

// Search pagination
export interface SearchPagination {
  from: number;
  size: number;
}

// Search result interface
export interface SearchResult {
  id: string;
  type: SearchableContentType;
  title: string;
  description?: string;
  content?: string;
  url?: string;
  thumbnailUrl?: string;
  score: number;
  highlights?: SearchHighlight[];
  metadata: SearchResultMetadata;
}

// Search highlights for matched text
export interface SearchHighlight {
  field: string;
  fragments: string[];
}

// Metadata for search results
export interface SearchResultMetadata {
  // Common metadata
  createdAt: Date;
  updatedAt: Date;
  
  // Course-specific metadata
  instructor?: {
    id: string;
    name: string;
    avatar?: string;
  };
  category?: string;
  subcategory?: string;
  difficulty?: string;
  rating?: number;
  enrollmentCount?: number;
  duration?: number;
  price?: number;
  currency?: string;
  tags?: string[];
  
  // User-specific metadata
  role?: string;
  skills?: string[];
  interests?: string[];
  
  // Assessment-specific metadata
  courseId?: string;
  assessmentType?: string;
  questionCount?: number;
  
  // File-specific metadata
  fileType?: string;
  fileSize?: number;
  mimeType?: string;
  uploadedBy?: string;
}

// Complete search response
export interface SearchResponse {
  query: string;
  total: number;
  took: number; // milliseconds
  results: SearchResult[];
  facets?: SearchFacets;
  suggestions?: string[];
  pagination: {
    from: number;
    size: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Search facets for filtering
export interface SearchFacets {
  categories: FacetCount[];
  difficulties: FacetCount[];
  instructors: FacetCount[];
  tags: FacetCount[];
  types: FacetCount[];
  languages: FacetCount[];
  priceRanges: FacetCount[];
  ratings: FacetCount[];
}

// Facet count interface
export interface FacetCount {
  key: string;
  count: number;
  selected?: boolean;
}

// Auto-complete suggestion interface
export interface SearchSuggestion {
  text: string;
  type: 'query' | 'course' | 'instructor' | 'category';
  score: number;
  metadata?: {
    id?: string;
    category?: string;
    count?: number;
  };
}

// Popular search interface
export interface PopularSearch {
  query: string;
  count: number;
  trend: 'up' | 'down' | 'stable';
  categories?: string[];
}

// Search analytics event
export interface SearchAnalyticsEvent {
  id: string;
  userId?: string;
  sessionId?: string;
  query: string;
  filters?: SearchFilters;
  resultsCount: number;
  clickedResults?: string[];
  searchTime: number;
  timestamp: Date;
  userAgent?: string;
  ip?: string;
}

// Click-through event
export interface ClickThroughEvent {
  searchId: string;
  resultId: string;
  resultType: SearchableContentType;
  position: number;
  userId?: string;
  timestamp: Date;
}

// Search performance metrics
export interface SearchMetrics {
  totalSearches: number;
  averageResponseTime: number;
  popularQueries: PopularSearch[];
  clickThroughRate: number;
  zeroResultQueries: string[];
  errorRate: number;
  cacheHitRate: number;
}

// Index document base interface
export interface IndexDocument {
  id: string;
  type: SearchableContentType;
  title: string;
  description?: string;
  content?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
  status: string;
  visibility: string;
}

// Course index document
export interface CourseIndexDocument extends IndexDocument {
  type: 'course';
  instructor: {
    id: string;
    name: string;
    email: string;
  };
  category: string;
  subcategory?: string;
  difficulty: string;
  language: string;
  rating: number;
  enrollmentCount: number;
  duration: number;
  price: number;
  currency: string;
  isFree: boolean;
  modules: Array<{
    id: string;
    title: string;
    content: string;
    order: number;
  }>;
  lessons: Array<{
    id: string;
    title: string;
    content: string;
    type: string;
    order: number;
  }>;
  publishedAt?: Date;
}

// User index document
export interface UserIndexDocument extends IndexDocument {
  type: 'user';
  username: string;
  displayName: string;
  email: string;
  bio?: string;
  role: string;
  skills: string[];
  interests: string[];
  enrolledCourses: string[];
  completedCourses: string[];
  isPublic: boolean;
  lastActiveAt: Date;
}

// Assessment index document
export interface AssessmentIndexDocument extends IndexDocument {
  type: 'assessment';
  courseId: string;
  assessmentType: string;
  difficulty: string;
  questionCount: number;
  questions: Array<{
    id: string;
    text: string;
    type: string;
  }>;
}

// File index document
export interface FileIndexDocument extends IndexDocument {
  type: 'file';
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  extractedText?: string;
  uploadedBy: string;
  courseId?: string;
  moduleId?: string;
  lessonId?: string;
  uploadedAt: Date;
}

// Indexing operation interface
export interface IndexingOperation {
  operation: 'index' | 'update' | 'delete';
  index: string;
  id: string;
  document?: IndexDocument;
  timestamp: Date;
}

// Bulk indexing request
export interface BulkIndexingRequest {
  operations: IndexingOperation[];
  refresh?: boolean;
  timeout?: string;
}

// Bulk indexing response
export interface BulkIndexingResponse {
  took: number;
  errors: boolean;
  items: Array<{
    index?: {
      _id: string;
      status: number;
      error?: any;
    };
    update?: {
      _id: string;
      status: number;
      error?: any;
    };
    delete?: {
      _id: string;
      status: number;
      error?: any;
    };
  }>;
}

// Index status interface
export interface IndexStatus {
  name: string;
  health: 'green' | 'yellow' | 'red';
  status: 'open' | 'close';
  documentCount: number;
  size: string;
  lastUpdated: Date;
}

// Reindexing status
export interface ReindexStatus {
  taskId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: {
    total: number;
    processed: number;
    percentage: number;
  };
  startTime: Date;
  endTime?: Date;
  errors?: string[];
}

// Search engine interface
export interface ISearchEngine {
  search(query: SearchQuery): Promise<SearchResponse>;
  suggest(partial: string, type?: SearchableContentType): Promise<SearchSuggestion[]>;
  index(document: IndexDocument): Promise<void>;
  bulkIndex(operations: IndexingOperation[]): Promise<BulkIndexingResponse>;
  delete(index: string, id: string): Promise<void>;
  createIndex(name: string, mapping: any): Promise<void>;
  deleteIndex(name: string): Promise<void>;
  getIndexStatus(name: string): Promise<IndexStatus>;
  reindex(sourceIndex: string, targetIndex: string): Promise<ReindexStatus>;
  health(): Promise<boolean>;
}

// Cache interface for search results
export interface SearchCache {
  get(key: string): Promise<SearchResponse | null>;
  set(key: string, value: SearchResponse, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// Search configuration
export interface SearchConfig {
  maxResults: number;
  defaultSize: number;
  timeout: number;
  highlightFragmentSize: number;
  highlightMaxFragments: number;
  suggestionsSize: number;
  facetSize: number;
  enableSpellCheck: boolean;
  enablePersonalization: boolean;
  enableAnalytics: boolean;
}

export default {
  SearchQuery,
  SearchFilters,
  SearchSort,
  SearchPagination,
  SearchResult,
  SearchResponse,
  SearchFacets,
  FacetCount,
  SearchSuggestion,
  PopularSearch,
  SearchAnalyticsEvent,
  ClickThroughEvent,
  SearchMetrics,
  IndexDocument,
  CourseIndexDocument,
  UserIndexDocument,
  AssessmentIndexDocument,
  FileIndexDocument,
  IndexingOperation,
  BulkIndexingRequest,
  BulkIndexingResponse,
  IndexStatus,
  ReindexStatus,
  ISearchEngine,
  SearchCache,
  SearchConfig,
};
