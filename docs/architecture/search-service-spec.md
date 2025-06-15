# Search Service Technical Specification

## 🎯 **Service Overview**

The Search Service provides both traditional full-text search and advanced RAG (Retrieval-Augmented Generation) capabilities for the LMS platform. It combines keyword-based searching with semantic similarity search to deliver highly relevant and intelligent search results.

### **Core Responsibilities**
- Full-text search across courses, content, and metadata
- Semantic search using vector embeddings
- Hybrid search combining traditional and semantic approaches
- RAG-based question answering and content recommendations
- Search result ranking and relevance scoring
- Search analytics and user behavior tracking
- Auto-complete and search suggestions
- Faceted search and advanced filtering
- Real-time search indexing

### **Service Characteristics**
- **Technology Stack:** Node.js + Fastify + TypeScript
- **Search Engine:** Elasticsearch/OpenSearch for full-text + Vector search
- **Vector Database:** PostgreSQL with pgvector
- **Cache:** Redis for search results and suggestions
- **ML Integration:** LLM Gateway for RAG responses
- **Queue:** Background indexing jobs

---

## 🏗️ **Architecture Design**

### **High-Level Architecture**
```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│   API Gateway   │────│   Search Service     │────│  LLM Gateway    │
│   Client Apps   │    │                      │    │                 │
└─────────────────┘    └──────────────────────┘    └─────────────────┘
                              │
                    ┌─────────┼─────────────┐
                    │         │             │
            ┌───────▼───┐ ┌──▼──▼────┐ ┌────▼─────────┐
            │Elasticsearch│ │Vector DB │ │    Cache     │
            │(Full-text)  │ │(Semantic)│ │   (Redis)    │
            └─────────────┘ └──────────┘ └──────────────┘
```

### **Search Flow Architecture**
```
User Query → Query Analysis → Multi-Strategy Search → Result Fusion → 
Ranking & Scoring → RAG Enhancement → Response Generation → Analytics
```

---

## 📊 **Data Models**

### **Search Models**
```typescript
interface SearchRequest {
  query: string;
  type: SearchType;
  filters?: SearchFilters;
  options?: SearchOptions;
  context?: SearchContext;
}

interface SearchResponse {
  results: SearchResult[];
  totalResults: number;
  searchTime: number;
  searchId: string;
  suggestions?: string[];
  facets?: SearchFacet[];
  ragResponse?: RAGResponse;
  metadata: SearchMetadata;
}

interface SearchResult {
  id: string;
  type: ContentType;
  title: string;
  description: string;
  content?: string;
  highlights: string[];
  score: number;
  relevanceScore: number;
  semanticScore?: number;
  
  // Source information
  source: SearchResultSource;
  
  // Context
  courseId?: string;
  moduleId?: string;
  tags: string[];
  categories: string[];
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

interface SearchResultSource {
  type: 'course' | 'module' | 'content' | 'file' | 'discussion';
  id: string;
  url: string;
  thumbnail?: string;
  metadata: Record<string, any>;
}

interface RAGResponse {
  answer: string;
  sources: RAGSource[];
  confidence: number;
  model: string;
  reasoning?: string;
  followUpQuestions?: string[];
}

interface RAGSource {
  contentId: string;
  chunkId: string;
  text: string;
  relevanceScore: number;
  metadata: {
    title: string;
    courseId?: string;
    moduleId?: string;
    page?: number;
    timestamp?: number;
  };
}

enum SearchType {
  FULL_TEXT = 'full_text',
  SEMANTIC = 'semantic',
  HYBRID = 'hybrid',
  RAG = 'rag',
  AUTOCOMPLETE = 'autocomplete',
  FACETED = 'faceted'
}

interface SearchFilters {
  courseIds?: string[];
  moduleIds?: string[];
  contentTypes?: ContentType[];
  tags?: string[];
  categories?: string[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  language?: string;
  difficulty?: string[];
  authors?: string[];
}

interface SearchOptions {
  page?: number;
  limit?: number;
  includeHighlights?: boolean;
  includeFacets?: boolean;
  includeRAG?: boolean;
  minScore?: number;
  sortBy?: SearchSortBy;
  sortOrder?: 'asc' | 'desc';
}

interface SearchContext {
  userId?: string;
  courseId?: string;
  sessionId?: string;
  previousQueries?: string[];
  userPreferences?: UserSearchPreferences;
}

enum SearchSortBy {
  RELEVANCE = 'relevance',
  DATE = 'date',
  TITLE = 'title',
  POPULARITY = 'popularity',
  RATING = 'rating'
}

interface SearchFacet {
  field: string;
  values: SearchFacetValue[];
}

interface SearchFacetValue {
  value: string;
  count: number;
  selected: boolean;
}
```

