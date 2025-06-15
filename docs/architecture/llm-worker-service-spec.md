# LLM Worker Service Technical Specification

## 🎯 **Service Overview**

The LLM Worker Service is a high-performance background processing service that consumes LLM requests from Redis queues, interfaces directly with Ollama, and processes AI model requests asynchronously with comprehensive fallback strategies, circuit breaker patterns, and intelligent model management.

### **Core Responsibilities**
- Asynchronous processing of LLM requests from BullMQ queues
- Direct integration with Ollama for chat completions and embeddings
- Dynamic model loading, unloading, and lifecycle management
- Circuit breaker implementation for fault tolerance and resilience
- Intelligent fallback strategies with alternative model routing
- System resource monitoring and optimization
- Performance metrics collection and health monitoring
- Event-driven architecture with comprehensive logging

### **Service Characteristics**
- **Technology Stack:** Node.js + TypeScript with BullMQ
- **Health Port:** 3008 (HTTP server for health checks and metrics)
- **Queue System:** BullMQ with Redis for job processing
- **LLM Backend:** Direct Ollama integration via HTTP API
- **Model Management:** Dynamic loading with memory optimization
- **Monitoring:** System metrics with systeminformation package
- **Resilience:** Circuit breaker patterns with automatic recovery

---

## 🏗️ **Architecture Design**

### **High-Level Architecture**
```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│   LLM Gateway   │────│   Redis Queue        │────│   LLM Worker    │
│   (Producer)    │    │   (BullMQ)           │    │   (Consumer)    │
└─────────────────┘    └──────────────────────┘    └─────────────────┘
                                                            │
                    ┌───────────────────────────────────────┼───────────────────────────────────────┐
                    │                                       │                                       │
            ┌───────▼───────┐                   ┌──────────▼──────────┐                   ┌───────▼───────┐
            │   Ollama      │                   │   Model Manager     │                   │ Circuit       │
            │   Client      │                   │   (Dynamic Loading) │                   │ Breaker       │
            └───────────────┘                   └─────────────────────┘                   └───────────────┘
                    │                                       │                                       │
            ┌───────▼───────┐                   ┌──────────▼──────────┐                   ┌───────▼───────┐
            │   Ollama      │                   │   System Metrics    │                   │ Fallback      │
            │   Server      │                   │   (CPU/Memory/GPU)  │                   │ Strategies    │
            │ (Port 11434)  │                   └─────────────────────┘                   └───────────────┘
            └───────────────┘
```

### **Request Processing Pipeline**
```
Queue Job → Job Validation → Model Loading → Circuit Breaker Check → 
Ollama Request → Response Processing → Result Publishing → Metrics Update
```

### **Service Components**
- **Worker Manager** - Orchestrates all worker components and lifecycle
- **Queue Consumers** - BullMQ job consumers for different request types
- **Request Processors** - Business logic for processing different job types
- **Ollama Client** - Direct HTTP integration with Ollama API
- **Model Manager** - Dynamic model loading and lifecycle management
- **Circuit Breaker** - Fault tolerance and failure isolation
- **Health Server** - HTTP server for health checks and metrics
- **System Monitor** - Resource usage monitoring and optimization

---

## 📊 **Data Models**

### **Core Job Models**
Based on the actual TypeScript definitions from `/src/types/index.ts`:

```typescript
interface QueueJobData {
  id: string;
  type: 'chat' | 'embeddings' | 'batch';
  userId: string;
  model: string;
  request: any;
  priority?: number;
  correlationId: string;
  createdAt: Date;
  timeout?: number;
  retryCount?: number;
  maxRetries?: number;
}

interface QueueJobResult {
  success: boolean;
  response?: any;
  error?: string;
  processingTime: number;
  model: string;
  tokensUsed?: number;
  retryCount?: number;
  fallbackUsed?: boolean;
  cacheHit?: boolean;
}
```

### **Ollama Integration Models**
```typescript
interface OllamaRequest {
  model: string;
  messages?: Array<{
    role: string;
    content: string;
  }>;
  prompt?: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
  };
}

interface OllamaResponse {
  model: string;
  created_at: string;
  message?: {
    role: string;
    content: string;
  };
  response?: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}
```

### **Model Management Models**
```typescript
interface ModelInfo {
  name: string;
  isLoaded: boolean;
  loadedAt?: Date;
  lastUsed?: Date;
  memoryUsage?: number;
  requestCount: number;
  errorCount: number;
  avgResponseTime: number;
  isHealthy: boolean;
  lastHealthCheck?: Date;
}

interface ModelLoadRequest {
  model: string;
  priority: 'low' | 'normal' | 'high';
  timeout?: number;
}

interface ModelLoadResult {
  success: boolean;
  model: string;
  loadTime: number;
  error?: string;
}
```

### **Circuit Breaker Models**
```typescript
interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
  successCount: number;
}
```

### **System Monitoring Models**
```typescript
interface SystemMetrics {
  timestamp: Date;
  workerId: string;
  cpu: {
    usage: number;
    load: number[];
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  gpu?: {
    usage: number;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
  };
  network: {
    rx: number;
    tx: number;
  };
}

interface PerformanceMetrics {
  requestsProcessed: number;
  requestsSuccessful: number;
  requestsFailed: number;
  avgProcessingTime: number;
  totalProcessingTime: number;
  memoryUsage: number;
  cpuUsage: number;
  gpuUsage?: number;
  queueDepth: number;
  modelsLoaded: number;
  cacheHitRate: number;
}
```

### **Error Handling Models**
```typescript
interface ProcessingError {
  type: 'validation' | 'model' | 'timeout' | 'memory' | 'network' | 'unknown';
  message: string;
  code?: string;
  retryable: boolean;
  fallbackAvailable: boolean;
  context?: Record<string, any>;
}
```

---

## ⚙️ **Configuration Management**

Based on the actual configuration from `/src/config/index.ts`:

