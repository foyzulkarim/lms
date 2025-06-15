# LLM Gateway Service Technical Specification

## 🎯 **Service Overview**

The LLM Gateway Service is a high-performance Node.js microservice that acts as a centralized facade for all Large Language Model (LLM) operations within the LMS platform. It provides comprehensive request management, intelligent caching, queue-based processing, and robust rate limiting for AI model interactions.

### **Core Responsibilities**
- Centralized LLM request management and routing
- JWT-based authentication and authorization
- Advanced rate limiting with per-user and per-model quotas
- Intelligent response caching with Redis
- Queue-based asynchronous processing with BullMQ
- Ollama integration for local LLM execution
- Request validation and content moderation
- Comprehensive monitoring and analytics
- Circuit breaker patterns for fault tolerance

### **Service Characteristics**
- **Technology Stack:** Node.js + Fastify + TypeScript
- **Port:** 3007
- **Database:** PostgreSQL for metadata storage
- **Cache:** Redis for response caching and rate limiting
- **Queue:** BullMQ with Redis for job processing
- **Message Broker:** Kafka for event publishing
- **LLM Backend:** Ollama integration
- **Documentation:** OpenAPI 3.0 with Swagger UI

---

## 🏗️ **Architecture Design**

### **High-Level Architecture**
```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│   API Gateway   │────│   LLM Gateway        │────│     Ollama      │
│   Client Apps   │    │   (Port 3007)        │    │   (Port 11434)  │
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

### **Service Components**
- **Request Router** - Fastify-based HTTP server with OpenAPI documentation
- **Authentication Layer** - JWT token validation and user context
- **Rate Limiting Engine** - Multi-tier rate limiting with burst protection
- **Response Cache** - Redis-based intelligent caching with TTL management
- **Queue Manager** - BullMQ job processing with priority queues
- **Ollama Service** - Direct integration with Ollama LLM backend
- **Event Publisher** - Kafka integration for analytics and monitoring

---

## 📊 **Data Models**

### **Core LLM Models**
Based on the actual TypeScript definitions from `/src/types/llm.ts`:

```typescript
interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  temperature?: number;        // 0-2
  max_tokens?: number;        // 1-4096
  top_p?: number;            // 0-1
  frequency_penalty?: number; // -2 to 2
  presence_penalty?: number;  // -2 to 2
  stop?: string | string[];
  stream?: boolean;
  user?: string;
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;           // 1-8192 characters
  name?: string;
}

interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatChoice[];
  usage: TokenUsage;
}

interface ChatChoice {
  index: number;
  message: Message;
  finish_reason: 'stop' | 'length' | 'content_filter' | 'null';
}

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface EmbeddingsRequest {
  model: string;
  input: string | string[];  // 1-8192 characters per input
  user?: string;
}

interface EmbeddingsResponse {
  object: 'list';
  data: EmbeddingData[];
  model: string;
  usage: TokenUsage;
}

interface EmbeddingData {
  object: 'embedding';
  embedding: number[];
  index: number;
}
```

### **Queue Models**
Based on the actual implementation from `/src/queue/types.ts`:

```typescript
interface QueueJobData {
  id: string;
  type: 'chat' | 'embeddings';
  userId: string;
  model: string;
  request: ChatCompletionRequest | EmbeddingsRequest;
  priority?: number;
  correlationId: string;
  createdAt: Date;
  timeout?: number;
}

interface QueueJobResult {
  success: boolean;
  response?: ChatCompletionResponse | EmbeddingsResponse;
  error?: string;
  processingTime: number;
  model: string;
  tokensUsed?: number;
}

enum JobPriority {
  LOW = 1,
  NORMAL = 5,
  HIGH = 10,
  CRITICAL = 20,
}

enum JobStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELAYED = 'delayed',
  PAUSED = 'paused',
}
```

### **Rate Limiting Models**
```typescript
interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;           // Unix timestamp
  retryAfter?: number;     // Seconds to wait
}

interface UserRateLimit {
  userId: string;
  windowStart: number;
  currentRequests: number;
  burstRequests: number;
  lastRequest: Date;
}

interface ModelRateLimit {
  userId: string;
  model: string;
  windowStart: number;
  currentRequests: number;
  lastRequest: Date;
}
```

### **Cache Models**
```typescript
interface CacheEntry {
  key: string;
  value: ChatCompletionResponse | EmbeddingsResponse;
  ttl: number;
  createdAt: Date;
  accessCount: number;
  lastAccessed: Date;
}

interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  topModels: Array<{ model: string; entries: number }>;
  topUsers: Array<{ userId: string; entries: number }>;
}
```

---

## ⚙️ **Configuration Management**

Based on the actual configuration from `/src/config/index.ts`:

### **Environment Variables**
```bash
# Server Configuration
PORT=3007
NODE_ENV=production
HOST=0.0.0.0
REQUEST_TIMEOUT=300000
KEEP_ALIVE_TIMEOUT=65000
BODY_LIMIT=10485760

# Database Configuration
DATABASE_URL=postgresql://lms_user:password@localhost:5432/lms_llm_gateway
DB_HOST=localhost
DB_PORT=5432
DB_NAME=lms_llm_gateway
DB_USER=lms_user
DB_PASSWORD=password

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_TIMEOUT=300000
OLLAMA_MAX_RETRIES=3
OLLAMA_RETRY_DELAY=1000

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Kafka Configuration
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=llm-gateway
KAFKA_GROUP_ID=llm-gateway-group

