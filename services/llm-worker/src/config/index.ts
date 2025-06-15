import { z } from 'zod';

const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Worker Configuration
  worker: z.object({
    id: z.string().default('llm-worker-1'),
    concurrency: z.coerce.number().default(5),
    batchSize: z.coerce.number().default(10),
    timeout: z.coerce.number().default(300000),
  }),

  // Redis Configuration
  redis: z.object({
    url: z.string().optional(),
    host: z.string().default('localhost'),
    port: z.coerce.number().default(6379),
    password: z.string().optional(),
    db: z.coerce.number().default(0),
  }),

  // Ollama Configuration
  ollama: z.object({
    baseUrl: z.string().default('http://localhost:11434'),
    timeout: z.coerce.number().default(300000),
    maxConnections: z.coerce.number().default(10),
    healthCheckInterval: z.coerce.number().default(30000),
    modelLoadTimeout: z.coerce.number().default(120000),
    maxRetries: z.coerce.number().default(3),
    retryDelay: z.coerce.number().default(1000),
  }),

  // Queue Configuration
  queue: z.object({
    chatName: z.string().default('llm-chat'),
    embeddingsName: z.string().default('llm-embeddings'),
    batchName: z.string().default('llm-batch'),
    priorityName: z.string().default('llm-priority'),
    maxAttempts: z.coerce.number().default(3),
    delay: z.coerce.number().default(1000),
    backoffType: z.enum(['fixed', 'exponential']).default('exponential'),
    removeOnComplete: z.coerce.number().default(100),
    removeOnFail: z.coerce.number().default(50),
  }),

  // Model Configuration
  models: z.object({
    defaultChatModel: z.string().default('llama2'),
    defaultEmbeddingModel: z.string().default('llama2'),
    allowedModels: z.string().transform(str => str.split(',')),
    preloadEnabled: z.coerce.boolean().default(true),
    preloadList: z.string().transform(str => str.split(',')),
    unloadTimeout: z.coerce.number().default(300000),
    memoryThreshold: z.coerce.number().default(0.8),
  }),

  // Fallback Configuration
  fallback: z.object({
    enableModelFallback: z.coerce.boolean().default(true),
    fallbackModels: z.string().transform(str => str.split(',')),
    enableCircuitBreaker: z.coerce.boolean().default(true),
    circuitBreakerThreshold: z.coerce.number().default(5),
    circuitBreakerTimeout: z.coerce.number().default(60000),
    circuitBreakerResetTimeout: z.coerce.number().default(300000),
  }),

  // Performance Configuration
  performance: z.object({
    enableBatchProcessing: z.coerce.boolean().default(true),
    batchTimeout: z.coerce.number().default(5000),
    enableStreaming: z.coerce.boolean().default(true),
    enableGpuOptimization: z.coerce.boolean().default(true),
    memoryLimit: z.coerce.number().default(8192),
    gpuMemoryLimit: z.coerce.number().default(4096),
  }),

  // Monitoring Configuration
  monitoring: z.object({
    metricsEnabled: z.coerce.boolean().default(true),
    logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    logFormat: z.enum(['json', 'simple']).default('json'),
    enablePerformanceMonitoring: z.coerce.boolean().default(true),
    performanceSampleRate: z.coerce.number().default(0.1),
  }),

  // Health Configuration
  health: z.object({
    port: z.coerce.number().default(3008),
  }),

  // Database Configuration
  database: z.object({
    url: z.string(),
    host: z.string().default('localhost'),
    port: z.coerce.number().default(5432),
    name: z.string().default('lms_llm_worker'),
    user: z.string().default('lms_user'),
    password: z.string(),
  }),

  // Kafka Configuration
  kafka: z.object({
    brokers: z.string().transform(str => str.split(',')),
    clientId: z.string().default('llm-worker'),
    groupId: z.string().default('llm-worker-group'),
  }),

  // External Services
  services: z.object({
    analyticsService: z.string().default('http://localhost:8080'),
    auditService: z.string().default('http://localhost:3009'),
  }),

  // Resource Management
  resources: z.object({
    maxConcurrentRequests: z.coerce.number().default(10),
    requestQueueSize: z.coerce.number().default(100),
    memoryCleanupInterval: z.coerce.number().default(60000),
    modelCacheSize: z.coerce.number().default(5),
    responseCacheTtl: z.coerce.number().default(3600),
  }),

  // Error Handling
  errors: z.object({
    enableDeadLetterQueue: z.coerce.boolean().default(true),
    deadLetterQueueName: z.string().default('llm-dead-letter'),
    retryAttempts: z.coerce.number().default(3),
    retryDelay: z.coerce.number().default(2000),
    enableErrorNotifications: z.coerce.boolean().default(true),
  }),

  // Security
  security: z.object({
    enableRequestValidation: z.coerce.boolean().default(true),
    maxPromptLength: z.coerce.number().default(8192),
    maxResponseLength: z.coerce.number().default(16384),
    enableContentFiltering: z.coerce.boolean().default(false),
  }),

  // Development
  development: z.object({
    enableDebugMode: z.coerce.boolean().default(false),
    enableRequestLogging: z.coerce.boolean().default(true),
    enableResponseLogging: z.coerce.boolean().default(false),
    mockOllamaResponses: z.coerce.boolean().default(false),
  }),
});

