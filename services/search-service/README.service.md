# Search Service - Docker Compose Configuration

This directory contains the service-level Docker Compose configuration for the Search Service, which provides full-text search, semantic search, and RAG (Retrieval-Augmented Generation) capabilities.

## 🚀 Quick Start

### Development Mode
```bash
# Run with development overrides
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Or from the root directory
docker-compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up search-service
```

### Production Mode
```bash
# Run in production mode
docker-compose up

# Or from the root directory
docker-compose -f infra/docker-compose.yml up search-service
```

## 📋 Service Configuration

### Core Features
- **Full-Text Search**: Traditional keyword-based search using Elasticsearch
- **Semantic Search**: Vector-based similarity search using embeddings
- **Hybrid Search**: Combines full-text and semantic search for optimal results
- **RAG Capabilities**: AI-powered question answering with context retrieval
- **Auto-Complete**: Real-time search suggestions and query completion
- **Faceted Search**: Advanced filtering and categorization
- **Search Analytics**: User behavior tracking and search performance metrics

### Key Environment Variables

#### Server Configuration
- `PORT`: Service port (default: 3005)
- `NODE_ENV`: Environment mode (development/production)
- `LOG_LEVEL`: Logging level (info/debug/error)

#### Database Configuration
- `DATABASE_URL`: PostgreSQL connection for metadata
- `VECTOR_DB_URL`: PostgreSQL with pgvector for semantic search
- `REDIS_URL`: Redis connection for caching and queues
- `DB_POOL_MIN/MAX`: Database connection pool settings

#### Elasticsearch Configuration
- `ELASTICSEARCH_URL`: Elasticsearch cluster URL
- `ELASTICSEARCH_USERNAME/PASSWORD`: Authentication credentials
- `ELASTICSEARCH_INDEX_PREFIX`: Index naming prefix (default: lms)
- `ELASTICSEARCH_MAX_RESULT_WINDOW`: Maximum search results (default: 10000)
- `ELASTICSEARCH_TIMEOUT`: Request timeout in milliseconds

#### Vector Search Configuration
- `VECTOR_DIMENSIONS`: Embedding vector dimensions (default: 1536)
- `SIMILARITY_THRESHOLD`: Minimum similarity score (default: 0.7)
- `MAX_VECTOR_RESULTS`: Maximum vector search results (default: 100)
- `VECTOR_SEARCH_TIMEOUT`: Vector search timeout in milliseconds

#### LLM Integration
- `LLM_GATEWAY_URL`: LLM Gateway service URL for RAG
- `DEFAULT_EMBEDDING_MODEL`: Model for generating embeddings
- `DEFAULT_RAG_MODEL`: Model for RAG responses
- `RAG_MAX_CONTEXTS`: Maximum contexts for RAG (default: 10)
- `RAG_CONTEXT_MAX_TOKENS`: Maximum tokens per context
- `RAG_TEMPERATURE`: RAG response creativity (default: 0.3)
- `RAG_MAX_TOKENS`: Maximum RAG response length

#### Search Configuration
- `DEFAULT_SEARCH_LIMIT`: Default number of results (default: 20)
- `MAX_SEARCH_LIMIT`: Maximum allowed results (default: 100)
- `SEARCH_TIMEOUT_MS`: Search request timeout (default: 5000)
- `ENABLE_QUERY_EXPANSION`: Enable query expansion
- `ENABLE_SPELL_CHECK`: Enable spell checking
- `MIN_QUERY_LENGTH`: Minimum query length (default: 2)

#### Caching Configuration
- `CACHE_SEARCH_RESULTS`: Enable search result caching
- `SEARCH_CACHE_TTL`: Search cache time-to-live (default: 300s)
- `SUGGESTIONS_CACHE_TTL`: Suggestions cache TTL (default: 3600s)
- `RAG_CACHE_TTL`: RAG response cache TTL (default: 1800s)
- `VECTOR_CACHE_TTL`: Vector search cache TTL (default: 600s)

#### Rate Limiting
- `RATE_LIMIT_MAX`: General rate limit (default: 100/minute)
- `RAG_RATE_LIMIT_MAX`: RAG-specific rate limit (default: 20/minute)
- `RATE_LIMIT_WINDOW`: Rate limiting window in milliseconds

#### Indexing Configuration
- `INDEX_BATCH_SIZE`: Batch size for indexing (default: 100)
- `INDEX_CONCURRENCY`: Concurrent indexing jobs (default: 5)
- `AUTO_INDEX_ENABLED`: Enable automatic indexing
- `INDEX_RETRY_ATTEMPTS`: Retry attempts for failed indexing
- `INDEX_RETRY_DELAY`: Delay between retry attempts

#### Feature Flags
- `ENABLE_RAG_SEARCH`: Enable RAG-powered search
- `ENABLE_SEMANTIC_SEARCH`: Enable vector-based search
- `ENABLE_HYBRID_SEARCH`: Enable hybrid search mode
- `ENABLE_AUTOCOMPLETE`: Enable auto-complete suggestions
- `ENABLE_FACETED_SEARCH`: Enable faceted search
- `ENABLE_QUERY_SUGGESTIONS`: Enable query suggestions

## 🔧 Development vs Production