### **Database Schema**
```sql
-- Search analytics
CREATE TABLE search_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_text TEXT NOT NULL,
    search_type VARCHAR(50) NOT NULL,
    user_id UUID,
    session_id VARCHAR(100),
    
    -- Results
    total_results INTEGER NOT NULL,
    search_time_ms INTEGER NOT NULL,
    clicked_results INTEGER DEFAULT 0,
    
    -- Context
    filters JSONB,
    context JSONB,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Search suggestions
CREATE TABLE search_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL UNIQUE,
    suggestion TEXT NOT NULL,
    frequency INTEGER DEFAULT 1,
    context_tags TEXT[],
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User search preferences
CREATE TABLE user_search_preferences (
    user_id UUID PRIMARY KEY,
    preferred_content_types TEXT[],
    preferred_languages TEXT[],
    search_filters JSONB,
    
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RAG interactions
CREATE TABLE rag_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    answer TEXT NOT NULL,
    sources JSONB NOT NULL,
    confidence FLOAT NOT NULL,
    model VARCHAR(100) NOT NULL,
    
    user_id UUID,
    feedback_rating INTEGER, -- 1-5 rating
    feedback_text TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vector embeddings (separate table for performance)
CREATE TABLE search_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL,
    chunk_id UUID,
    text TEXT NOT NULL,
    embedding VECTOR(1536), -- Adjust dimensions based on model
    
    -- Metadata for filtering
    course_id UUID,
    module_id UUID,
    content_type VARCHAR(50),
    language VARCHAR(10),
    
    -- Context
    metadata JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_search_queries_user ON search_queries(user_id, created_at);
CREATE INDEX idx_search_embeddings_vector ON search_embeddings 
USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_search_embeddings_content ON search_embeddings(content_id);
```

---

## 🔌 **API Specification**

### **Search Endpoints**

#### **Universal Search**
```http
POST /api/v1/search
Authorization: Bearer <jwt-token>

Request Body:
{
  "query": "machine learning algorithms",
  "type": "hybrid",
  "filters": {
    "courseIds": ["course-uuid"],
    "contentTypes": ["module", "content"],
    "dateRange": {
      "from": "2024-01-01T00:00:00Z",
      "to": "2024-12-31T23:59:59Z"
    }
  },
  "options": {
    "page": 1,
    "limit": 20,
    "includeHighlights": true,
    "includeFacets": true,
    "includeRAG": true,
    "minScore": 0.1
  },
  "context": {
    "courseId": "current-course-uuid",
    "previousQueries": ["neural networks", "deep learning"]
  }
}

Response: 200 OK
{
  "results": [
    {
      "id": "content-uuid",
      "type": "content",
      "title": "Introduction to Machine Learning",
      "description": "Comprehensive guide to ML algorithms",
      "highlights": [
        "Machine learning <em>algorithms</em> are fundamental to AI"
      ],
      "score": 0.95,
      "relevanceScore": 0.92,
      "semanticScore": 0.88,
      "source": {
        "type": "content",
        "id": "content-uuid",
        "url": "/courses/course-uuid/modules/module-uuid/content-uuid"
      },
      "courseId": "course-uuid",
      "tags": ["machine-learning", "algorithms", "ai"],
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "totalResults": 150,
  "searchTime": 45,
  "searchId": "search-uuid",
  "ragResponse": {
    "answer": "Machine learning algorithms are computational methods that enable systems to learn and improve from data without being explicitly programmed...",
    "sources": [
      {
        "contentId": "content-uuid",
        "chunkId": "chunk-uuid",
        "text": "Machine learning algorithms can be categorized into three main types...",
        "relevanceScore": 0.95,
        "metadata": {
          "title": "ML Algorithm Types",
          "courseId": "course-uuid",
          "page": 1
        }
      }
    ],
    "confidence": 0.92,
    "model": "gpt-4",
    "followUpQuestions": [
      "What are the differences between supervised and unsupervised learning?"
    ]
  }
}
```