const rawConfig = {
  nodeEnv: process.env.NODE_ENV,

  worker: {
    id: process.env.WORKER_ID,
    concurrency: process.env.WORKER_CONCURRENCY,
    batchSize: process.env.WORKER_BATCH_SIZE,
    timeout: process.env.WORKER_TIMEOUT,
  },

  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB,
  },

  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL,
    timeout: process.env.OLLAMA_TIMEOUT,
    maxConnections: process.env.OLLAMA_MAX_CONNECTIONS,
    healthCheckInterval: process.env.OLLAMA_HEALTH_CHECK_INTERVAL,
    modelLoadTimeout: process.env.OLLAMA_MODEL_LOAD_TIMEOUT,
    maxRetries: process.env.OLLAMA_MAX_RETRIES,
    retryDelay: process.env.OLLAMA_RETRY_DELAY,
  },

  queue: {
    chatName: process.env.QUEUE_CHAT_NAME,
    embeddingsName: process.env.QUEUE_EMBEDDINGS_NAME,
    batchName: process.env.QUEUE_BATCH_NAME,
    priorityName: process.env.QUEUE_PRIORITY_NAME,
    maxAttempts: process.env.QUEUE_MAX_ATTEMPTS,
    delay: process.env.QUEUE_DELAY,
    backoffType: process.env.QUEUE_BACKOFF_TYPE,
    removeOnComplete: process.env.QUEUE_REMOVE_ON_COMPLETE,
    removeOnFail: process.env.QUEUE_REMOVE_ON_FAIL,
  },

  models: {
    defaultChatModel: process.env.DEFAULT_CHAT_MODEL,
    defaultEmbeddingModel: process.env.DEFAULT_EMBEDDING_MODEL,
    allowedModels: process.env.ALLOWED_MODELS || 'llama2,codellama,mistral,phi,neural-chat',
    preloadEnabled: process.env.MODEL_PRELOAD_ENABLED,
    preloadList: process.env.MODEL_PRELOAD_LIST || 'llama2,mistral',
    unloadTimeout: process.env.MODEL_UNLOAD_TIMEOUT,
    memoryThreshold: process.env.MODEL_MEMORY_THRESHOLD,
  },

  fallback: {
    enableModelFallback: process.env.ENABLE_MODEL_FALLBACK,
    fallbackModels: process.env.FALLBACK_MODELS || 'llama2,mistral,phi',
    enableCircuitBreaker: process.env.ENABLE_CIRCUIT_BREAKER,
    circuitBreakerThreshold: process.env.CIRCUIT_BREAKER_THRESHOLD,
    circuitBreakerTimeout: process.env.CIRCUIT_BREAKER_TIMEOUT,
    circuitBreakerResetTimeout: process.env.CIRCUIT_BREAKER_RESET_TIMEOUT,
  },

  performance: {
    enableBatchProcessing: process.env.ENABLE_BATCH_PROCESSING,
    batchTimeout: process.env.BATCH_TIMEOUT,
    enableStreaming: process.env.ENABLE_STREAMING,
    enableGpuOptimization: process.env.ENABLE_GPU_OPTIMIZATION,
    memoryLimit: process.env.MEMORY_LIMIT,
    gpuMemoryLimit: process.env.GPU_MEMORY_LIMIT,
  },

  monitoring: {
    metricsEnabled: process.env.METRICS_ENABLED,
    logLevel: process.env.LOG_LEVEL,
    logFormat: process.env.LOG_FORMAT,
    enablePerformanceMonitoring: process.env.ENABLE_PERFORMANCE_MONITORING,
    performanceSampleRate: process.env.PERFORMANCE_SAMPLE_RATE,
  },

  health: {
    port: process.env.HEALTH_CHECK_PORT,
  },

  database: {
    url: process.env.DATABASE_URL!,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD!,
  },

  kafka: {
    brokers: process.env.KAFKA_BROKERS || 'localhost:9092',
    clientId: process.env.KAFKA_CLIENT_ID,
    groupId: process.env.KAFKA_GROUP_ID,
  },

  services: {
    analyticsService: process.env.ANALYTICS_SERVICE_URL,
    auditService: process.env.AUDIT_SERVICE_URL,
  },

  resources: {
    maxConcurrentRequests: process.env.MAX_CONCURRENT_REQUESTS,
    requestQueueSize: process.env.REQUEST_QUEUE_SIZE,
    memoryCleanupInterval: process.env.MEMORY_CLEANUP_INTERVAL,
    modelCacheSize: process.env.MODEL_CACHE_SIZE,
    responseCacheTtl: process.env.RESPONSE_CACHE_TTL,
  },

  errors: {
    enableDeadLetterQueue: process.env.ENABLE_DEAD_LETTER_QUEUE,
    deadLetterQueueName: process.env.DEAD_LETTER_QUEUE_NAME,
    retryAttempts: process.env.ERROR_RETRY_ATTEMPTS,
    retryDelay: process.env.ERROR_RETRY_DELAY,
    enableErrorNotifications: process.env.ENABLE_ERROR_NOTIFICATIONS,
  },

  security: {
    enableRequestValidation: process.env.ENABLE_REQUEST_VALIDATION,
    maxPromptLength: process.env.MAX_PROMPT_LENGTH,
    maxResponseLength: process.env.MAX_RESPONSE_LENGTH,
    enableContentFiltering: process.env.ENABLE_CONTENT_FILTERING,
  },

  development: {
    enableDebugMode: process.env.ENABLE_DEBUG_MODE,
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING,
    enableResponseLogging: process.env.ENABLE_RESPONSE_LOGGING,
    mockOllamaResponses: process.env.MOCK_OLLAMA_RESPONSES,
  },
};

export const config = configSchema.parse(rawConfig);
export type Config = z.infer<typeof configSchema>;