### **Environment Variables**
```bash
# Worker Configuration
WORKER_ID=llm-worker-1
WORKER_CONCURRENCY=5
WORKER_BATCH_SIZE=10
WORKER_TIMEOUT=300000

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_TIMEOUT=300000
OLLAMA_MAX_CONNECTIONS=10
OLLAMA_HEALTH_CHECK_INTERVAL=30000
OLLAMA_MODEL_LOAD_TIMEOUT=120000
OLLAMA_MAX_RETRIES=3
OLLAMA_RETRY_DELAY=1000

# Queue Configuration
QUEUE_CHAT_NAME=llm-chat
QUEUE_EMBEDDINGS_NAME=llm-embeddings
QUEUE_BATCH_NAME=llm-batch
QUEUE_PRIORITY_NAME=llm-priority
QUEUE_MAX_ATTEMPTS=3
QUEUE_DELAY=1000
QUEUE_BACKOFF_TYPE=exponential
QUEUE_REMOVE_ON_COMPLETE=100
QUEUE_REMOVE_ON_FAIL=50

# Model Configuration
DEFAULT_CHAT_MODEL=llama2
DEFAULT_EMBEDDING_MODEL=llama2
ALLOWED_MODELS=llama2,codellama,mistral,phi,neural-chat
MODEL_PRELOAD_ENABLED=true
MODEL_PRELOAD_LIST=llama2,mistral
MODEL_UNLOAD_TIMEOUT=300000
MODEL_MEMORY_THRESHOLD=0.8

# Fallback Configuration
ENABLE_MODEL_FALLBACK=true
FALLBACK_MODELS=llama2,mistral,phi
ENABLE_CIRCUIT_BREAKER=true
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT=60000
CIRCUIT_BREAKER_RESET_TIMEOUT=300000

# Performance Configuration
ENABLE_BATCH_PROCESSING=true
BATCH_TIMEOUT=5000
ENABLE_STREAMING=true
ENABLE_GPU_OPTIMIZATION=true
MEMORY_LIMIT=8192
GPU_MEMORY_LIMIT=4096

# Monitoring Configuration
METRICS_ENABLED=true
HEALTH_CHECK_PORT=3008
LOG_LEVEL=info
LOG_FORMAT=json
ENABLE_PERFORMANCE_MONITORING=true
PERFORMANCE_SAMPLE_RATE=0.1

# Resource Management
MAX_CONCURRENT_REQUESTS=10
REQUEST_QUEUE_SIZE=100
MEMORY_CLEANUP_INTERVAL=60000
MODEL_CACHE_SIZE=5
RESPONSE_CACHE_TTL=3600

# Error Handling
ENABLE_DEAD_LETTER_QUEUE=true
DEAD_LETTER_QUEUE_NAME=llm-dead-letter
ERROR_RETRY_ATTEMPTS=3
ERROR_RETRY_DELAY=2000
ENABLE_ERROR_NOTIFICATIONS=true

# Security
ENABLE_REQUEST_VALIDATION=true
MAX_PROMPT_LENGTH=8192
MAX_RESPONSE_LENGTH=16384
ENABLE_CONTENT_FILTERING=false
```

### **Configuration Schema**
Based on the Zod validation schema:

```typescript
const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  worker: z.object({
    id: z.string().default('llm-worker-1'),
    concurrency: z.coerce.number().default(5),
    batchSize: z.coerce.number().default(10),
    timeout: z.coerce.number().default(300000),
  }),

  ollama: z.object({
    baseUrl: z.string().default('http://localhost:11434'),
    timeout: z.coerce.number().default(300000),
    maxConnections: z.coerce.number().default(10),
    healthCheckInterval: z.coerce.number().default(30000),
    modelLoadTimeout: z.coerce.number().default(120000),
    maxRetries: z.coerce.number().default(3),
    retryDelay: z.coerce.number().default(1000),
  }),

  models: z.object({
    defaultChatModel: z.string().default('llama2'),
    defaultEmbeddingModel: z.string().default('llama2'),
    allowedModels: z.string().transform(str => str.split(',')),
    preloadEnabled: z.coerce.boolean().default(true),
    preloadList: z.string().transform(str => str.split(',')),
    unloadTimeout: z.coerce.number().default(300000),
    memoryThreshold: z.coerce.number().default(0.8),
  }),

  fallback: z.object({
    enableModelFallback: z.coerce.boolean().default(true),
    fallbackModels: z.string().transform(str => str.split(',')),
    enableCircuitBreaker: z.coerce.boolean().default(true),
    circuitBreakerThreshold: z.coerce.number().default(5),
    circuitBreakerTimeout: z.coerce.number().default(60000),
    circuitBreakerResetTimeout: z.coerce.number().default(300000),
  }),

  monitoring: z.object({
    metricsEnabled: z.coerce.boolean().default(true),
    logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    logFormat: z.enum(['json', 'simple']).default('json'),
    enablePerformanceMonitoring: z.coerce.boolean().default(true),
    performanceSampleRate: z.coerce.number().default(0.1),
  }),
});
```

---
## 🔧 **Core Implementation**

### **Application Entry Point**
Based on `/src/main.ts`:

```typescript
async function start() {
  logger.info('Starting LLM Worker Service', {
    workerId: config.worker.id,
    environment: config.nodeEnv,
    concurrency: config.worker.concurrency,
  });

  try {
    // Initialize health server
    const healthServer = new HealthServer();
    await healthServer.start();

    // Initialize worker manager
    const workerManager = new WorkerManager();
    await workerManager.initialize();
    await workerManager.start();

    logger.info('LLM Worker Service started successfully', {
      workerId: config.worker.id,
      healthPort: config.health.port,
      ollamaUrl: config.ollama.baseUrl,
    });

    // Handle graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        await workerManager.stop();
        await healthServer.stop();
        logger.info('LLM Worker Service stopped gracefully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  } catch (error) {
    logger.error('Failed to start LLM Worker Service:', error);
    process.exit(1);
  }
}
```

### **Worker Manager Implementation**
Based on `/src/worker-manager.ts`:

```typescript
export class WorkerManager extends EventEmitter {
  private redis?: Redis;
  private ollamaClient?: OllamaClient;
  private modelManager?: ModelManager;
  private circuitBreaker?: CircuitBreaker;
  private chatConsumer?: ChatConsumer;

  async initialize(): Promise<void> {
    logger.info('Initializing Worker Manager', {
      workerId: config.worker.id,
      concurrency: config.worker.concurrency,
      ollamaUrl: config.ollama.baseUrl,
    });

    // Initialize Redis connection
    await this.initializeRedis();

    // Initialize Ollama client
    this.initializeOllamaClient();

    // Initialize circuit breaker
    this.initializeCircuitBreaker();

    // Initialize model manager
    await this.initializeModelManager();

    // Initialize consumers
    await this.initializeConsumers();

    this.isInitialized = true;
  }

  private async initializeRedis(): Promise<void> {
    const redisConfig = config.redis.url 
      ? { url: config.redis.url }
      : {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db,
        };

    this.redis = new Redis({
      ...redisConfig,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    await this.redis.ping();
  }

  private async initializeModelManager(): Promise<void> {
    this.modelManager = new ModelManager(this.ollamaClient!);
    
    this.modelManager.on('modelLoaded', (event) => {
      logger.info('Model loaded', {
        workerId: config.worker.id,
        model: event.model,
        loadTime: event.loadTime,
      });
    });

    await this.modelManager.initialize();
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    try {
      const checks = await Promise.allSettled([
        this.redis?.ping(),
        this.ollamaClient?.healthCheck(),
        this.chatConsumer?.healthCheck(),
      ]);

      const redisHealthy = checks[0]?.status === 'fulfilled';
      const ollamaHealthy = checks[1]?.status === 'fulfilled' && checks[1]?.value === true;
      const consumerHealth = checks[2]?.status === 'fulfilled' ? checks[2]?.value : null;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      if (!redisHealthy || !ollamaHealthy) {
        status = 'unhealthy';
      } else if (consumerHealth?.status !== 'healthy') {
        status = consumerHealth?.status || 'degraded';
      }

      return {
        status,
        details: {
          redis: redisHealthy,
          ollama: ollamaHealthy,
          consumer: consumerHealth,
          isRunning: this.isRunning,
          isInitialized: this.isInitialized,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}
```

### **Health Server Implementation**
Based on `/src/health-server.ts`:

