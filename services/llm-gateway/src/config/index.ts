import { z } from 'zod';

const configSchema = z.object({
  // Server Configuration
  server: z.object({
    port: z.coerce.number().default(3007),
    host: z.string().default('0.0.0.0'),
    requestTimeout: z.coerce.number().default(300000),
    keepAliveTimeout: z.coerce.number().default(65000),
    bodyLimit: z.coerce.number().default(10485760),
  }),
  
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Database Configuration
  database: z.object({
    url: z.string(),
    host: z.string().default('localhost'),
    port: z.coerce.number().default(5432),
    name: z.string().default('lms_llm_gateway'),
    user: z.string().default('lms_user'),
    password: z.string(),
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
    maxRetries: z.coerce.number().default(3),
    retryDelay: z.coerce.number().default(1000),
  }),

  // JWT Configuration
  jwt: z.object({
    secret: z.string().min(32),
  }),

  // Kafka Configuration
  kafka: z.object({
    brokers: z.string().transform(str => str.split(',')),
    clientId: z.string().default('llm-gateway'),
    groupId: z.string().default('llm-gateway-group'),
  }),

  // Rate Limiting Configuration
  rateLimit: z.object({
    window: z.coerce.number().default(3600),
    maxRequests: z.coerce.number().default(100),
    maxRequestsPerModel: z.coerce.number().default(50),
    burstSize: z.coerce.number().default(10),
  }),

  // Queue Configuration
  queue: z.object({
    concurrency: z.coerce.number().default(5),
    maxAttempts: z.coerce.number().default(3),
    delay: z.coerce.number().default(1000),
    backoffType: z.enum(['fixed', 'exponential']).default('exponential'),
    removeOnComplete: z.coerce.number().default(100),
    removeOnFail: z.coerce.number().default(50),
  }),

  // Cache Configuration
  cache: z.object({
    ttl: z.coerce.number().default(3600),
    maxSize: z.coerce.number().default(1000),
    responseCacheEnabled: z.coerce.boolean().default(true),
    modelCacheEnabled: z.coerce.boolean().default(true),
  }),

  // Feature Flags
  features: z.object({
    enableRateLimiting: z.coerce.boolean().default(true),
    enableCaching: z.coerce.boolean().default(true),
    enableQueueProcessing: z.coerce.boolean().default(true),
    enableModelFallback: z.coerce.boolean().default(true),
    enableStreaming: z.coerce.boolean().default(true),
    enableContentModeration: z.coerce.boolean().default(false),
  }),

  // Security Configuration
  security: z.object({
    maxPromptLength: z.coerce.number().default(8192),
    maxResponseLength: z.coerce.number().default(16384),
    allowedModels: z.string().transform(str => str.split(',')),
    blockedPatterns: z.string().optional().transform(str => str ? str.split(',') : []),
  }),

  // Monitoring Configuration
  monitoring: z.object({
    metricsEnabled: z.coerce.boolean().default(true),
    logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    logFormat: z.enum(['json', 'simple']).default('json'),
  }),

  // External Services
  services: z.object({
    authService: z.string().default('http://localhost:3001'),
    userService: z.string().default('http://localhost:3002'),
    analyticsService: z.string().default('http://localhost:8080'),
  }),

  // CORS Configuration
  cors: z.object({
    origin: z.string().default('http://localhost:3000'),
    credentials: z.coerce.boolean().default(true),
  }),

  // Health Check Configuration
  health: z.object({
    checkInterval: z.string().default('30s'),
    checkTimeout: z.string().default('5s'),
  }),
});

const rawConfig = {
  server: {
    port: process.env.PORT,
    host: process.env.HOST,
    requestTimeout: process.env.REQUEST_TIMEOUT,
    keepAliveTimeout: process.env.KEEP_ALIVE_TIMEOUT,
    bodyLimit: process.env.BODY_LIMIT,
  },

  nodeEnv: process.env.NODE_ENV,

  database: {
    url: process.env.DATABASE_URL!,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD!,
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
    maxRetries: process.env.OLLAMA_MAX_RETRIES,
    retryDelay: process.env.OLLAMA_RETRY_DELAY,
  },

  jwt: {
    secret: process.env.JWT_SECRET!,
  },

  kafka: {
    brokers: process.env.KAFKA_BROKERS || 'localhost:9092',
    clientId: process.env.KAFKA_CLIENT_ID,
    groupId: process.env.KAFKA_GROUP_ID,
  },

  rateLimit: {
    window: process.env.RATE_LIMIT_WINDOW,
    maxRequests: process.env.RATE_LIMIT_MAX_REQUESTS,
    maxRequestsPerModel: process.env.RATE_LIMIT_MAX_REQUESTS_PER_MODEL,
    burstSize: process.env.RATE_LIMIT_BURST_SIZE,
  },

  queue: {
    concurrency: process.env.QUEUE_CONCURRENCY,
    maxAttempts: process.env.QUEUE_MAX_ATTEMPTS,
    delay: process.env.QUEUE_DELAY,
    backoffType: process.env.QUEUE_BACKOFF_TYPE,
    removeOnComplete: process.env.QUEUE_REMOVE_ON_COMPLETE,
    removeOnFail: process.env.QUEUE_REMOVE_ON_FAIL,
  },

  cache: {
    ttl: process.env.CACHE_TTL,
    maxSize: process.env.CACHE_MAX_SIZE,
    responseCacheEnabled: process.env.RESPONSE_CACHE_ENABLED,
    modelCacheEnabled: process.env.MODEL_CACHE_ENABLED,
  },

  features: {
    enableRateLimiting: process.env.ENABLE_RATE_LIMITING,
    enableCaching: process.env.ENABLE_CACHING,
    enableQueueProcessing: process.env.ENABLE_QUEUE_PROCESSING,
    enableModelFallback: process.env.ENABLE_MODEL_FALLBACK,
    enableStreaming: process.env.ENABLE_STREAMING,
    enableContentModeration: process.env.ENABLE_CONTENT_MODERATION,
  },

  security: {
    maxPromptLength: process.env.MAX_PROMPT_LENGTH,
    maxResponseLength: process.env.MAX_RESPONSE_LENGTH,
    allowedModels: process.env.ALLOWED_MODELS || 'llama2,codellama,mistral,phi',
    blockedPatterns: process.env.BLOCKED_PATTERNS,
  },

  monitoring: {
    metricsEnabled: process.env.METRICS_ENABLED,
    logLevel: process.env.LOG_LEVEL,
    logFormat: process.env.LOG_FORMAT,
  },

  services: {
    authService: process.env.AUTH_SERVICE_URL,
    userService: process.env.USER_SERVICE_URL,
    analyticsService: process.env.ANALYTICS_SERVICE_URL,
  },

  cors: {
    origin: process.env.CORS_ORIGIN,
    credentials: process.env.CORS_CREDENTIALS,
  },

  health: {
    checkInterval: process.env.HEALTH_CHECK_INTERVAL,
    checkTimeout: process.env.HEALTH_CHECK_TIMEOUT,
  },
};

export const config = configSchema.parse(rawConfig);
export type Config = z.infer<typeof configSchema>;