# Rate Limiting Configuration
RATE_LIMIT_WINDOW=3600
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_MAX_REQUESTS_PER_MODEL=50
RATE_LIMIT_BURST_SIZE=10

# Queue Configuration
QUEUE_CONCURRENCY=5
QUEUE_MAX_ATTEMPTS=3
QUEUE_DELAY=1000
QUEUE_BACKOFF_TYPE=exponential
QUEUE_REMOVE_ON_COMPLETE=100
QUEUE_REMOVE_ON_FAIL=50

# Cache Configuration
CACHE_TTL=3600
CACHE_MAX_SIZE=1000
RESPONSE_CACHE_ENABLED=true
MODEL_CACHE_ENABLED=true

# Feature Flags
ENABLE_RATE_LIMITING=true
ENABLE_CACHING=true
ENABLE_QUEUE_PROCESSING=true
ENABLE_MODEL_FALLBACK=true
ENABLE_STREAMING=true
ENABLE_CONTENT_MODERATION=false

# Security Configuration
MAX_PROMPT_LENGTH=8192
MAX_RESPONSE_LENGTH=16384
ALLOWED_MODELS=llama2,codellama,mistral,phi
BLOCKED_PATTERNS=

# Monitoring Configuration
METRICS_ENABLED=true
LOG_LEVEL=info
LOG_FORMAT=json

# External Services
AUTH_SERVICE_URL=http://localhost:3001
USER_SERVICE_URL=http://localhost:3002
ANALYTICS_SERVICE_URL=http://localhost:8080

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
CORS_CREDENTIALS=true
```

### **Configuration Schema**
Based on the Zod validation schema:

```typescript
const configSchema = z.object({
  server: z.object({
    port: z.coerce.number().default(3007),
    host: z.string().default('0.0.0.0'),
    requestTimeout: z.coerce.number().default(300000),
    keepAliveTimeout: z.coerce.number().default(65000),
    bodyLimit: z.coerce.number().default(10485760),
  }),
  
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  ollama: z.object({
    baseUrl: z.string().default('http://localhost:11434'),
    timeout: z.coerce.number().default(300000),
    maxRetries: z.coerce.number().default(3),
    retryDelay: z.coerce.number().default(1000),
  }),

  rateLimit: z.object({
    window: z.coerce.number().default(3600),
    maxRequests: z.coerce.number().default(100),
    maxRequestsPerModel: z.coerce.number().default(50),
    burstSize: z.coerce.number().default(10),
  }),

  security: z.object({
    maxPromptLength: z.coerce.number().default(8192),
    maxResponseLength: z.coerce.number().default(16384),
    allowedModels: z.string().transform(str => str.split(',')),
    blockedPatterns: z.string().optional().transform(str => str ? str.split(',') : []),
  }),

  features: z.object({
    enableRateLimiting: z.coerce.boolean().default(true),
    enableCaching: z.coerce.boolean().default(true),
    enableQueueProcessing: z.coerce.boolean().default(true),
    enableModelFallback: z.coerce.boolean().default(true),
    enableStreaming: z.coerce.boolean().default(true),
    enableContentModeration: z.coerce.boolean().default(false),
  }),
});
```

---

## 🔧 **Core Implementation**

### **Application Setup**
Based on `/src/main.ts` and `/src/app.ts`:

```typescript
// Main application entry point
async function start() {
  const fastify = Fastify({
    logger: false, // Using custom Winston logger
    trustProxy: true,
    keepAliveTimeout: config.server.keepAliveTimeout,
    bodyLimit: config.server.bodyLimit,
  }).withTypeProvider<TypeBoxTypeProvider>();

  try {
    // Register the application
    await fastify.register(createApp);

    // Start the server
    await fastify.listen({
      port: config.server.port,
      host: config.server.host,
    });

    logger.info(`LLM Gateway started on ${config.server.host}:${config.server.port}`);
    logger.info(`Ollama URL: ${config.ollama.baseUrl}`);
    logger.info(`Swagger UI available at: http://${config.server.host}:${config.server.port}/docs`);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}
```

### **Application Configuration**
```typescript
export const createApp: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  // Initialize external services
  const redis = await initializeRedis();
  const db = await initializeDatabase();
  const kafka = await initializeKafka();

  // Initialize core services
  const ollamaService = new OllamaService();
  const queueProducer = new QueueProducer(redis);
  const userRateLimiter = new UserRateLimiter(redis);
  const modelRateLimiter = new ModelRateLimiter(redis);
  const responseCache = new ResponseCache(redis);

  // Store services in fastify instance for access in routes
  fastify.decorate('redis', redis);
  fastify.decorate('db', db);
  fastify.decorate('kafka', kafka);
  fastify.decorate('ollamaService', ollamaService);
  fastify.decorate('queueProducer', queueProducer);
  fastify.decorate('userRateLimiter', userRateLimiter);
  fastify.decorate('modelRateLimiter', modelRateLimiter);
  fastify.decorate('responseCache', responseCache);

  // Register security plugins
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  });

  await fastify.register(fastifyCors, {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
  });

  // Global rate limiting (basic protection)
  await fastify.register(fastifyRateLimit, {
    max: 1000,
    timeWindow: '1 minute',
    redis: redis,
  });

  await fastify.register(fastifyJwt, {
    secret: config.jwt.secret,
  });

  // WebSocket support for streaming
  await fastify.register(fastifyWebsocket);

  // Register OpenAPI documentation
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'LMS LLM Gateway API',
        description: 'Gateway service for managing LLM requests and responses',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://${config.server.host}:${config.server.port}`,
          description: 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      tags: [
        { name: 'Health', description: 'Health check endpoints' },
        { name: 'Chat', description: 'Chat completion endpoints' },
        { name: 'Embeddings', description: 'Text embedding endpoints' },
        { name: 'Models', description: 'Model management endpoints' },
        { name: 'Admin', description: 'Administrative endpoints' },
      ],
    },
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false,
    },
  });

  // Register middleware
  await fastify.register(requestLogger);
  await fastify.register(errorHandler);

  // Register routes
  await fastify.register(healthRoutes, { prefix: '/health' });
  await fastify.register(chatRoutes, { prefix: '/v1/chat' });
  await fastify.register(embeddingsRoutes, { prefix: '/v1/embeddings' });
  await fastify.register(modelsRoutes, { prefix: '/v1/models' });
  await fastify.register(adminRoutes, { prefix: '/admin' });

  // Health check for Ollama service
  const isOllamaHealthy = await ollamaService.healthCheck();
  if (!isOllamaHealthy) {
    logger.warn('Ollama service is not available at startup');
  } else {
    logger.info('Ollama service is healthy');
  }

  logger.info('LLM Gateway application initialized successfully');
};
```

---

## 🔌 **API Specification**

### **Chat Completion Endpoints**

#### **Create Chat Completion**
```http
POST /v1/chat/completions
Authorization: Bearer <jwt-token>
Content-Type: application/json