#### **RAG Query**
```http
POST /api/v1/search/rag
Authorization: Bearer <jwt-token>

Request Body:
{
  "question": "Explain the difference between supervised and unsupervised learning with examples",
  "context": {
    "courseId": "ml-course-uuid",
    "includeExamples": true,
    "maxSources": 5
  },
  "options": {
    "model": "gpt-4",
    "temperature": 0.3,
    "includeSourcesInAnswer": true
  }
}

Response: 200 OK
{
  "answer": "Supervised learning and unsupervised learning are two fundamental approaches in machine learning...",
  "sources": [
    {
      "contentId": "ml-intro-uuid",
      "chunkId": "chunk-1-uuid",
      "text": "Supervised learning algorithms use labeled examples to learn the mapping between inputs and outputs...",
      "relevanceScore": 0.94,
      "metadata": {
        "title": "Introduction to Supervised Learning",
        "courseId": "ml-course-uuid",
        "section": "Chapter 2"
      }
    }
  ],
  "confidence": 0.95,
  "model": "gpt-4",
  "followUpQuestions": [
    "What are some common supervised learning algorithms?",
    "How do you choose between supervised and unsupervised approaches?"
  ],
  "searchTime": 156,
  "interactionId": "rag-interaction-uuid"
}
```

#### **Semantic Search**
```http
POST /api/v1/search/semantic
Authorization: Bearer <jwt-token>

Request Body:
{
  "query": "How do neural networks learn from data?",
  "filters": {
    "courseIds": ["course-uuid"]
  },
  "options": {
    "limit": 10,
    "minSimilarity": 0.7
  }
}

Response: 200 OK
{
  "results": [
    {
      "id": "chunk-uuid",
      "contentId": "content-uuid",
      "text": "Neural networks learn through a process called backpropagation...",
      "similarity": 0.92,
      "metadata": {
        "title": "Neural Network Training",
        "section": "Learning Process",
        "page": 15
      }
    }
  ],
  "totalResults": 25,
  "searchTime": 23
}
```

#### **Autocomplete**
```http
GET /api/v1/search/autocomplete
Authorization: Bearer <jwt-token>

Query Parameters:
- q: string (partial query)
- limit?: number (default: 10)
- context?: string (course-uuid for context-aware suggestions)

Response: 200 OK
{
  "suggestions": [
    {
      "text": "machine learning algorithms",
      "frequency": 156,
      "category": "topic"
    },
    {
      "text": "machine learning course",
      "frequency": 89,
      "category": "course"
    }
  ],
  "searchTime": 12
}
```

### **Indexing Endpoints**

#### **Index Content**
```http
POST /api/v1/search/index
Authorization: Bearer <service-token>

Request Body:
{
  "documents": [
    {
      "id": "content-uuid",
      "type": "content",
      "title": "Machine Learning Basics",
      "description": "Introduction to ML concepts",
      "content": "Machine learning is a subset of artificial intelligence...",
      "courseId": "course-uuid",
      "tags": ["machine-learning", "ai"],
      "language": "en"
    }
  ],
  "options": {
    "generateEmbeddings": true,
    "replaceExisting": true
  }
}

Response: 202 Accepted
{
  "jobId": "index-job-uuid",
  "documentsQueued": 1,
  "estimatedCompletion": "2024-01-01T00:05:00Z"
}
```

