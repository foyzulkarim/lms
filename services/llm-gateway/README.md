# LLM Gateway Service

The LLM Gateway Service is a high-performance Node.js microservice that acts as a centralized facade for all Large Language Model (LLM) operations within the LMS platform. It provides comprehensive request management, intelligent caching, queue-based processing, and robust rate limiting for AI model interactions.

## 🎯 **Overview**

This service handles all LLM operations including chat completions, embeddings generation, and model management, providing a unified interface with advanced features like caching, rate limiting, and queue processing.

### **Key Features**

- **Centralized LLM Management**: Single point of access for all AI model operations
- **Ollama Integration**: Direct integration with local LLM execution engine
- **Intelligent Caching**: Redis-based response caching with TTL management
- **Advanced Rate Limiting**: Multi-tier rate limiting with burst protection
- **Queue Processing**: BullMQ-based asynchronous job processing
- **JWT Authentication**: Secure access with role-based permissions
- **Circuit Breaker**: Fault tolerance with automatic fallback
- **Comprehensive Monitoring**: Health checks, metrics, and audit logging

## 🏗️ **Architecture**

```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│   API Gateway   │────│   LLM Gateway        │────│     Ollama      │
│   Client Apps   │    │   (Port 3009)        │    │   (Port 11434)  │
└─────────────────┘    └──────────────────────┘    └─────────────────┘
                              │
                    ┌─────────┼─────────────┐
                    │         │             │
            ┌───────▼───┐ ┌──▼──▼────┐ ┌────▼─────────┐
            │Processing │ │  Cache   │ │   Database   │
            │  Queue    │ │ (Redis)  │ │(PostgreSQL)  │
            └───────────┘ └──────────┘ └──────────────┘
```

### **Request Processing Pipeline**

```
Client Request → Authentication → Rate Limiting → Request Validation → 
Cache Check → Queue Processing → Ollama Integration → Response Caching → 
Analytics Publishing → Client Response
```

## 🚀 **Getting Started**

### **Prerequisites**

- Docker 20.10+
- Docker Compose v2.0+
- Node.js 20+ (for development)
- PostgreSQL 15+
- Redis 7+
- Ollama (for LLM execution)

### **Environment Variables**

Copy the environment template and configure:

```bash
cp .env.example .env
```

Key configuration variables:

```bash
# Server Configuration
NODE_ENV=production
PORT=3009
LOG_LEVEL=info

# Database Configuration
DATABASE_URL=postgresql://user:pass@postgres:5432/lms_llm_gateway
REDIS_URL=redis://redis:6379/8

# Ollama Configuration
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_TIMEOUT=300000
OLLAMA_MAX_RETRIES=3

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_MAX_REQUESTS_PER_MODEL=50
RATE_LIMIT_BURST_SIZE=10

# Cache Configuration
CACHE_TTL=3600
RESPONSE_CACHE_ENABLED=true

# Security
MAX_PROMPT_LENGTH=8192
ALLOWED_MODELS=llama2,codellama,mistral,phi
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

3. **Download LLM models:**
   ```bash
   # Download required models
   npm run models:download
   ```

4. **Start development environment:**
   ```bash
   # Start infrastructure services
   docker-compose -f ../../infra/docker-compose.yml -f ../../infra/docker-compose.dev.yml up -d postgresql redis-master kafka-1 ollama

   # Start the service in development mode
   npm run dev
   ```

5. **Start workers (optional):**
   ```bash
   # LLM processing worker
   npm run worker:llm
   
   # Model manager
   npm run worker:model-manager
   ```

### **Production Deployment**

```bash
# Deploy with Docker Compose
docker-compose -f ../../infra/docker-compose.yml -f ../../infra/docker-compose.prod.yml up -d llm-gateway

# Or build and run locally
npm run build
npm start
```

## 📊 **Service Components**

### **Main Service (Port 3009)**
- REST API for LLM operations
- Chat completion endpoints
- Embeddings generation
- Model management
- Rate limiting and caching
- Health checks and metrics

### **LLM Worker (Port 3010)**
- Queue-based job processing
- Ollama integration
- Background LLM operations
- Error handling and retries

### **Model Manager (Port 3011)**
- Model lifecycle management
- Automatic model downloads
- Usage tracking and optimization
- Model cleanup and maintenance

### **Ollama Service (Port 11434)**
- Local LLM execution engine
- Model hosting and inference
- GPU acceleration support
- Model switching and management

## 🔌 **API Endpoints**

### **Chat Completion**

#### **Create Chat Completion**
```http
POST /v1/chat/completions
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "model": "llama2",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "Explain machine learning in simple terms."
    }
  ],
  "temperature": 0.7,
  "max_tokens": 150
}