Request Body:
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
  "max_tokens": 150,
  "top_p": 1.0,
  "frequency_penalty": 0,
  "presence_penalty": 0,
  "stop": null,
  "stream": false
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
        "content": "Machine learning is a type of artificial intelligence where computers learn to make predictions or decisions by finding patterns in data, rather than being explicitly programmed for every task."
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

Error Response: 429 Too Many Requests
{
  "error": {
    "message": "Rate limit exceeded",
    "type": "rate_limit_error",
    "param": null,
    "code": null
  }
}
```

#### **Get Chat Job Status**
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
    "object": "chat.completion",
    "created": 1677652288,
    "model": "llama2",
    "choices": [...],
    "usage": {...}
  },
  "createdAt": "2024-01-01T00:00:00Z",
  "completedAt": "2024-01-01T00:00:05Z"
}
```

### **Embeddings Endpoints**

#### **Create Embeddings**
```http
POST /v1/embeddings
Authorization: Bearer <jwt-token>
Content-Type: application/json

Request Body:
{
  "model": "llama2",
  "input": "The quick brown fox jumps over the lazy dog",
  "user": "user-123"
}

Response: 200 OK
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [
        0.0023064255,
        -0.009327292,
        -0.0028842222,
        ...
      ],
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

Request Body:
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
  ],
  "model": "llama2",
  "usage": {
    "prompt_tokens": 15,
    "total_tokens": 15
  }
}
```

### **Model Management Endpoints**

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
      "owned_by": "ollama",
      "permission": [
        {
          "id": "perm-llama2",
          "object": "model_permission",
          "created": 1677610602,
          "allow_create_engine": false,
          "allow_sampling": true,
          "allow_logprobs": true,
          "allow_search_indices": false,
          "allow_view": true,
          "allow_fine_tuning": false,
          "organization": "ollama",
          "is_blocking": false
        }
      ],
      "root": "llama2",
      "parent": null
    },
    {
      "id": "codellama",
      "object": "model",
      "created": 1677610602,
      "owned_by": "ollama",
      "permission": [...],
      "root": "codellama",
      "parent": null
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

### **Health Check Endpoints**

#### **Basic Health Check**
```http
GET /health

Response: 200 OK
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "uptime": 3600
}
```

#### **Detailed Health Check**
```http
GET /health/detailed

Response: 200 OK
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "uptime": 3600,
  "services": {
    "ollama": {
      "status": "healthy",
      "responseTime": 45
    },
    "redis": {
      "status": "healthy",
      "responseTime": 8
    },
    "database": {
      "status": "healthy",
      "responseTime": 12
    },
    "queue": {
      "status": "healthy",
      "stats": {
        "waiting": 0,
        "active": 2,
        "completed": 150,
        "failed": 3
      }
    }
  }
}
```

#### **Readiness Probe**
```http
GET /health/ready

Response: 200 OK
{
  "status": "ready",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

#### **Liveness Probe**
```http
GET /health/live

Response: 200 OK
{
  "status": "alive",
  "timestamp": "2024-01-01T00:00:00Z",
  "uptime": 3600
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
    "failed": 15,
    "delayed": 0,
    "paused": 0
  },
  "embeddings": {
    "waiting": 2,
    "active": 1,
    "completed": 850,
    "failed": 8,
    "delayed": 0,
    "paused": 0
  },
  "total": {
    "waiting": 7,
    "active": 4,
    "completed": 2100,
    "failed": 23,
    "delayed": 0,
    "paused": 0
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
    },
    {
      "model": "codellama",
      "entries": 450
    }
  ],
  "topUsers": [
    {
      "userId": "user-123",
      "entries": 250
    },
    {
      "userId": "user-456",
      "entries": 180
    }
  ]
}
```

#### **Rate Limit Management**
```http
GET /admin/rate-limits/user/{userId}
Authorization: Bearer <admin-jwt-token>

