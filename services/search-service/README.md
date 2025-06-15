# Search Service v2.0

An advanced, AI-powered search service for the LMS platform featuring RAG (Retrieval-Augmented Generation), semantic search, and traditional full-text search capabilities.

## 🎯 **Overview**

The Search Service provides intelligent content discovery through multiple search strategies:

- **RAG-Powered Q&A** - AI-generated answers using course content as context
- **Semantic Search** - Vector-based similarity search using embeddings
- **Hybrid Search** - Combines multiple search strategies for optimal results
- **Full-Text Search** - Traditional keyword-based search (Elasticsearch)
- **Autocomplete & Suggestions** - Smart query completion and recommendations
- **Similar Content Discovery** - Find related content based on semantic similarity

## 🏗️ **Architecture**

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

## 🚀 **Features**

### **🤖 RAG-Powered Search**
- **Intelligent Q&A** - Natural language question answering
- **Context-Aware Responses** - Uses course materials as knowledge base
- **Source Attribution** - Shows which content was used to generate answers
- **Follow-up Questions** - Suggests related questions to explore
- **Confidence Scoring** - Indicates reliability of generated answers

### **🔍 Semantic Search**
- **Vector Embeddings** - High-dimensional content representations
- **Similarity Matching** - Find conceptually related content
- **Cross-Language Support** - Semantic understanding across languages
- **Contextual Relevance** - Understanding beyond keyword matching
- **pgvector Integration** - Optimized vector storage and retrieval

### **⚡ Hybrid Search**
- **Multi-Strategy Fusion** - Combines semantic and full-text results
- **Relevance Scoring** - Intelligent result ranking and scoring
- **Strategy Selection** - Automatic strategy selection based on query type
- **Result Deduplication** - Eliminates duplicate results across strategies
- **Performance Optimization** - Parallel execution of search strategies

### **🎯 Advanced Features**
- **Query Expansion** - AI-powered query enhancement for better results
- **Autocomplete** - Real-time search suggestions
- **Faceted Search** - Filter results by content type, course, date, etc.
- **Similar Content** - Discover related materials automatically
- **Search Analytics** - Track user behavior and search performance
- **Personalization** - User-specific search preferences and history

## 📊 **API Endpoints**

### **Universal Search**
```http
POST /api/v1/search
```
Multi-strategy search with automatic strategy selection.

**Request:**
```json
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
    "includeRAG": true
  },
  "context": {
    "courseId": "current-course-uuid",
    "previousQueries": ["neural networks"]
  }
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "content-uuid",
      "type": "content",
      "title": "Introduction to Machine Learning",
      "description": "Comprehensive guide to ML algorithms",
      "highlights": ["Machine learning <em>algorithms</em> are fundamental"],
      "score": 0.95,
      "relevanceScore": 0.92,
      "semanticScore": 0.88,
      "source": {
        "type": "content",
        "id": "content-uuid",
        "url": "/courses/course-uuid/content/content-uuid"
      },
      "courseId": "course-uuid",
      "tags": ["machine-learning", "algorithms"],
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "totalResults": 150,
  "searchTime": 45,
  "searchId": "search-uuid",
  "ragResponse": {
    "answer": "Machine learning algorithms are computational methods...",
    "sources": [...],
    "confidence": 0.92,
    "followUpQuestions": [
      "What are the differences between supervised and unsupervised learning?"
    ]
  }
}
```

### **RAG Question Answering**
```http
POST /api/v1/search/rag
```
AI-powered question answering using course content.

**Request:**
```json
{
  "question": "Explain the difference between supervised and unsupervised learning",
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
```

### **Semantic Search**
```http
POST /api/v1/search/semantic
```
Vector-based similarity search.

**Request:**
```json
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
```

### **Autocomplete**
```http
GET /api/v1/search/autocomplete?q=machine&limit=10
```

### **Similar Content**
```http
GET /api/v1/search/similar/content-uuid?limit=10&threshold=0.8
```

## 🛠️ **Installation & Setup**

### **Prerequisites**
- Node.js 18+
- PostgreSQL 14+ with pgvector extension
- Redis 6+
- Elasticsearch 8+ (optional, for full-text search)

### **Local Development**

1. **Clone and Install**
```bash
cd services/search-service
npm install
```

2. **Environment Setup**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Database Setup**
```bash
# Create database
createdb lms_search

# Enable pgvector extension
psql -d lms_search -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Run migrations
npm run db:migrate
```

4. **Start Development Server**
```bash
npm run dev
```

### **Docker Development**

```bash
# Build and run
docker build -t lms/search-service .
docker run -p 3008:3008 --env-file .env lms/search-service
```

## 🔧 **Configuration**

### **Core Settings**
```bash
# Server
PORT=3008
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:pass@host:5432/lms_search
VECTOR_DB_URL=postgresql://user:pass@host:5432/lms_search

# LLM Integration
LLM_GATEWAY_URL=http://localhost:3010
DEFAULT_EMBEDDING_MODEL=text-embedding-ada-002
DEFAULT_RAG_MODEL=gpt-4

# Vector Search
VECTOR_DIMENSIONS=1536
SIMILARITY_THRESHOLD=0.7
MAX_VECTOR_RESULTS=100

# RAG Configuration
RAG_MAX_CONTEXTS=10
RAG_CONTEXT_MAX_TOKENS=4000
RAG_TEMPERATURE=0.3
RAG_MAX_TOKENS=1000
```