```typescript
export class HealthServer {
  private server?: http.Server;
  private isRunning: boolean = false;

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(config.health.port, (error?: Error) => {
        if (error) {
          reject(error);
        } else {
          this.isRunning = true;
          logger.info('Health server started', {
            port: config.health.port,
            workerId: config.worker.id,
          });
          resolve();
        }
      });
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '';
    const method = req.method || 'GET';

    switch (url) {
      case '/health':
      case '/':
        this.handleBasicHealth(res);
        break;
      case '/health/live':
        this.handleLiveness(res);
        break;
      case '/health/ready':
        this.handleReadiness(res);
        break;
      case '/metrics':
        this.handleMetrics(res);
        break;
      default:
        this.sendResponse(res, 404, { error: 'Not found' });
    }
  }

  private handleMetrics(res: http.ServerResponse): void {
    const metrics = [
      `# HELP llm_worker_uptime_seconds Worker uptime in seconds`,
      `# TYPE llm_worker_uptime_seconds counter`,
      `llm_worker_uptime_seconds{worker_id="${config.worker.id}"} ${process.uptime()}`,
      '',
      `# HELP llm_worker_memory_usage_bytes Worker memory usage in bytes`,
      `# TYPE llm_worker_memory_usage_bytes gauge`,
      `llm_worker_memory_usage_bytes{worker_id="${config.worker.id}"} ${process.memoryUsage().heapUsed}`,
      '',
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain');
    this.sendResponse(res, 200, metrics, false);
  }
}
```

---

## 🔄 **Queue Processing**

### **Chat Consumer Implementation**
Based on `/src/consumers/chat-consumer.ts`:

```typescript
export class ChatConsumer {
  private worker: Worker<QueueJobData, QueueJobResult>;
  private processor: ChatProcessor;

  constructor(
    redis: Redis,
    ollamaClient: OllamaClient,
    modelManager: ModelManager,
    circuitBreaker: CircuitBreaker
  ) {
    this.processor = new ChatProcessor(ollamaClient, modelManager, circuitBreaker);
    
    this.worker = new Worker<QueueJobData, QueueJobResult>(
      config.queue.chatName,
      async (job: Job<QueueJobData, QueueJobResult>) => {
        return await this.processJob(job);
      },
      {
        connection: redis,
        concurrency: config.worker.concurrency,
        removeOnComplete: config.queue.removeOnComplete,
        removeOnFail: config.queue.removeOnFail,
        settings: {
          stalledInterval: 30000,
          maxStalledCount: 1,
        },
      }
    );

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.worker.on('completed', (job: Job<QueueJobData, QueueJobResult>, result: QueueJobResult) => {
      logger.info('Chat job completed', {
        jobId: job.id,
        userId: job.data.userId,
        model: job.data.model,
        processingTime: result.processingTime,
        tokensUsed: result.tokensUsed,
        workerId: config.worker.id,
      });
    });

    this.worker.on('failed', (job: Job<QueueJobData, QueueJobResult> | undefined, error: Error) => {
      logger.error('Chat job failed', {
        jobId: job?.id,
        userId: job?.data.userId,
        model: job?.data.model,
        error: error.message,
        attempts: job?.attemptsMade,
        workerId: config.worker.id,
      });
    });
  }

  private async processJob(job: Job<QueueJobData, QueueJobResult>): Promise<QueueJobResult> {
    try {
      // Add retry count to job data
      job.data.retryCount = job.attemptsMade;

      // Process the job
      const result = await this.processor.process(job.data);
      
      // Add processing metadata
      result.retryCount = job.attemptsMade;
      
      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime,
        model: job.data?.model || 'unknown',
        retryCount: job.attemptsMade,
      };
    }
  }
}
```

### **Base Processor Implementation**
Based on `/src/processors/base-processor.ts`:

```typescript
export abstract class BaseProcessor extends EventEmitter {
  protected ollamaClient: OllamaClient;
  protected modelManager: ModelManager;
  protected circuitBreaker: CircuitBreaker;

  abstract process(job: QueueJobData): Promise<QueueJobResult>;