#### **Index Vectors**
```http
POST /api/v1/search/index/vectors
Authorization: Bearer <service-token>

Request Body:
{
  "vectors": [
    {
      "id": "chunk-uuid",
      "contentId": "content-uuid",
      "text": "Neural networks are computing systems inspired by biological neural networks...",
      "embedding": [0.1, 0.2, -0.1, ...],
      "metadata": {
        "title": "Neural Networks Introduction",
        "section": "Chapter 1",
        "courseId": "course-uuid"
      }
    }
  ]
}

Response: 201 Created
{
  "indexed": 1,
  "failed": 0
}
```

---

## 🔄 **Processing Pipeline**

### **Multi-Strategy Search Engine**
```typescript
class MultiStrategySearchEngine {
  async search(processedQuery: ProcessedQuery): Promise<SearchResponse> {
    const strategies: SearchStrategy[] = [];
    
    // Select search strategies based on query type
    switch (processedQuery.strategy) {
      case 'hybrid':
        strategies.push(
          new FullTextSearchStrategy(),
          new SemanticSearchStrategy(),
          new FacetedSearchStrategy()
        );
        break;
      case 'rag':
        strategies.push(
          new SemanticSearchStrategy(),
          new RAGSearchStrategy()
        );
        break;
      default:
        strategies.push(new FullTextSearchStrategy());
    }
    
    // Execute searches in parallel
    const results = await Promise.all(
      strategies.map(strategy => strategy.search(processedQuery))
    );
    
    // Fuse and rank results
    const fusedResults = await this.fuseResults(results, processedQuery);
    
    // Apply post-processing
    return this.postProcessResults(fusedResults, processedQuery);
  }
}
```

### **RAG Search Strategy**
```typescript
class RAGSearchStrategy implements SearchStrategy {
  async search(query: ProcessedQuery): Promise<SearchResult[]> {
    // Retrieve relevant context
    const contexts = await this.retrieveContexts(query);
    
    // Generate RAG response
    const ragResponse = await this.generateRAGResponse(query.originalQuery, contexts);
    
    // Return as special RAG result
    return [{
      id: `rag-${Date.now()}`,
      type: 'rag_answer',
      title: 'AI-Generated Answer',
      description: ragResponse.answer.substring(0, 200),
      content: ragResponse.answer,
      highlights: [],
      score: ragResponse.confidence,
      metadata: {
        ragResponse,
        sources: ragResponse.sources
      },
      createdAt: new Date()
    }];
  }
  
  private async retrieveContexts(query: ProcessedQuery): Promise<RAGContext[]> {
    // Semantic search for relevant chunks
    const queryEmbedding = await this.llmGateway.generateEmbedding(query.expandedQuery);
    
    const results = await this.vectorDatabase.similaritySearch({
      vector: queryEmbedding,
      limit: 10,
      threshold: 0.75,
      filters: query.filters
    });
    
    return results.map(result => ({
      text: result.text,
      metadata: result.metadata,
      relevanceScore: result.similarity
    }));
  }
  
  private async generateRAGResponse(question: string, contexts: RAGContext[]): Promise<RAGResponse> {
    const prompt = this.buildRAGPrompt(question, contexts);
    
    const response = await this.llmGateway.generateCompletion({
      prompt,
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 1000
    });
    
    return {
      answer: response.text,
      sources: contexts.map(ctx => ({
        contentId: ctx.metadata.contentId,
        chunkId: ctx.metadata.chunkId,
        text: ctx.text,
        relevanceScore: ctx.relevanceScore,
        metadata: ctx.metadata
      })),
      confidence: response.confidence || 0.8,
      model: 'gpt-4'
    };
  }
  
  private buildRAGPrompt(question: string, contexts: RAGContext[]): string {
    const contextText = contexts
      .map((ctx, idx) => `[${idx + 1}] ${ctx.text}`)
      .join('\n\n');
    
    return `
Answer the following question based on the provided context. If the context doesn't contain enough information to answer the question, say so.

Context:
${contextText}

Question: ${question}

Answer:`;
  }
}
```

---

## 🔄 **Event Integration**