### **Feature Flags**
```bash
ENABLE_RAG_SEARCH=true
ENABLE_SEMANTIC_SEARCH=true
ENABLE_HYBRID_SEARCH=true
ENABLE_AUTOCOMPLETE=true
ENABLE_QUERY_SUGGESTIONS=true
```

## 📝 **Usage Examples**

### **RAG Question Answering**
```javascript
const response = await fetch('/api/v1/search/rag', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <jwt-token>',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    question: 'What is the difference between supervised and unsupervised learning?',
    context: {
      courseId: 'ml-course-uuid',
      includeExamples: true
    }
  }),
});

const result = await response.json();
console.log('AI Answer:', result.answer);
console.log('Sources:', result.sources);
console.log('Follow-up Questions:', result.followUpQuestions);
```

### **Semantic Search**
```javascript
const response = await fetch('/api/v1/search/semantic', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <jwt-token>',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: 'neural network training process',
    options: {
      limit: 10,
      minSimilarity: 0.8
    }
  }),
});

const results = await response.json();
console.log('Semantic Results:', results.results);
```

### **Hybrid Search**
```javascript
const response = await fetch('/api/v1/search', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <jwt-token>',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: 'machine learning algorithms',
    type: 'hybrid',
    options: {
      includeRAG: true,
      includeHighlights: true,
      limit: 20
    }
  }),
});

const results = await response.json();
console.log('Search Results:', results.results);
if (results.ragResponse) {
  console.log('AI Answer:', results.ragResponse.answer);
}
```

## 🔄 **Integration with Content Ingestion Service**

The Search Service automatically indexes content from the Content Ingestion Service:

### **Vector Embeddings**
- Receives embeddings from processed content chunks
- Stores vectors in PostgreSQL with pgvector
- Enables semantic similarity search

### **Content Updates**
- Listens for content update events
- Automatically reindexes modified content
- Maintains search index consistency

### **RAG Context**
- Uses chunked content as RAG context
- Retrieves relevant chunks for question answering
- Provides source attribution for generated answers

## 📊 **Monitoring & Analytics**

### **Search Analytics**
- Query performance tracking
- User behavior analysis
- Popular search terms
- Click-through rates
- RAG interaction metrics

### **Health Monitoring**
```http
GET /health              # Basic health check
GET /health/ready        # Comprehensive readiness check
```

### **Performance Metrics**
- Search response times
- Vector similarity search performance
- RAG generation latency
- Cache hit rates
- Database query performance

## 🧪 **Testing**

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage
```

## 🚀 **Production Deployment**

### **Docker Compose**
```yaml
version: '3.8'
services:
  search-service:
    build: .
    ports: ["3008:3008"]
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/lms_search
      - LLM_GATEWAY_URL=http://llm-gateway:3010
      - REDIS_URL=redis://redis:6379
    depends_on: [postgres, redis, llm-gateway]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3008/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### **Kubernetes Deployment**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: search-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: search-service
  template:
    spec:
      containers:
      - name: search-service
        image: lms/search-service:latest
        ports:
        - containerPort: 3008
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: url
        livenessProbe:
          httpGet:
            path: /health
            port: 3008
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3008
```

## 🔒 **Security**

### **Authentication & Authorization**
- JWT-based authentication
- Role-based access control (RBAC)
- Permission-based authorization
- Rate limiting per user

### **Data Protection**
- Query sanitization
- SQL injection prevention
- Vector embedding security
- Audit logging

## 🔧 **Troubleshooting**

### **Common Issues**

#### **Vector Search Performance**
```bash
# Check pgvector extension
psql -d lms_search -c "SELECT * FROM pg_extension WHERE extname = 'vector';"

# Optimize vector index
psql -d lms_search -c "REINDEX INDEX idx_search_embeddings_vector;"
```

#### **RAG Response Quality**
```bash
# Check LLM Gateway connectivity
curl http://localhost:3010/health

# Monitor RAG interactions
tail -f logs/combined.log | grep rag_interaction
```

#### **Memory Usage**
```bash
# Monitor vector storage
curl http://localhost:3008/health/ready | jq '.checks'

# Optimize embedding storage
export VECTOR_DIMENSIONS=768  # Use smaller embeddings if needed
```

## 📚 **API Documentation**

Interactive API documentation is available at:
- **Development**: http://localhost:3008/docs
- **Production**: https://api.lms.example.com/search/docs

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Submit a pull request

## 📄 **License**

This project is licensed under the MIT License.

## 🆘 **Support**

- **Documentation**: `/docs` endpoint
- **Health Status**: `/health` endpoint
- **Issues**: GitHub Issues
- **Email**: support@lms.example.com

---

**Search Service v2.0** - Powering intelligent content discovery with AI! 🚀