  protected async ensureModelLoaded(modelName: string): Promise<void> {
    if (!this.ollamaClient.validateModel(modelName)) {
      throw {
        type: 'validation',
        message: `Model '${modelName}' is not allowed`,
        retryable: false,
        fallbackAvailable: false,
      } as ProcessingError;
    }

    if (!this.modelManager.isModelLoaded(modelName)) {
      logger.info('Loading model for job', {
        model: modelName,
        workerId: config.worker.id,
      });

      try {
        await this.modelManager.loadModel(modelName, 'normal');
      } catch (error) {
        throw {
          type: 'model',
          message: `Failed to load model '${modelName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
          retryable: true,
          fallbackAvailable: true,
        } as ProcessingError;
      }
    }
  }

  protected handleProcessingError(error: any, job: QueueJobData): ProcessingError {
    if (error.code === 'ETIMEDOUT') {
      return {
        type: 'timeout',
        message: 'Request timed out',
        retryable: true,
        fallbackAvailable: true,
        context: { jobId: job.id, model: job.model },
      };
    }

    if (error.message?.includes('memory')) {
      return {
        type: 'memory',
        message: 'Insufficient memory',
        retryable: true,
        fallbackAvailable: true,
        context: { jobId: job.id, model: job.model },
      };
    }

    return {
      type: 'unknown',
      message: error.message || 'Unknown processing error',
      retryable: false,
      fallbackAvailable: true,
      context: { jobId: job.id, model: job.model },
    };
  }

  protected async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string = 'Operation timed out'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject({
          type: 'timeout',
          message: timeoutMessage,
          retryable: true,
          fallbackAvailable: true,
        } as ProcessingError);
      }, timeoutMs);

      operation()
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }
}
```

---
## 🤖 **Ollama Integration**

### **Ollama Client Implementation**
Based on `/src/ollama/client.ts`:

```typescript
export class OllamaClient {
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
        'User-Agent': `LMS-LLM-Worker/${config.worker.id}`,
      },
      maxRedirects: 0,
    });

    this.setupInterceptors();
  }

  async chatCompletion(request: OllamaRequest): Promise<OllamaResponse> {
    const startTime = Date.now();
    
    try {
      const response = await retry(
        async () => {
          const result = await this.client.post('/api/chat', {
            model: request.model,
            messages: request.messages,
            stream: false,
            options: request.options,
          });
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
              workerId: config.worker.id,
            });
          },
        }
      );

      const processingTime = Date.now() - startTime;
      logger.info('Chat completion successful', {
        model: request.model,
        processingTime,
        workerId: config.worker.id,
      });

      return response.data;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Chat completion failed', {
        model: request.model,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
      throw this.transformError(error);
    }
  }

  async embeddings(request: OllamaRequest): Promise<OllamaEmbeddingResponse> {
    const startTime = Date.now();
    
    try {
      const response = await retry(
        async () => {
          const result = await this.client.post('/api/embeddings', {
            model: request.model,
            prompt: request.prompt,
          });
          return result;
        },
        {
          retries: this.maxRetries,
          minTimeout: this.retryDelay,
          maxTimeout: this.retryDelay * 4,
        }
      );

      const processingTime = Date.now() - startTime;
      logger.info('Embeddings generation successful', {
        model: request.model,
        processingTime,
        workerId: config.worker.id,
      });

      return response.data;
    } catch (error) {
      throw this.transformError(error);
    }
  }

  async pullModel(modelName: string): Promise<void> {
    try {
      logger.info('Pulling model', { 
        model: modelName,
        workerId: config.worker.id 
      });
      
      await this.client.post('/api/pull', {
        name: modelName,
        stream: false,
      }, {
        timeout: config.ollama.modelLoadTimeout,
      });

      logger.info('Model pulled successfully', { 
        model: modelName,
        workerId: config.worker.id 
      });
    } catch (error) {
      logger.error('Failed to pull model', {
        model: modelName,
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
      throw this.transformError(error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/tags', { 
        timeout: 5000 
      });
      return response.status === 200;
    } catch (error) {
      logger.debug('Ollama health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
      return false;
    }
  }

  // Streaming support for chat completions
  async *chatCompletionStream(request: OllamaRequest): AsyncGenerator<OllamaResponse, void, unknown> {
    try {
      const response = await this.client.post('/api/chat', {
        model: request.model,
        messages: request.messages,
        stream: true,
        options: request.options,
      }, {
        responseType: 'stream',
      });

      let buffer = '';
      
      for await (const chunk of response.data) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              yield data;
            } catch (parseError) {
              logger.warn('Failed to parse streaming response', {
                line,
                error: parseError instanceof Error ? parseError.message : 'Unknown error',
                workerId: config.worker.id,
              });
            }
          }
        }
      }
    } catch (error) {
      logger.error('Streaming chat completion failed', {
        model: request.model,
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
      throw this.transformError(error);
    }
  }

  private transformError(error: any): ProcessingError {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error || error.message;
      
      switch (status) {
        case 400:
          return {
            type: 'validation',
            message: `Bad Request: ${message}`,
            retryable: false,
            fallbackAvailable: false,
          };
        case 404:
          return {
            type: 'model',
            message: `Model not found: ${message}`,
            retryable: false,
            fallbackAvailable: true,
          };
        case 429:
          return {
            type: 'network',
            message: `Rate limit exceeded: ${message}`,
            retryable: true,
            fallbackAvailable: false,
          };
        case 500:
        case 502:
        case 503:
          return {
            type: 'network',
            message: `Ollama server error (${status}): ${message}`,
            retryable: true,
            fallbackAvailable: true,
          };
        default:
          return {
            type: 'unknown',
            message: `Ollama error (${status}): ${message}`,
            retryable: status >= 500,
            fallbackAvailable: true,
          };
      }
    } else if (error.code === 'ECONNREFUSED') {
      return {
        type: 'network',
        message: 'Cannot connect to Ollama server',
        retryable: true,
        fallbackAvailable: false,
      };
    } else if (error.code === 'ETIMEDOUT') {
      return {
        type: 'timeout',
        message: 'Request to Ollama server timed out',
        retryable: true,
        fallbackAvailable: true,
      };
    } else {
      return {
        type: 'unknown',
        message: `Ollama error: ${error.message}`,
        retryable: false,
        fallbackAvailable: true,
      };
    }
  }
}
```

---

## 🧠 **Model Management**

### **Model Manager Implementation**
Based on `/src/models/manager.ts`:

```typescript
export class ModelManager extends EventEmitter {
  private ollamaClient: OllamaClient;
  private loadedModels: Map<string, ModelInfo>;
  private loadingQueue: ModelLoadRequest[];
  private isProcessingQueue: boolean;
  private healthCheckInterval?: NodeJS.Timeout;
  private memoryCleanupInterval?: NodeJS.Timeout;

  constructor(ollamaClient: OllamaClient) {
    super();
    this.ollamaClient = ollamaClient;
    this.loadedModels = new Map();
    this.loadingQueue = [];
    this.isProcessingQueue = false;
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Model Manager', {
      workerId: config.worker.id,
      preloadEnabled: config.models.preloadEnabled,
      preloadList: config.models.preloadList,
    });

    // Get currently loaded models from Ollama
    await this.syncLoadedModels();

    // Preload models if enabled
    if (config.models.preloadEnabled) {
      await this.preloadModels();
    }

    // Start health check interval
    this.startHealthChecks();

    // Start memory cleanup interval
    this.startMemoryCleanup();

    logger.info('Model Manager initialized successfully', {
      workerId: config.worker.id,
      loadedModels: Array.from(this.loadedModels.keys()),
    });
  }

  async syncLoadedModels(): Promise<void> {
    try {
      const models = await this.ollamaClient.getModels();
      
      // Clear current loaded models
      this.loadedModels.clear();

      // Add models from Ollama
      for (const model of models) {
        this.loadedModels.set(model.name, {
          name: model.name,
          isLoaded: true,
          loadedAt: new Date(),
          lastUsed: new Date(),
          memoryUsage: model.size,
          requestCount: 0,
          errorCount: 0,
          avgResponseTime: 0,
          isHealthy: true,
          lastHealthCheck: new Date(),
        });
      }

      logger.info('Synced loaded models', {
        workerId: config.worker.id,
        modelCount: this.loadedModels.size,
        models: Array.from(this.loadedModels.keys()),
      });
    } catch (error) {
      logger.error('Failed to sync loaded models', {
        workerId: config.worker.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async loadModel(modelName: string, priority: 'low' | 'normal' | 'high' = 'normal', timeout?: number): Promise<ModelLoadResult> {
    const startTime = Date.now();

    // Check if model is already loaded
    const existingModel = this.loadedModels.get(modelName);
    if (existingModel?.isLoaded) {
      existingModel.lastUsed = new Date();
      return {
        success: true,
        model: modelName,
        loadTime: 0,
      };
    }

    // Add to loading queue
    const loadRequest: ModelLoadRequest = {
      model: modelName,
      priority,
      timeout: timeout || config.ollama.modelLoadTimeout,
    };

    this.loadingQueue.push(loadRequest);
    this.processLoadingQueue();

    // Wait for model to be loaded
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const model = this.loadedModels.get(modelName);
        if (model?.isLoaded) {
          clearInterval(checkInterval);
          resolve({
            success: true,
            model: modelName,
            loadTime: Date.now() - startTime,
          });
        }
      }, 1000);

      // Timeout handling
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error(`Model loading timeout: ${modelName}`));
      }, loadRequest.timeout);
    });
  }

  private async performModelLoad(request: ModelLoadRequest): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info('Loading model', {
        workerId: config.worker.id,
        model: request.model,
        priority: request.priority,
      });

      // Check memory before loading
      const memoryInfo = await this.getMemoryInfo();
      if (memoryInfo.percentage > config.models.memoryThreshold) {
        await this.unloadLeastUsedModel();
      }

      // Pull model if not available
      try {
        await this.ollamaClient.pullModel(request.model);
      } catch (error) {
        // Model might already exist, continue
        logger.debug('Model pull failed, might already exist', {
          workerId: config.worker.id,
          model: request.model,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Update model info
      const modelInfo: ModelInfo = {
        name: request.model,
        isLoaded: true,
        loadedAt: new Date(),
        lastUsed: new Date(),
        memoryUsage: 0, // Will be updated by health checks
        requestCount: 0,
        errorCount: 0,
        avgResponseTime: 0,
        isHealthy: true,
        lastHealthCheck: new Date(),
      };

      this.loadedModels.set(request.model, modelInfo);

      const loadTime = Date.now() - startTime;
      logger.info('Model loaded successfully', {
        workerId: config.worker.id,
        model: request.model,
        loadTime,
      });

      this.emit('modelLoaded', { model: request.model, loadTime });
    } catch (error) {
      const loadTime = Date.now() - startTime;
      logger.error('Failed to load model', {
        workerId: config.worker.id,
        model: request.model,
        loadTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      this.emit('modelLoadFailed', { 
        model: request.model, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  updateModelStats(modelName: string, responseTime: number, success: boolean): void {
    const model = this.loadedModels.get(modelName);
    if (!model) return;

    model.lastUsed = new Date();
    model.requestCount++;
    
    if (!success) {
      model.errorCount++;
    }

    // Update average response time
    const totalTime = model.avgResponseTime * (model.requestCount - 1) + responseTime;
    model.avgResponseTime = totalTime / model.requestCount;

    // Update health status based on error rate
    const errorRate = model.errorCount / model.requestCount;
    model.isHealthy = errorRate < 0.1; // Consider unhealthy if error rate > 10%
  }

  private async performMemoryCleanup(): Promise<void> {
    try {
      const memoryInfo = await this.getMemoryInfo();
      
      if (memoryInfo.percentage > config.models.memoryThreshold) {
        logger.info('Memory threshold exceeded, cleaning up', {
          workerId: config.worker.id,
          memoryUsage: memoryInfo.percentage,
          threshold: config.models.memoryThreshold,
        });

        // Unload models that haven't been used recently
        const now = new Date();
        const unloadThreshold = config.models.unloadTimeout;

        for (const [modelName, modelInfo] of this.loadedModels) {
          if (modelInfo.lastUsed) {
            const timeSinceLastUse = now.getTime() - modelInfo.lastUsed.getTime();
            if (timeSinceLastUse > unloadThreshold) {
              await this.unloadModel(modelName);
            }
          }
        }
      }
    } catch (error) {
      logger.error('Memory cleanup failed', {
        workerId: config.worker.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      const [cpu, memory, disk, networkStats] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
      ]);

      let gpu;
      try {
        const gpuData = await si.graphics();
        if (gpuData.controllers.length > 0) {
          const controller = gpuData.controllers[0];
          gpu = {
            usage: 0, // Not available in systeminformation
            memory: {
              used: controller.memoryUsed || 0,
              total: controller.memoryTotal || 0,
              percentage: controller.memoryTotal 
                ? (controller.memoryUsed || 0) / controller.memoryTotal * 100 
                : 0,
            },
          };
        }
      } catch {
        // GPU info not available
      }

      return {
        timestamp: new Date(),
        workerId: config.worker.id,
        cpu: {
          usage: cpu.currentLoad,
          load: cpu.avgLoad ? [cpu.avgLoad] : [0],
        },
        memory: {
          used: memory.used,
          total: memory.total,
          percentage: (memory.used / memory.total) * 100,
        },
        gpu,
        disk: {
          used: disk[0]?.used || 0,
          total: disk[0]?.size || 0,
          percentage: disk[0] ? (disk[0].used / disk[0].size) * 100 : 0,
        },
        network: {
          rx: networkStats[0]?.rx_bytes || 0,
          tx: networkStats[0]?.tx_bytes || 0,
        },
      };
    } catch (error) {
      logger.error('Failed to get system metrics', {
        workerId: config.worker.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        timestamp: new Date(),
        workerId: config.worker.id,
        cpu: { usage: 0, load: [0] },
        memory: { used: 0, total: 1, percentage: 0 },
        disk: { used: 0, total: 1, percentage: 0 },
        network: { rx: 0, tx: 0 },
      };
    }
  }
}
```

---
## 🛡️ **Circuit Breaker & Fallback**

### **Circuit Breaker Implementation**
Based on `/src/fallback/circuit-breaker.ts`:

```typescript
export class CircuitBreaker extends EventEmitter {
  private states: Map<string, CircuitBreakerState>;
  private threshold: number;
  private timeout: number;
  private resetTimeout: number;

  constructor() {
    super();
    this.states = new Map();
    this.threshold = config.fallback.circuitBreakerThreshold;
    this.timeout = config.fallback.circuitBreakerTimeout;
    this.resetTimeout = config.fallback.circuitBreakerResetTimeout;
  }

  async execute<T>(
    key: string,
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    const state = this.getState(key);

    // Check if circuit is open
    if (state.state === 'open') {
      if (Date.now() < (state.nextAttemptTime?.getTime() || 0)) {
        logger.debug('Circuit breaker is open, using fallback', {
          key,
          workerId: config.worker.id,
          state: state.state,
          failureCount: state.failureCount,
        });

        if (fallback) {
          return await fallback();
        } else {
          throw new Error(`Circuit breaker is open for ${key}`);
        }
      } else {
        // Try to transition to half-open
        this.transitionToHalfOpen(key);
      }
    }

    try {
      const result = await operation();
      this.onSuccess(key);
      return result;
    } catch (error) {
      this.onFailure(key);
      
      // If circuit is now open and we have a fallback, use it
      const currentState = this.getState(key);
      if (currentState.state === 'open' && fallback) {
        logger.info('Circuit breaker opened, using fallback', {
          key,
          workerId: config.worker.id,
          failureCount: currentState.failureCount,
        });
        return await fallback();
      }
      
      throw error;
    }
  }

  private onSuccess(key: string): void {
    const state = this.getState(key);
    state.successCount++;

    if (state.state === 'half-open') {
      // If we're in half-open state and got a success, close the circuit
      this.transitionToClosed(key);
    } else if (state.state === 'closed') {
      // Reset failure count on success
      state.failureCount = 0;
    }

    logger.debug('Circuit breaker success', {
      key,
      workerId: config.worker.id,
      state: state.state,
      successCount: state.successCount,
      failureCount: state.failureCount,
    });
  }

  private onFailure(key: string): void {
    const state = this.getState(key);
    state.failureCount++;
    state.lastFailureTime = new Date();

    if (state.state === 'half-open') {
      // If we're in half-open state and got a failure, open the circuit
      this.transitionToOpen(key);
    } else if (state.state === 'closed' && state.failureCount >= this.threshold) {
      // If we've exceeded the threshold, open the circuit
      this.transitionToOpen(key);
    }

    logger.debug('Circuit breaker failure', {
      key,
      workerId: config.worker.id,
      state: state.state,
      failureCount: state.failureCount,
      threshold: this.threshold,
    });
  }

  private transitionToOpen(key: string): void {
    const state = this.getState(key);
    const previousState = state.state;
    
    state.state = 'open';
    state.nextAttemptTime = new Date(Date.now() + this.resetTimeout);

    if (previousState !== 'open') {
      logger.warn('Circuit breaker opened', {
        key,
        workerId: config.worker.id,
        failureCount: state.failureCount,
        nextAttemptTime: state.nextAttemptTime,
      });
      this.emit('stateChanged', { key, state: 'open', previousState });
    }
  }

  getHealthStatus(): {
    totalCircuits: number;
    openCircuits: number;
    halfOpenCircuits: number;
    closedCircuits: number;
  } {
    let openCircuits = 0;
    let halfOpenCircuits = 0;
    let closedCircuits = 0;

    for (const state of this.states.values()) {
      switch (state.state) {
        case 'open':
          openCircuits++;
          break;
        case 'half-open':
          halfOpenCircuits++;
          break;
        case 'closed':
          closedCircuits++;
          break;
      }
    }

    return {
      totalCircuits: this.states.size,
      openCircuits,
      halfOpenCircuits,
      closedCircuits,
    };
  }
}
```

### **Fallback Strategy**
The worker implements intelligent fallback strategies:

1. **Model Fallback**: If a model fails, try alternative models from the fallback list
2. **Circuit Breaker Fallback**: When a circuit is open, automatically use fallback operations
3. **Timeout Fallback**: If requests timeout, retry with different models or reduced parameters
4. **Memory Fallback**: If memory is insufficient, unload unused models and retry

```typescript
// Example fallback implementation in chat processor
async processChatWithFallback(ollamaRequest: OllamaRequest, job: QueueJobData): Promise<any> {
  const fallbackModels = config.fallback.fallbackModels.filter(
    model => model !== job.model && this.ollamaClient.validateModel(model)
  );

  for (const fallbackModel of fallbackModels) {
    try {
      logger.info('Attempting fallback model', {
        originalModel: job.model,
        fallbackModel,
        jobId: job.id,
        workerId: config.worker.id,
      });

      // Ensure fallback model is loaded
      await this.ensureModelLoaded(fallbackModel);

      // Create fallback request
      const fallbackRequest = {
        ...ollamaRequest,
        model: fallbackModel,
      };

      // Execute with fallback model
      const response = await this.ollamaClient.chatCompletion(fallbackRequest);
      
      logger.info('Fallback successful', {
        originalModel: job.model,
        fallbackModel,
        jobId: job.id,
        workerId: config.worker.id,
      });

      return response;
    } catch (error) {
      logger.warn('Fallback model failed', {
        originalModel: job.model,
        fallbackModel,
        jobId: job.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
      continue;
    }
  }

  throw new Error('All fallback models failed');
}
```

---

## 📊 **Health Monitoring & Metrics**

### **Health Check Endpoints**

#### **Basic Health Check**
```http
GET /health

Response: 200 OK
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 3600,
  "workerId": "llm-worker-1",
  "version": "1.0.0"
}
```

#### **Liveness Probe**
```http
GET /health/live

Response: 200 OK
{
  "status": "alive",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 3600,
  "workerId": "llm-worker-1"
}
```

#### **Readiness Probe**
```http
GET /health/ready

Response: 200 OK
{
  "status": "ready",
  "timestamp": "2024-01-15T10:30:00Z",
  "workerId": "llm-worker-1"
}
```

#### **Prometheus Metrics**
```http
GET /metrics

Response: 200 OK (text/plain)
# HELP llm_worker_uptime_seconds Worker uptime in seconds
# TYPE llm_worker_uptime_seconds counter
llm_worker_uptime_seconds{worker_id="llm-worker-1"} 3600

# HELP llm_worker_memory_usage_bytes Worker memory usage in bytes
# TYPE llm_worker_memory_usage_bytes gauge
llm_worker_memory_usage_bytes{worker_id="llm-worker-1"} 536870912

# HELP llm_worker_requests_total Total number of processed requests
# TYPE llm_worker_requests_total counter
llm_worker_requests_total{worker_id="llm-worker-1",model="llama2",status="success"} 150

# HELP llm_worker_request_duration_seconds Request processing duration
# TYPE llm_worker_request_duration_seconds histogram
llm_worker_request_duration_seconds_bucket{worker_id="llm-worker-1",model="llama2",le="1"} 45
llm_worker_request_duration_seconds_bucket{worker_id="llm-worker-1",model="llama2",le="5"} 120
llm_worker_request_duration_seconds_bucket{worker_id="llm-worker-1",model="llama2",le="10"} 150

# HELP llm_worker_models_loaded Number of loaded models
# TYPE llm_worker_models_loaded gauge
llm_worker_models_loaded{worker_id="llm-worker-1"} 3

# HELP llm_worker_circuit_breaker_state Circuit breaker state
# TYPE llm_worker_circuit_breaker_state gauge
llm_worker_circuit_breaker_state{worker_id="llm-worker-1",circuit="chat:llama2",state="closed"} 1

# HELP llm_worker_queue_depth Current queue depth
# TYPE llm_worker_queue_depth gauge
llm_worker_queue_depth{worker_id="llm-worker-1",queue="llm-chat"} 5
```

### **System Metrics Collection**
The worker collects comprehensive system metrics using the `systeminformation` package:

```typescript
interface SystemMetrics {
  timestamp: Date;
  workerId: string;
  cpu: {
    usage: number;        // CPU usage percentage
    load: number[];       // Load average
  };
  memory: {
    used: number;         // Used memory in bytes
    total: number;        // Total memory in bytes
    percentage: number;   // Memory usage percentage
  };
  gpu?: {
    usage: number;        // GPU usage percentage
    memory: {
      used: number;       // Used GPU memory in bytes
      total: number;      // Total GPU memory in bytes
      percentage: number; // GPU memory usage percentage
    };
  };
  disk: {
    used: number;         // Used disk space in bytes
    total: number;        // Total disk space in bytes
    percentage: number;   // Disk usage percentage
  };
  network: {
    rx: number;           // Bytes received
    tx: number;           // Bytes transmitted
  };
}
```

### **Performance Monitoring**
The worker tracks detailed performance metrics:

- **Request Metrics**: Processing time, success/failure rates, token usage
- **Model Metrics**: Load times, usage patterns, error rates, health status
- **System Metrics**: CPU, memory, GPU, disk, and network usage
- **Queue Metrics**: Job counts, processing rates, queue depth
- **Circuit Breaker Metrics**: State changes, failure rates, recovery times

---

## 🚀 **Deployment Configuration**

### **Dockerfile**
Based on the actual Dockerfile:

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install system dependencies for systeminformation
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    linux-headers

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S llm-worker -u 1001

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create logs directory
RUN mkdir -p logs && chown -R llm-worker:nodejs logs

# Change ownership of the app directory
RUN chown -R llm-worker:nodejs /app

# Switch to non-root user
USER llm-worker

# Expose health check port
EXPOSE 3008

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3008/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "dist/main.js"]
```

### **Docker Compose Integration**
```yaml
version: '3.8'

services:
  llm-worker:
    build:
      context: ./services/llm-worker
      dockerfile: Dockerfile
    environment:
      - NODE_ENV=production
      - WORKER_ID=llm-worker-1
      - WORKER_CONCURRENCY=5
      - REDIS_URL=redis://redis:6379
      - OLLAMA_BASE_URL=http://ollama:11434
      - HEALTH_CHECK_PORT=3008
      - LOG_LEVEL=info
      - ENABLE_CIRCUIT_BREAKER=true
      - ENABLE_MODEL_FALLBACK=true
      - MODEL_PRELOAD_ENABLED=true
      - MODEL_PRELOAD_LIST=llama2,mistral
    depends_on:
      - redis
      - ollama
    networks:
      - lms-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3008/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G
    volumes:
      - worker-logs:/app/logs

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
          memory: 8G
        reservations:
          memory: 4G

volumes:
  worker-logs:
  ollama-data:

networks:
  lms-network:
    driver: bridge
```

### **Kubernetes Deployment**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-worker
  labels:
    app: llm-worker
spec:
  replicas: 3
  selector:
    matchLabels:
      app: llm-worker
  template:
    metadata:
      labels:
        app: llm-worker
    spec:
      containers:
      - name: llm-worker
        image: lms/llm-worker:latest
        ports:
        - containerPort: 3008
        env:
        - name: NODE_ENV
          value: "production"
        - name: WORKER_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        - name: OLLAMA_BASE_URL
          value: "http://ollama-service:11434"
        - name: WORKER_CONCURRENCY
          value: "5"
        resources:
          requests:
            memory: "2Gi"
            cpu: "1"
          limits:
            memory: "4Gi"
            cpu: "2"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3008
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3008
          initialDelaySeconds: 5
          periodSeconds: 5
        volumeMounts:
        - name: worker-logs
          mountPath: /app/logs
      volumes:
      - name: worker-logs
        emptyDir: {}

---
apiVersion: v1
kind: Service
metadata:
  name: llm-worker-service
spec:
  selector:
    app: llm-worker
  ports:
    - protocol: TCP
      port: 3008
      targetPort: 3008
  type: ClusterIP
```

---
## 📈 **Performance Requirements**

### **Processing Targets**
- **Chat completion processing:** < 10 seconds (95th percentile)
- **Embedding generation:** < 5 seconds (average)
- **Model loading time:** < 2 minutes for standard models
- **Health check response:** < 100ms
- **Queue job pickup:** < 1 second from queue to processing

### **Throughput Requirements**
- **Peak processing:** 50 jobs/minute per worker
- **Sustained processing:** 30 jobs/minute per worker
- **Concurrent job processing:** 5 jobs simultaneously (configurable)
- **Model switching:** < 30 seconds between different models
- **Memory cleanup:** Automatic cleanup when usage > 80%

### **Resource Utilization**
- **Memory usage:** < 4GB under normal load (excluding model memory)
- **CPU usage:** < 80% under peak load
- **GPU utilization:** > 70% when GPU is available
- **Disk I/O:** Minimal (logging and model storage only)
- **Network bandwidth:** Dependent on Ollama communication

### **Scalability Targets**
- **Horizontal scaling:** Support 10+ worker instances
- **Model sharing:** Efficient model loading across workers
- **Queue distribution:** Even job distribution across workers
- **Resource optimization:** Dynamic model loading/unloading
- **Auto-scaling:** Based on queue depth and system metrics

---

## 🔒 **Security Requirements**

### **Input Validation**
- **Request validation:** Comprehensive validation using TypeScript types
- **Model restrictions:** Whitelist of allowed models only
- **Content length limits:** Configurable prompt and response length limits
- **Parameter validation:** Strict validation of all LLM parameters
- **Timeout enforcement:** Request timeout limits to prevent resource exhaustion

### **Resource Protection**
- **Memory limits:** Automatic model unloading when memory threshold exceeded
- **CPU throttling:** Process priority management for system stability
- **Disk space monitoring:** Prevent disk space exhaustion from logs/models
- **Network rate limiting:** Protection against network flooding
- **Process isolation:** Non-root user execution in containers

### **Error Handling**
- **Graceful degradation:** Continue operation with reduced functionality
- **Circuit breaker protection:** Prevent cascade failures
- **Retry limits:** Prevent infinite retry loops
- **Dead letter queues:** Handle unprocessable jobs safely
- **Resource cleanup:** Automatic cleanup of failed operations

### **Audit & Compliance**
```typescript
interface AuditLog {
  timestamp: string;
  workerId: string;
  jobId: string;
  userId?: string;
  action: string;
  model: string;
  processingTime: number;
  tokensUsed: number;
  success: boolean;
  error?: string;
  systemMetrics: {
    memoryUsage: number;
    cpuUsage: number;
    gpuUsage?: number;
  };
}
```

---

## 🧪 **Testing Strategy**

### **Unit Tests**
```typescript
describe('ModelManager', () => {
  describe('loadModel', () => {
    it('should load model successfully', async () => {
      const modelManager = new ModelManager(mockOllamaClient);
      const result = await modelManager.loadModel('llama2', 'normal');
      
      expect(result.success).toBe(true);
      expect(result.model).toBe('llama2');
      expect(result.loadTime).toBeGreaterThan(0);
    });

    it('should return immediately if model already loaded', async () => {
      const modelManager = new ModelManager(mockOllamaClient);
      await modelManager.loadModel('llama2', 'normal');
      
      const result = await modelManager.loadModel('llama2', 'normal');
      expect(result.loadTime).toBe(0);
    });
  });

  describe('unloadLeastUsedModel', () => {
    it('should unload the least recently used model', async () => {
      const modelManager = new ModelManager(mockOllamaClient);
      // Test implementation
    });
  });
});

describe('CircuitBreaker', () => {
  describe('execute', () => {
    it('should execute operation when circuit is closed', async () => {
      const circuitBreaker = new CircuitBreaker();
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute('test', operation);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should use fallback when circuit is open', async () => {
      const circuitBreaker = new CircuitBreaker();
      const operation = jest.fn().mockRejectedValue(new Error('failure'));
      const fallback = jest.fn().mockResolvedValue('fallback');
      
      // Trigger circuit breaker to open
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute('test', operation);
        } catch (error) {
          // Expected failures
        }
      }
      
      const result = await circuitBreaker.execute('test', operation, fallback);
      expect(result).toBe('fallback');
      expect(fallback).toHaveBeenCalledTimes(1);
    });
  });
});
```

### **Integration Tests**
```typescript
describe('LLM Worker Integration', () => {
  let workerManager: WorkerManager;
  let redis: Redis;

  beforeAll(async () => {
    redis = new Redis(process.env.REDIS_URL);
    workerManager = new WorkerManager();
    await workerManager.initialize();
    await workerManager.start();
  });

  afterAll(async () => {
    await workerManager.stop();
    await redis.quit();
  });

  describe('Job Processing', () => {
    it('should process chat completion job successfully', async () => {
      const jobData: QueueJobData = {
        id: 'test-job-1',
        type: 'chat',
        userId: 'user-123',
        model: 'llama2',
        request: {
          messages: [
            { role: 'user', content: 'Hello, how are you?' }
          ]
        },
        correlationId: 'corr-123',
        createdAt: new Date(),
      };

      // Add job to queue
      const queue = new Queue('llm-chat', { connection: redis });
      const job = await queue.add('process-chat', jobData);

      // Wait for job completion
      const result = await job.waitUntilFinished();
      
      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.processingTime).toBeGreaterThan(0);
    });

    it('should handle model loading for new models', async () => {
      const jobData: QueueJobData = {
        id: 'test-job-2',
        type: 'chat',
        userId: 'user-123',
        model: 'mistral', // Different model
        request: {
          messages: [
            { role: 'user', content: 'Test message' }
          ]
        },
        correlationId: 'corr-124',
        createdAt: new Date(),
      };

      const queue = new Queue('llm-chat', { connection: redis });
      const job = await queue.add('process-chat', jobData);
      const result = await job.waitUntilFinished();
      
      expect(result.success).toBe(true);
      expect(result.model).toBe('mistral');
    });
  });

  describe('Health Monitoring', () => {
    it('should report healthy status when all components are working', async () => {
      const health = await workerManager.healthCheck();
      
      expect(health.status).toBe('healthy');
      expect(health.details.redis).toBe(true);
      expect(health.details.ollama).toBe(true);
      expect(health.details.isRunning).toBe(true);
    });
  });
});
```

### **Load Testing**
```typescript
// Artillery configuration for load testing
const loadTestConfig = {
  config: {
    target: 'http://localhost:3008',
    phases: [
      { duration: 60, arrivalRate: 5 },    // Warm up
      { duration: 120, arrivalRate: 15 },  // Ramp up
      { duration: 300, arrivalRate: 25 },  // Sustained load
      { duration: 60, arrivalRate: 40 }    // Peak load
    ],
    processor: './load-test-processor.js'
  },
  scenarios: [
    {
      name: 'Health Check',
      weight: 10,
      flow: [
        {
          get: {
            url: '/health'
          }
        }
      ]
    },
    {
      name: 'Metrics Collection',
      weight: 20,
      flow: [
        {
          get: {
            url: '/metrics'
          }
        }
      ]
    },
    {
      name: 'Queue Job Processing',
      weight: 70,
      flow: [
        // This would test the queue processing indirectly
        // by monitoring queue depth and processing rates
      ]
    }
  ]
};
```

---

## 🔍 **Troubleshooting Guide**

### **Common Issues**

#### **1. Ollama Connection Failed**
```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Check worker logs
docker logs llm-worker

# Verify configuration
echo $OLLAMA_BASE_URL

# Test connectivity
telnet localhost 11434
```

#### **2. Model Loading Issues**
```bash
# Check available models in Ollama
ollama list

# Pull missing model
ollama pull llama2

# Check model permissions
ls -la ~/.ollama/models

# Monitor model loading
curl http://localhost:3008/health
```

#### **3. Memory Issues**
```bash
# Check memory usage
docker stats llm-worker

# Check system metrics
curl http://localhost:3008/metrics | grep memory

# Adjust memory threshold
export MODEL_MEMORY_THRESHOLD=0.7

# Monitor model unloading
docker logs llm-worker | grep "unload"
```

#### **4. Queue Processing Stuck**
```bash
# Check Redis connection
redis-cli ping

# Check queue status
redis-cli LLEN llm-chat

# Check worker status
curl http://localhost:3008/health

# Restart worker
docker restart llm-worker
```

#### **5. Circuit Breaker Issues**
```bash
# Check circuit breaker status
curl http://localhost:3008/metrics | grep circuit_breaker

# Reset circuit breakers (if needed)
# This would require admin endpoint implementation

# Monitor circuit breaker events
docker logs llm-worker | grep "Circuit breaker"
```

### **Debug Mode**
```bash
# Enable debug logging
export LOG_LEVEL=debug
export ENABLE_DEBUG_MODE=true

# Enable request logging
export ENABLE_REQUEST_LOGGING=true

# Enable performance monitoring
export ENABLE_PERFORMANCE_MONITORING=true
export PERFORMANCE_SAMPLE_RATE=1.0

# Start worker with debug settings
npm run dev
```

### **Performance Optimization**

#### **Memory Optimization**
- Adjust `MODEL_MEMORY_THRESHOLD` based on available system memory
- Tune `MODEL_UNLOAD_TIMEOUT` for optimal model lifecycle management
- Monitor memory usage patterns and adjust `MEMORY_CLEANUP_INTERVAL`

#### **Processing Optimization**
- Increase `WORKER_CONCURRENCY` for higher throughput (within system limits)
- Optimize `OLLAMA_TIMEOUT` based on model response times
- Enable `MODEL_PRELOAD_ENABLED` for frequently used models

#### **Network Optimization**
- Adjust `OLLAMA_MAX_CONNECTIONS` for connection pooling
- Tune `OLLAMA_MAX_RETRIES` and `OLLAMA_RETRY_DELAY` for network conditions
- Monitor network latency between worker and Ollama

---

## 🎯 **Success Criteria**

### **Functional Requirements**
- ✅ Successfully processes chat completion and embedding requests from queues
- ✅ Dynamically loads and unloads models based on demand and memory usage
- ✅ Implements circuit breaker patterns for fault tolerance and resilience
- ✅ Provides intelligent fallback strategies with alternative model routing
- ✅ Monitors system resources and optimizes performance automatically
- ✅ Integrates seamlessly with Ollama for LLM processing
- ✅ Publishes comprehensive metrics for monitoring and alerting

### **Non-Functional Requirements**
- ✅ **Availability:** 99.9% uptime with graceful degradation
- ✅ **Performance:** < 10 seconds chat completion processing time
- ✅ **Scalability:** Handle 50 jobs/minute per worker instance
- ✅ **Reliability:** Automatic recovery from transient failures
- ✅ **Monitoring:** Comprehensive health checks and system metrics
- ✅ **Resource Efficiency:** Optimal memory and CPU utilization
- ✅ **Maintainability:** Clean, testable TypeScript codebase

### **Operational Requirements**
- ✅ **Deployment:** Containerized with Docker and Kubernetes support
- ✅ **Configuration:** Environment-based configuration with validation
- ✅ **Monitoring:** Prometheus metrics and structured logging
- ✅ **Health Checks:** Kubernetes-ready liveness and readiness probes
- ✅ **Error Handling:** Graceful error handling with circuit breakers
- ✅ **Recovery:** Automatic service recovery and model management
- ✅ **Scaling:** Horizontal scaling with queue-based load distribution

### **Technical Requirements**
- ✅ **Queue Integration:** BullMQ with Redis for reliable job processing
- ✅ **Model Management:** Dynamic loading with memory optimization
- ✅ **Circuit Breakers:** Fault tolerance with automatic recovery
- ✅ **System Monitoring:** Real-time resource usage tracking
- ✅ **Ollama Integration:** Direct HTTP API integration with retry logic
- ✅ **Event-Driven Architecture:** Comprehensive event publishing
- ✅ **Performance Optimization:** Intelligent caching and resource management

---

This specification provides a complete blueprint for building and operating a production-ready LLM Worker Service that serves as the processing engine for AI model requests in the LMS platform, ensuring scalable, reliable, and efficient AI operations with comprehensive monitoring, fault tolerance, and intelligent resource management! 🚀

The LLM Worker Service complements the LLM Gateway by providing the actual processing capabilities, creating a robust and scalable AI infrastructure for the Learning Management System.