Response: 200 OK
{
  "userId": "user-123",
  "currentRequests": 45,
  "burstRequests": 8,
  "windowStart": 1677652800,
  "burstWindowStart": 1677652860,
  "limits": {
    "hourly": {
      "limit": 100,
      "remaining": 55,
      "reset": 1677656400
    },
    "burst": {
      "limit": 10,
      "remaining": 2,
      "reset": 1677652920
    }
  }
}
```

---

## 🛡️ **Security & Middleware**

### **Authentication Middleware**
Based on the actual implementation from `/src/middleware/auth.ts`:

```typescript
export const authMiddleware = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    // Verify JWT token
    await request.jwtVerify();
    
    const payload = request.user as any;
    const userId = payload.sub || payload.userId;
    
    if (!userId) {
      throw new AuthenticationError('Invalid token payload');
    }

    // Attach user to request
    request.user = {
      id: userId,
      email: payload.email,
      username: payload.username,
      roles: payload.roles || [],
      isActive: payload.isActive ?? true,
    };

    if (!request.user.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }
    
    request.logger.debug('User authenticated', {
      userId: request.user.id,
      email: request.user.email,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError('Authentication failed');
  }
};

export const requireRole = (requiredRole: string) => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new AuthenticationError('Authentication required');
    }

    const userRoles = request.user.roles || [];
    if (!userRoles.includes(requiredRole) && !userRoles.includes('admin')) {
      throw new AuthorizationError(`${requiredRole} role required`);
    }
  };
};

export const requireAdmin = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  if (!request.user) {
    throw new AuthenticationError('Authentication required');
  }

  const userRoles = request.user.roles || [];
  if (!userRoles.includes('admin')) {
    throw new AuthorizationError('Admin access required');
  }
};
```

### **Rate Limiting Implementation**
Based on the actual implementation from `/src/rate-limiters/user-limiter.ts`:

```typescript
export class UserRateLimiter {
  private redis: Redis;
  private window: number;
  private maxRequests: number;
  private burstSize: number;

  constructor(redis: Redis) {
    this.redis = redis;
    this.window = config.rateLimit.window;
    this.maxRequests = config.rateLimit.maxRequests;
    this.burstSize = config.rateLimit.burstSize;
  }

  async checkRateLimit(userId: string): Promise<RateLimitInfo> {
    const key = `rate_limit:user:${userId}`;
    const now = Date.now();
    const windowStart = Math.floor(now / (this.window * 1000)) * this.window;

    // Use Redis pipeline for atomic operations
    const pipeline = this.redis.pipeline();
    
    // Get current count
    pipeline.get(`${key}:${windowStart}`);
    
    // Get burst count (last minute)
    const burstWindowStart = Math.floor(now / 60000) * 60;
    pipeline.get(`${key}:burst:${burstWindowStart}`);

    const results = await pipeline.exec();
    
    if (!results) {
      throw new Error('Redis pipeline execution failed');
    }

    const currentCount = parseInt(results[0]?.[1] as string || '0');
    const burstCount = parseInt(results[1]?.[1] as string || '0');

    // Check burst limit (requests per minute)
    if (burstCount >= this.burstSize) {
      const resetTime = (burstWindowStart + 60) * 1000;
      return {
        limit: this.burstSize,
        remaining: 0,
        reset: resetTime,
        retryAfter: Math.ceil((resetTime - now) / 1000),
      };
    }

    // Check window limit
    if (currentCount >= this.maxRequests) {
      const resetTime = (windowStart + this.window) * 1000;
      return {
        limit: this.maxRequests,
        remaining: 0,
        reset: resetTime,
        retryAfter: Math.ceil((resetTime - now) / 1000),
      };
    }

    // Increment counters
    const incrementPipeline = this.redis.pipeline();
    
    // Increment window counter
    incrementPipeline.incr(`${key}:${windowStart}`);
    incrementPipeline.expire(`${key}:${windowStart}`, this.window + 60); // Add buffer
    
    // Increment burst counter
    incrementPipeline.incr(`${key}:burst:${burstWindowStart}`);
    incrementPipeline.expire(`${key}:burst:${burstWindowStart}`, 120); // 2 minutes buffer

    await incrementPipeline.exec();

    const resetTime = (windowStart + this.window) * 1000;
    
    return {
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - currentCount - 1),
      reset: resetTime,
    };
  }
}
```

---

## 🔧 **Core Services Implementation**

### **Ollama Service Integration**
Based on the actual implementation from `/src/services/ollama.ts`:

```typescript
export class OllamaService {
  private client: AxiosInstance;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;
  private retryDelay: number;