### **Published Events**
```typescript
enum SearchEventType {
  SEARCH_PERFORMED = 'search.performed',
  SEARCH_RESULTS_CLICKED = 'search.results.clicked',
  RAG_INTERACTION = 'search.rag.interaction',
  SEARCH_FEEDBACK = 'search.feedback',
  INDEX_UPDATED = 'search.index.updated'
}

class SearchEventPublisher {
  async publishSearchPerformed(searchRequest: SearchRequest, response: SearchResponse): Promise<void> {
    await this.eventBus.publish(SearchEventType.SEARCH_PERFORMED, {
      query: searchRequest.query,
      searchType: searchRequest.type,
      totalResults: response.totalResults,
      searchTime: response.searchTime,
      userId: searchRequest.context?.userId,
      courseId: searchRequest.context?.courseId,
      timestamp: new Date()
    });
  }
}
```

### **Consumed Events**
```typescript
// Handle content updates
class ContentUpdatedHandler {
  async handle(event: ContentUpdatedEvent): Promise<void> {
    // Update search index
    await this.searchIndexer.updateDocument({
      id: event.contentId,
      title: event.title,
      content: event.content,
      updatedAt: event.timestamp
    });
  }
}
```

---

## ⚙️ **Configuration**

### **Environment Variables**
```bash
# Server Configuration
PORT=3008
NODE_ENV=production
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/lms_search
REDIS_URL=redis://redis:6379
VECTOR_DB_URL=postgresql://user:pass@postgres:5432/lms_vectors

# Elasticsearch Configuration
ELASTICSEARCH_URL=http://elasticsearch:9200
ELASTICSEARCH_INDEX_PREFIX=lms
ELASTICSEARCH_MAX_RESULT_WINDOW=10000

# Vector Search Configuration
VECTOR_DIMENSIONS=1536
SIMILARITY_THRESHOLD=0.7
MAX_VECTOR_RESULTS=100

# LLM Integration
LLM_GATEWAY_URL=http://llm-gateway:3010
DEFAULT_EMBEDDING_MODEL=text-embedding-ada-002
DEFAULT_RAG_MODEL=gpt-4
RAG_MAX_CONTEXTS=10
RAG_CONTEXT_MAX_TOKENS=4000

# Search Configuration
DEFAULT_SEARCH_LIMIT=20
MAX_SEARCH_LIMIT=100
SEARCH_TIMEOUT_MS=5000
ENABLE_QUERY_EXPANSION=true

# Caching
CACHE_SEARCH_RESULTS=true
SEARCH_CACHE_TTL=300
SUGGESTIONS_CACHE_TTL=3600

# Event Bus
KAFKA_BROKERS=kafka:9092
KAFKA_CLIENT_ID=search-service
KAFKA_GROUP_ID=search-service-group
```

---

## 📊 **Monitoring & Observability**

### **Metrics**
```typescript
const metrics = {
  searchDuration: new promClient.Histogram({
    name: 'search_service_query_duration_seconds',
    help: 'Search query processing time',
    labelNames: ['search_type', 'result_count_bucket']
  }),
  
  ragInteractions: new promClient.Counter({
    name: 'search_service_rag_interactions_total',
    help: 'Total RAG interactions',
    labelNames: ['model', 'confidence_bucket']
  }),
  
  searchResults: new promClient.Histogram({
    name: 'search_service_results_count',
    help: 'Number of search results returned',
    labelNames: ['search_type', 'has_results']
  })
};
```

---

## 🎯 **Success Criteria**

### **Functional Requirements**
- ✅ Sub-second search response time for most queries
- ✅ High-quality semantic search with >0.8 relevance
- ✅ RAG responses with >85% user satisfaction
- ✅ Support for 20+ languages
- ✅ Hybrid search combining multiple strategies
- ✅ Real-time indexing with <1 minute delay

### **Non-Functional Requirements**
- ✅ 99.9% uptime availability
- ✅ Handle 10,000+ concurrent searches
- ✅ Scale to 10M+ indexed documents
- ✅ Sub-100ms vector similarity search
- ✅ Comprehensive search analytics

---

This specification provides a complete blueprint for building a production-grade Search Service that supports both traditional full-text search and advanced RAG capabilities, enabling intelligent content discovery and AI-powered question answering. 