Response: 200 OK
{
  "id": "chatcmpl-1234567890",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "llama2",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Machine learning is a type of artificial intelligence..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 35,
    "total_tokens": 60
  }
}
```

#### **Stream Chat Completion**
```http
POST /v1/chat/completions
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "model": "llama2",
  "messages": [...],
  "stream": true
}

Response: 200 OK (Server-Sent Events)
data: {"id":"chatcmpl-1234","object":"chat.completion.chunk",...}
data: {"id":"chatcmpl-1234","object":"chat.completion.chunk",...}
data: [DONE]
```

### **Embeddings**

#### **Create Embeddings**
```http
POST /v1/embeddings
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "model": "llama2",
  "input": "The quick brown fox jumps over the lazy dog"
}

Response: 200 OK
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [0.0023064255, -0.009327292, ...],
      "index": 0
    }
  ],
  "model": "llama2",
  "usage": {
    "prompt_tokens": 9,
    "total_tokens": 9
  }
}
```

#### **Batch Embeddings**
```http
POST /v1/embeddings
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "model": "llama2",
  "input": [
    "First text to embed",
    "Second text to embed",
    "Third text to embed"
  ]
}

Response: 200 OK
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [...],
      "index": 0
    },
    {
      "object": "embedding",
      "embedding": [...],
      "index": 1
    },
    {
      "object": "embedding",
      "embedding": [...],
      "index": 2
    }
  ]
}
```

### **Model Management**

#### **List Available Models**
```http
GET /v1/models
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "object": "list",
  "data": [
    {
      "id": "llama2",
      "object": "model",
      "created": 1677610602,
      "owned_by": "ollama"
    },
    {
      "id": "codellama",
      "object": "model",
      "created": 1677610602,
      "owned_by": "ollama"
    }
  ]
}
```

#### **Get Model Details**
```http
GET /v1/models/{modelId}
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "id": "llama2",
  "object": "model",
  "created": 1677610602,
  "owned_by": "ollama",
  "permission": [...],
  "root": "llama2",
  "parent": null
}
```

### **Queue Management**

#### **Get Job Status**
```http
GET /v1/chat/jobs/{jobId}
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "id": "job-uuid",
  "status": "completed",
  "progress": 100,
  "result": {
    "id": "chatcmpl-1234567890",
    "choices": [...],
    "usage": {...}
  },
  "createdAt": "2024-01-01T00:00:00Z",
  "completedAt": "2024-01-01T00:00:05Z"
}
```

### **Administrative Endpoints**

#### **Queue Statistics**
```http
GET /admin/queue/stats
Authorization: Bearer <admin-jwt-token>

Response: 200 OK
{
  "chat": {
    "waiting": 5,
    "active": 3,
    "completed": 1250,
    "failed": 15
  },
  "embeddings": {
    "waiting": 2,
    "active": 1,
    "completed": 850,
    "failed": 8
  }
}
```

#### **Cache Statistics**
```http
GET /admin/cache/stats
Authorization: Bearer <admin-jwt-token>

Response: 200 OK
{
  "totalEntries": 1500,
  "totalSize": 1536000,
  "hitRate": 85.5,
  "topModels": [
    {
      "model": "llama2",
      "entries": 800
    }
  ]
}
```

## 🔄 **Event Integration**

### **Published Events**

- `llm.request.started` - LLM request initiated
- `llm.request.completed` - LLM request completed
- `llm.request.failed` - LLM request failed
- `llm.cache.hit` - Cache hit occurred
- `llm.cache.miss` - Cache miss occurred
- `llm.rate.limit.exceeded` - Rate limit exceeded
- `llm.model.loaded` - Model loaded in Ollama
- `llm.model.unloaded` - Model unloaded from memory

### **Consumed Events**

- `user.deleted` - Clean up user rate limits and cache
- `user.role.changed` - Update user permissions and limits

## 📊 **Monitoring & Observability**

### **Health Checks**

```bash
# Basic health check
curl http://localhost:3009/health

# Detailed health check with service status
curl http://localhost:3009/health/detailed

# Readiness probe
curl http://localhost:3009/health/ready

# Liveness probe
curl http://localhost:3009/health/live
```

### **Metrics**

The service exposes Prometheus metrics on `/metrics`:

- `llm_gateway_request_duration_seconds` - Request processing time
- `llm_gateway_queue_size` - Current queue size by type
- `llm_gateway_cache_hit_rate` - Cache hit rate percentage
- `llm_gateway_rate_limit_hits_total` - Rate limit violations
- `llm_gateway_ollama_requests_total` - Ollama API requests
- `llm_gateway_active_connections` - Active WebSocket connections

### **Logging**

Structured JSON logging with correlation IDs:

```bash
# View service logs
docker-compose logs -f llm-gateway

# View worker logs
docker-compose logs -f llm-worker