  constructor() {
    this.baseUrl = config.ollama.baseUrl;
    this.timeout = config.ollama.timeout;
    this.maxRetries = config.ollama.maxRetries;
    this.retryDelay = config.ollama.retryDelay;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LMS-LLM-Gateway/1.0',
      },
    });

    this.setupInterceptors();
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const startTime = Date.now();
    
    try {
      const response = await retry(
        async () => {
          const ollamaRequest = this.transformChatRequest(request);
          const result = await this.client.post('/api/chat', ollamaRequest);
          return result;
        },
        {
          retries: this.maxRetries,
          minTimeout: this.retryDelay,
          maxTimeout: this.retryDelay * 4,
          onRetry: (error, attempt) => {
            logger.warn('Retrying Ollama chat request', {
              attempt,
              error: error.message,
              model: request.model,
            });
          },
        }
      );

      const processingTime = Date.now() - startTime;
      const transformedResponse = this.transformChatResponse(response.data, request.model, processingTime);

      logger.info('Chat completion successful', {
        model: request.model,
        processingTime,
        tokensUsed: transformedResponse.usage.total_tokens,
      });

      return transformedResponse;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Chat completion failed', {
        model: request.model,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw this.transformError(error);
    }
  }

  async embeddings(request: EmbeddingsRequest): Promise<EmbeddingsResponse> {
    const startTime = Date.now();
    
    try {
      const inputs = Array.isArray(request.input) ? request.input : [request.input];
      const embeddings = [];

      // Process embeddings in parallel for better performance
      const promises = inputs.map(async (input, index) => {
        const ollamaRequest = {
          model: request.model,
          prompt: input,
        };

        const response = await retry(
          async () => {
            const result = await this.client.post('/api/embeddings', ollamaRequest);
            return result;
          },
          {
            retries: this.maxRetries,
            minTimeout: this.retryDelay,
            maxTimeout: this.retryDelay * 4,
          }
        );

        return {
          object: 'embedding' as const,
          embedding: response.data.embedding,
          index,
        };
      });

      const results = await Promise.all(promises);
      embeddings.push(...results);

      const processingTime = Date.now() - startTime;
      const totalTokens = inputs.reduce((sum, input) => sum + this.estimateTokens(input), 0);

      const transformedResponse: EmbeddingsResponse = {
        object: 'list',
        data: embeddings,
        model: request.model,
        usage: {
          prompt_tokens: totalTokens,
          total_tokens: totalTokens,
        },
      };

      return transformedResponse;
    } catch (error) {
      throw this.transformError(error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/tags', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      logger.error('Ollama health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}
```

### **Queue Producer Implementation**
Based on the actual implementation from `/src/queue/producer.ts`:

```typescript
export class QueueProducer {
  private chatQueue: Queue<QueueJobData, QueueJobResult>;
  private embeddingsQueue: Queue<QueueJobData, QueueJobResult>;
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
    
    const queueOptions = {
      connection: redis,
      defaultJobOptions: {
        attempts: config.queue.maxAttempts,
        backoff: {
          type: config.queue.backoffType,
          delay: config.queue.delay,
        },
        removeOnComplete: config.queue.removeOnComplete,
        removeOnFail: config.queue.removeOnFail,
      },
    };

    this.chatQueue = new Queue('llm-chat', queueOptions);
    this.embeddingsQueue = new Queue('llm-embeddings', queueOptions);

    this.setupEventListeners();
  }

  async addChatJob(
    userId: string,
    request: ChatCompletionRequest,
    correlationId: string,
    priority: JobPriority = JobPriority.NORMAL
  ): Promise<string> {
    const jobId = uuidv4();
    const jobData: QueueJobData = {
      id: jobId,
      type: 'chat',
      userId,
      model: request.model,
      request,
      priority,
      correlationId,
      createdAt: new Date(),
      timeout: config.ollama.timeout,
    };

    const job = await this.chatQueue.add('process-chat', jobData, {
      jobId,
      priority,
      delay: 0,
    });

    logger.debug('Chat job added to queue', {
      jobId,
      userId,
      model: request.model,
      priority,
      correlationId,
    });

    return jobId;
  }

  async waitForJobCompletion(
    jobId: string, 
    type: 'chat' | 'embeddings',
    timeout: number = config.ollama.timeout
  ): Promise<QueueJobResult> {
    const queue = type === 'chat' ? this.chatQueue : this.embeddingsQueue;
    const job = await queue.getJob(jobId);
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Job ${jobId} timed out after ${timeout}ms`));
      }, timeout);

      const checkJob = async () => {
        try {
          const currentJob = await queue.getJob(jobId);
          if (!currentJob) {
            clearTimeout(timeoutId);
            reject(new Error(`Job ${jobId} not found`));
            return;
          }

          const state = await currentJob.getState();
          
          if (state === 'completed') {
            clearTimeout(timeoutId);
            resolve(currentJob.returnvalue);
          } else if (state === 'failed') {
            clearTimeout(timeoutId);
            reject(new Error(currentJob.failedReason || 'Job failed'));
          } else {
            // Job is still processing, check again
            setTimeout(checkJob, 1000);
          }
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
        }
      };

      checkJob();
    });
  }

  async getQueueStats() {
    const [chatStats, embeddingsStats] = await Promise.all([
      this.chatQueue.getJobCounts(),
      this.embeddingsQueue.getJobCounts(),
    ]);

    return {
      chat: chatStats,
      embeddings: embeddingsStats,
      total: {
        waiting: chatStats.waiting + embeddingsStats.waiting,
        active: chatStats.active + embeddingsStats.active,
        completed: chatStats.completed + embeddingsStats.completed,
        failed: chatStats.failed + embeddingsStats.failed,
        delayed: chatStats.delayed + embeddingsStats.delayed,
        paused: chatStats.paused + embeddingsStats.paused,
      },
    };
  }
}
```

### **Response Cache Implementation**
Based on the actual implementation from `/src/cache/response-cache.ts`:

```typescript
export class ResponseCache {
  private redis: Redis;
  private ttl: number;
  private enabled: boolean;

  constructor(redis: Redis) {
    this.redis = redis;
    this.ttl = config.cache.ttl;
    this.enabled = config.cache.responseCacheEnabled;
  }

  private generateCacheKey(request: ChatCompletionRequest | EmbeddingsRequest, userId: string): string {
    // Create a deterministic hash of the request
    const requestString = JSON.stringify({
      model: request.model,
      ...('messages' in request ? { messages: request.messages } : { input: request.input }),
      ...('temperature' in request && request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...('max_tokens' in request && request.max_tokens !== undefined ? { max_tokens: request.max_tokens } : {}),
      ...('top_p' in request && request.top_p !== undefined ? { top_p: request.top_p } : {}),
    });

    const hash = crypto.createHash('sha256').update(requestString).digest('hex');
    const type = 'messages' in request ? 'chat' : 'embeddings';
    
    return `llm_cache:${type}:${userId}:${hash}`;
  }

  async getCachedResponse(
    request: ChatCompletionRequest | EmbeddingsRequest,
    userId: string
  ): Promise<ChatCompletionResponse | EmbeddingsResponse | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const cacheKey = this.generateCacheKey(request, userId);
      const cachedData = await this.redis.get(cacheKey);

      if (!cachedData) {
        return null;
      }

      const parsed = JSON.parse(cachedData);
      
      // Update access count and last accessed time
      await this.redis.hincrby(`${cacheKey}:meta`, 'accessCount', 1);
      await this.redis.hset(`${cacheKey}:meta`, 'lastAccessed', Date.now());

      logger.debug('Cache hit', {
        cacheKey,
        userId,
        model: request.model,
      });

      return parsed.response;
    } catch (error) {
      logger.error('Error retrieving from cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        model: request.model,
      });
      return null;
    }
  }

  async setCachedResponse(
    request: ChatCompletionRequest | EmbeddingsRequest,
    response: ChatCompletionResponse | EmbeddingsResponse,
    userId: string
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const cacheKey = this.generateCacheKey(request, userId);
      const cacheData = {
        response,
        createdAt: Date.now(),
        model: request.model,
        userId,
      };

      // Store the response with TTL
      await this.redis.setex(cacheKey, this.ttl, JSON.stringify(cacheData));

      // Store metadata
      await this.redis.hmset(`${cacheKey}:meta`, {
        createdAt: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now(),
        model: request.model,
        userId,
        ttl: this.ttl,
      });

      // Set TTL for metadata
      await this.redis.expire(`${cacheKey}:meta`, this.ttl);

      logger.debug('Response cached', {
        cacheKey,
        userId,
        model: request.model,
        ttl: this.ttl,
      });
    } catch (error) {
      logger.error('Error storing in cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        model: request.model,
      });
    }
  }

  async getCacheStats(): Promise<{
    totalEntries: number;
    totalSize: number;
    hitRate: number;
    topModels: Array<{ model: string; entries: number }>;
    topUsers: Array<{ userId: string; entries: number }>;
  }> {
    try {
      const pattern = 'llm_cache:*:meta';
      const metaKeys = await this.redis.keys(pattern);
      
      if (metaKeys.length === 0) {
        return {
          totalEntries: 0,
          totalSize: 0,
          hitRate: 0,
          topModels: [],
          topUsers: [],
        };
      }

      const modelCounts = new Map<string, number>();
      const userCounts = new Map<string, number>();
      let totalAccesses = 0;
      let totalHits = 0;

      for (const metaKey of metaKeys) {
        const metadata = await this.redis.hgetall(metaKey);
        const model = metadata.model;
        const userId = metadata.userId;
        const accessCount = parseInt(metadata.accessCount || '0');

        if (model) {
          modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
        }

        if (userId) {
          userCounts.set(userId, (userCounts.get(userId) || 0) + 1);
        }

        totalAccesses += accessCount;
        if (accessCount > 0) {
          totalHits += accessCount;
        }
      }

      const topModels = Array.from(modelCounts.entries())
        .map(([model, entries]) => ({ model, entries }))
        .sort((a, b) => b.entries - a.entries)
        .slice(0, 10);

      const topUsers = Array.from(userCounts.entries())
        .map(([userId, entries]) => ({ userId, entries }))
        .sort((a, b) => b.entries - a.entries)
        .slice(0, 10);

      // Estimate total size (rough approximation)
      const avgKeySize = 1024; // Assume 1KB per cache entry
      const totalSize = metaKeys.length * avgKeySize;

      const hitRate = totalAccesses > 0 ? (totalHits / totalAccesses) * 100 : 0;

      return {
        totalEntries: metaKeys.length,
        totalSize,
        hitRate,
        topModels,
        topUsers,
      };
    } catch (error) {
      logger.error('Error getting cache stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        totalEntries: 0,
        totalSize: 0,
        hitRate: 0,
        topModels: [],
        topUsers: [],
      };
    }
  }
}
```

---

## 📊 **Monitoring & Observability**

### **Health Checks**
Based on the actual implementation from `/src/routes/health.ts`:

```typescript
export const healthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Detailed health check
  fastify.get('/detailed', {
    schema: {
      tags: ['Health'],
      summary: 'Detailed health check with service status',
      response: {
        200: HealthResponseSchema,
        503: HealthResponseSchema,
      },
    },
  }, async (request, reply) => {
    const services = {
      ollama: { status: 'unknown', responseTime: 0 },
      redis: { status: 'unknown', responseTime: 0 },
      database: { status: 'unknown', responseTime: 0 },
      queue: { status: 'unknown', stats: undefined as any },
    };

    let overallStatus = 'healthy';

    // Check Ollama service
    try {
      const ollamaStart = Date.now();
      const isHealthy = await fastify.ollamaService.healthCheck();
      services.ollama = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        responseTime: Date.now() - ollamaStart,
      };
      if (!isHealthy) overallStatus = 'degraded';
    } catch (error) {
      services.ollama = {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
      };
      overallStatus = 'unhealthy';
      request.logger.error('Ollama health check failed:', error);
    }

    // Check Redis
    try {
      const redisStart = Date.now();
      await fastify.redis.ping();
      services.redis = {
        status: 'healthy',
        responseTime: Date.now() - redisStart,
      };
    } catch (error) {
      services.redis = {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
      };
      overallStatus = 'unhealthy';
      request.logger.error('Redis health check failed:', error);
    }

    // Check Database
    try {
      const dbStart = Date.now();
      await fastify.db.raw('SELECT 1');
      services.database = {
        status: 'healthy',
        responseTime: Date.now() - dbStart,
      };
    } catch (error) {
      services.database = {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
      };
      overallStatus = 'unhealthy';
      request.logger.error('Database health check failed:', error);
    }

    // Check Queue
    try {
      const queueStats = await fastify.queueProducer.getQueueStats();
      services.queue = {
        status: 'healthy',
        stats: queueStats.total,
      };
    } catch (error) {
      services.queue = {
        status: 'unhealthy',
        stats: undefined,
      };
      overallStatus = 'degraded'; // Queue issues are not critical
      request.logger.error('Queue health check failed:', error);
    }

    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services,
    };

    if (overallStatus === 'unhealthy') {
      reply.status(503);
    }

    return response;
  });
};
```

### **Logging Configuration**
Based on the actual implementation from `/src/utils/logger.ts`:

```typescript
export const logger = winston.createLogger({
  level: config.monitoring.logLevel,
  format: logFormat,
  defaultMeta: { 
    service: 'llm-gateway',
    environment: config.nodeEnv 
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ],
});

// Add file transport in production
if (config.nodeEnv === 'production') {
  logger.add(new winston.transports.File({ 
    filename: 'logs/error.log', 
    level: 'error' 
  }));
  logger.add(new winston.transports.File({ 
    filename: 'logs/combined.log' 
  }));
}
```

### **Performance Metrics**
```typescript
const metrics = {
  requestDuration: new promClient.Histogram({
    name: 'llm_gateway_request_duration_seconds',
    help: 'LLM request processing duration',
    labelNames: ['method', 'route', 'model', 'status']
  }),
  
  queueSize: new promClient.Gauge({
    name: 'llm_gateway_queue_size',
    help: 'Current queue size',
    labelNames: ['queue_type']
  }),
  
  cacheHitRate: new promClient.Gauge({
    name: 'llm_gateway_cache_hit_rate',
    help: 'Cache hit rate percentage'
  }),
  
  rateLimitHits: new promClient.Counter({
    name: 'llm_gateway_rate_limit_hits_total',
    help: 'Total rate limit hits',
    labelNames: ['user_id', 'limit_type']
  })
};
```
```
```

---

## 🚀 **Deployment Configuration**

### **Dockerfile**
```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S llmuser -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=llmuser:nodejs /app/dist ./dist

# Switch to non-root user
USER llmuser

# Expose port
EXPOSE 3007

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3007/health || exit 1

# Start the application
CMD ["node", "dist/main.js"]
```

### **Docker Compose Integration**
```yaml
version: '3.8'

services:
  llm-gateway:
    build:
      context: ./services/llm-gateway
      dockerfile: Dockerfile
    ports:
      - "3007:3007"
    environment:
      - NODE_ENV=production
      - PORT=3007
      - DATABASE_URL=postgresql://lms_user:${DB_PASSWORD}@postgres:5432/lms_llm_gateway
      - REDIS_URL=redis://redis:6379
      - OLLAMA_BASE_URL=http://ollama:11434
      - KAFKA_BROKERS=kafka:9092
      - JWT_SECRET=${JWT_SECRET}
      - CORS_ORIGIN=${FRONTEND_URL}
      - RATE_LIMIT_MAX_REQUESTS=100
      - CACHE_TTL=3600
      - ENABLE_RATE_LIMITING=true
      - ENABLE_CACHING=true
      - ENABLE_QUEUE_PROCESSING=true
    depends_on:
      - postgres
      - redis
      - kafka
      - ollama
    networks:
      - lms-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3007/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    environment:
      - OLLAMA_ORIGINS=*
    networks:
      - lms-network
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 4G
        reservations:
          memory: 2G

volumes:
  ollama-data:

networks:
  lms-network:
    driver: bridge
```

---

## 📈 **Performance Requirements**

### **Response Time Targets**
- **Chat completion requests:** < 5 seconds (95th percentile)
- **Embedding generation:** < 2 seconds (average)
- **Cache hit responses:** < 100ms
- **Health check endpoints:** < 50ms
- **Administrative endpoints:** < 200ms

### **Throughput Requirements**
- **Peak load:** 500 requests/second
- **Sustained load:** 200 requests/second
- **Queue processing:** 100 jobs/minute
- **Concurrent connections:** 1,000 active connections

### **Resource Utilization**
- **Memory usage:** < 1GB under normal load
- **CPU usage:** < 70% under peak load
- **Redis memory:** < 500MB for cache and rate limiting
- **Queue processing:** < 10 seconds average job time

### **Scalability Targets**
- **Horizontal scaling:** Support 5+ instances
- **Load balancing:** Round-robin with health checks
- **Auto-scaling:** Based on queue size and CPU metrics
- **Geographic distribution:** Multi-region deployment ready

---

## 🔒 **Security Requirements**

### **Authentication & Authorization**
- **JWT validation:** HS256 algorithm with configurable secret
- **Token expiration:** Configurable (default 24 hours)
- **Role-based access:** Admin, premium, and regular user tiers
- **Service authentication:** Internal service-to-service auth
- **Rate limiting:** Per-user and per-model quotas

### **Input Validation**
- **Request validation:** TypeBox schema validation
- **Content filtering:** Optional content moderation
- **Prompt length limits:** Configurable maximum lengths
- **Model restrictions:** Whitelist of allowed models
- **Pattern blocking:** Configurable blocked content patterns

### **Security Headers**
```typescript
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};
```

### **Audit Logging**
```typescript
interface AuditLog {
  timestamp: string;
  userId?: string;
  action: string;
  model: string;
  tokensUsed: number;
  processingTime: number;
  clientIp: string;
  userAgent: string;
  success: boolean;
  correlationId: string;
}
```

---

## 🧪 **Testing Strategy**

### **Unit Tests**
```typescript
describe('OllamaService', () => {
  describe('chatCompletion', () => {
    it('should process chat completion successfully', async () => {
      const request: ChatCompletionRequest = {
        model: 'llama2',
        messages: [{ role: 'user', content: 'Hello' }]
      };

      const response = await ollamaService.chatCompletion(request);

      expect(response.id).toBeDefined();
      expect(response.choices).toHaveLength(1);
      expect(response.usage.total_tokens).toBeGreaterThan(0);
    });
  });

  describe('healthCheck', () => {
    it('should return true when Ollama is healthy', async () => {
      const isHealthy = await ollamaService.healthCheck();
      expect(isHealthy).toBe(true);
    });
  });
});
```

### **Integration Tests**
```typescript
describe('LLM Gateway API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /v1/chat/completions', () => {
    it('should process chat completion with valid token', async () => {
      const token = await getValidToken();
      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          model: 'llama2',
          messages: [{ role: 'user', content: 'Hello' }]
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('choices');
    });

    it('should reject requests without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'llama2',
          messages: [{ role: 'user', content: 'Hello' }]
        }
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
```

### **Load Testing**
```typescript
// Artillery configuration for load testing
const loadTestConfig = {
  config: {
    target: 'http://localhost:3007',
    phases: [
      { duration: 60, arrivalRate: 10 },   // Warm up
      { duration: 120, arrivalRate: 50 },  // Ramp up
      { duration: 300, arrivalRate: 100 }, // Sustained load
      { duration: 60, arrivalRate: 200 }   // Peak load
    ],
    processor: './load-test-processor.js'
  },
  scenarios: [
    {
      name: 'Chat Completions',
      weight: 70,
      flow: [
        {
          post: {
            url: '/v1/chat/completions',
            headers: {
              authorization: 'Bearer {{ token }}'
            },
            json: {
              model: 'llama2',
              messages: [
                { role: 'user', content: 'Hello, how are you?' }
              ]
            }
          }
        }
      ]
    },
    {
      name: 'Embeddings',
      weight: 30,
      flow: [
        {
          post: {
            url: '/v1/embeddings',
            headers: {
              authorization: 'Bearer {{ token }}'
            },
            json: {
              model: 'llama2',
              input: 'Text to embed'
            }
          }
        }
      ]
    }
  ]
};
```

---

## 🎯 **Success Criteria**

### **Functional Requirements**
- ✅ Successfully process chat completion requests via Ollama
- ✅ Generate text embeddings for semantic search
- ✅ Implement comprehensive rate limiting per user and model
- ✅ Provide intelligent response caching with Redis
- ✅ Support queue-based processing with BullMQ
- ✅ Integrate with JWT authentication system
- ✅ Publish analytics events to Kafka

### **Non-Functional Requirements**
- ✅ **Availability:** 99.9% uptime SLA
- ✅ **Performance:** < 5 seconds chat completion response time
- ✅ **Scalability:** Handle 500 concurrent requests
- ✅ **Security:** Zero security vulnerabilities
- ✅ **Monitoring:** Comprehensive health checks and metrics
- ✅ **Documentation:** Complete API documentation with Swagger
- ✅ **Maintainability:** Clean, testable TypeScript codebase

### **Technical Requirements**
- ✅ **Ollama Integration:** Direct API integration with retry logic
- ✅ **Queue Management:** BullMQ with priority queues and job tracking
- ✅ **Cache Strategy:** Redis-based intelligent caching with TTL
- ✅ **Rate Limiting:** Multi-tier rate limiting with burst protection
- ✅ **Event Publishing:** Kafka integration for analytics
- ✅ **Health Monitoring:** Kubernetes-ready health probes
- ✅ **Error Handling:** Graceful degradation and circuit breakers

---

This specification provides a complete blueprint for building a production-ready LLM Gateway Service that serves as the centralized AI model interface for the LMS platform, ensuring scalable, secure, and performant AI operations while maintaining comprehensive monitoring and observability.