### Development Mode Features
- Hot reloading with source code mounting
- Debug logging enabled
- Exposed service port (3005) and metrics port (9098)
- Lower resource limits
- Reduced caching TTL for testing
- More lenient rate limiting
- Enhanced query and request logging

### Production Mode Features
- Optimized Docker image
- Resource limits and reservations
- Production logging configuration
- Full caching and rate limiting
- Security hardening
- Automatic restart policies
- Comprehensive health checks

## 📊 Health Monitoring

### Health Check Endpoints
- `GET /api/v1/health` - Basic health status
- `GET /api/v1/health/live` - Liveness probe
- `GET /api/v1/health/ready` - Readiness probe
- `GET /metrics` - Prometheus metrics

### Key Metrics
- Search query processing time and throughput
- Search result relevance and quality scores
- RAG interaction success rates and response times
- Vector search performance and accuracy
- Cache hit rates and effectiveness
- Indexing performance and queue depth
- Rate limiting statistics

## 🔗 Dependencies

### Required Services
- **PostgreSQL**: Metadata storage and vector search (with pgvector)
- **Redis**: Caching, queues, and rate limiting
- **Elasticsearch**: Full-text search and indexing

### Optional Services
- **LLM Gateway**: RAG capabilities and embedding generation
- **Kafka**: Event streaming for real-time indexing
- **Prometheus**: Metrics collection
- **Jaeger**: Distributed tracing

## 📁 Volume Mounts

### Production Volumes
- `search_logs`: Service logs
- `search_indices`: Search indices cache and temporary storage

### Development Volumes
- `./src`: Source code (hot reloading)
- `./logs`: Development logs
- `./indices`: Development indices cache
- `./migrations`: Database migrations

## 🚨 Troubleshooting

### Common Issues

1. **Elasticsearch Connection Failed**
   ```bash
   # Check Elasticsearch cluster health
   curl http://elasticsearch:9200/_cluster/health
   
   # Verify authentication
   curl -u $ELASTICSEARCH_USERNAME:$ELASTICSEARCH_PASSWORD http://elasticsearch:9200/
   ```

2. **Vector Search Issues**
   ```bash
   # Check pgvector extension
   docker-compose exec postgresql psql -U postgres -d lms_search -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
   
   # Verify vector dimensions
   echo "Vector dimensions: $VECTOR_DIMENSIONS"
   ```

3. **LLM Gateway Connection Issues**
   ```bash
   # Check LLM Gateway health
   curl http://llm-gateway:3010/health
   
   # Verify RAG configuration
   echo "RAG Model: $DEFAULT_RAG_MODEL"
   echo "Embedding Model: $DEFAULT_EMBEDDING_MODEL"
   ```

4. **Search Performance Issues**
   ```bash
   # Check Elasticsearch indices
   curl http://elasticsearch:9200/_cat/indices/lms*
   
   # Monitor search cache
   docker-compose exec redis-master redis-cli KEYS "search:*"
   ```

5. **Indexing Problems**
   ```bash
   # Check indexing queue
   docker-compose exec redis-master redis-cli LLEN search:indexing
   
   # Monitor indexing logs
   docker-compose logs search-service | grep "index"
   ```

### Debug Mode
```bash
# Enable debug logging
export LOG_LEVEL=debug
export ENABLE_REQUEST_LOGGING=true
export ENABLE_QUERY_LOGGING=true

# Enable development features
export ENABLE_RAG_SEARCH=true
export ENABLE_SEMANTIC_SEARCH=true
export ENABLE_HYBRID_SEARCH=true

# Start with debug configuration
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up search-service
```

## 🔒 Security Considerations

- Non-root user execution in containers
- Elasticsearch authentication and authorization
- Rate limiting to prevent search abuse
- Input validation and query sanitization
- Vector embedding security
- API key protection for LLM integration
- Search query logging and monitoring

## 📈 Scaling

The Search Service supports horizontal scaling:

```bash
# Scale to multiple instances
docker-compose up --scale search-service=3

# Or use the infrastructure-level scaling
docker-compose -f infra/docker-compose.yml up --scale search-service=3
```

Each instance will:
- Share the same Elasticsearch cluster
- Share Redis cache and queues
- Process search requests independently
- Handle different search types (full-text, semantic, RAG)
- Report metrics separately

## 🔄 Integration

The Search Service integrates with:
- **Course Service**: Course content indexing and search
- **File Service**: Document and media content search
- **Content Ingestion Service**: Automated content indexing
- **LLM Gateway**: Embedding generation and RAG responses
- **Analytics Service**: Search behavior and performance metrics
- **User Service**: Personalized search and recommendations

## 🔍 Search Types

### Full-Text Search
- Traditional keyword-based search
- Boolean operators and phrase matching
- Fuzzy matching and spell correction
- Field-specific searching

### Semantic Search
- Vector similarity search using embeddings
- Context-aware content matching
- Cross-lingual search capabilities
- Conceptual similarity detection

### Hybrid Search
- Combines full-text and semantic approaches
- Weighted result fusion
- Optimal relevance scoring
- Fallback strategies

### RAG Search
- AI-powered question answering
- Context-aware responses
- Source attribution and citations
- Conversational search interface

For more detailed information, see the [Search Service Technical Specification](../../docs/architecture/search-service-spec.md).