# View Ollama logs
docker-compose logs -f ollama
```

## 🛠️ **Development**

### **Project Structure**

```
src/
├── main.ts                     # Application entry point
├── app.ts                      # Fastify app configuration
├── routes/                     # API route handlers
│   ├── chat.ts                # Chat completion endpoints
│   ├── embeddings.ts          # Embeddings endpoints
│   ├── models.ts              # Model management endpoints
│   └── admin.ts               # Administrative endpoints
├── services/                   # Business logic services
│   ├── ollama-service.ts      # Ollama integration
│   ├── queue-producer.ts      # Queue job management
│   ├── response-cache.ts      # Caching service
│   └── rate-limiter.ts        # Rate limiting service
├── middleware/                 # Custom middleware
│   ├── auth.ts                # Authentication middleware
│   ├── rate-limit.ts          # Rate limiting middleware
│   └── validation.ts          # Request validation
├── queue/                      # Queue processing
│   ├── processors/            # Job processors
│   ├── types.ts               # Queue type definitions
│   └── utils.ts               # Queue utilities
├── database/                   # Database configuration
│   ├── connection.ts          # Database connection
│   ├── migrations/            # Database migrations
│   └── seeds/                 # Sample data
├── events/                     # Event handling
│   ├── publishers/            # Event publishers
│   └── handlers/              # Event handlers
├── utils/                      # Utility functions
│   ├── logger.ts              # Logging configuration
│   ├── metrics.ts             # Prometheus metrics
│   └── validation.ts          # Input validation schemas
└── types/                      # TypeScript type definitions
    ├── llm.ts                 # LLM-related types
    ├── queue.ts               # Queue-related types
    └── api.ts                 # API request/response types
```

### **Database Management**

```bash
# Create new migration
npx knex migrate:make create_llm_requests_table

# Run migrations
npm run db:migrate

# Rollback last migration
npm run db:rollback

# Seed database
npm run db:seed

# Reset database
npm run db:reset
```

### **Model Management**

```bash
# Download models
npm run models:download

# List available models
npm run models:list

# Clear model cache
npm run cache:clear

# Clear job queue
npm run queue:clear
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

### **Rate Limiting Settings**

```bash
# Rate Limiting
RATE_LIMIT_WINDOW=3600          # 1 hour window
RATE_LIMIT_MAX_REQUESTS=100     # Max requests per hour
RATE_LIMIT_MAX_REQUESTS_PER_MODEL=50  # Max per model
RATE_LIMIT_BURST_SIZE=10        # Burst allowance
```

### **Cache Settings**

```bash
# Cache Configuration
CACHE_TTL=3600                  # 1 hour TTL
CACHE_MAX_SIZE=1000             # Max entries
RESPONSE_CACHE_ENABLED=true     # Enable response caching
MODEL_CACHE_ENABLED=true        # Enable model caching
```

### **Queue Settings**

```bash
# Queue Configuration
QUEUE_CONCURRENCY=5             # Concurrent jobs
QUEUE_MAX_ATTEMPTS=3            # Retry attempts
QUEUE_BACKOFF_TYPE=exponential  # Backoff strategy
QUEUE_REMOVE_ON_COMPLETE=100    # Keep completed jobs
```

### **Security Settings**

```bash
# Security Configuration
MAX_PROMPT_LENGTH=8192          # Max prompt length
MAX_RESPONSE_LENGTH=16384       # Max response length
ALLOWED_MODELS=llama2,codellama,mistral,phi
BLOCKED_PATTERNS=               # Comma-separated patterns
```

## 🚨 **Troubleshooting**

### **Common Issues**

1. **Ollama connection errors:**
   ```bash
   # Check Ollama health
   curl http://localhost:11434/api/tags
   
   # Check service connectivity
   docker-compose exec llm-gateway curl -f http://ollama:11434/api/tags
   ```

2. **High queue size:**
   ```bash
   # Check queue statistics
   curl http://localhost:3009/admin/queue/stats
   
   # Clear stuck jobs
   npm run queue:clear
   ```

3. **Rate limiting issues:**
   ```bash
   # Check rate limit status
   curl -H "Authorization: Bearer $TOKEN" http://localhost:3009/admin/rate-limits/user/USER_ID
   
   # Adjust rate limits
   RATE_LIMIT_MAX_REQUESTS=200
   ```

4. **Cache performance:**
   ```bash
   # Check cache statistics
   curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3009/admin/cache/stats
   
   # Clear cache
   npm run cache:clear
   ```

### **Performance Optimization**

1. **Increase queue concurrency for high throughput**
2. **Tune cache TTL based on usage patterns**
3. **Optimize Ollama model loading**
4. **Monitor and adjust rate limits**
5. **Use GPU acceleration for Ollama if available**

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
- Review service logs: `docker-compose logs llm-gateway`
- Monitor health endpoints: `/health`
- Check metrics: `/metrics`
- Review API documentation: `/docs`
