import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = z.object({
  // Server Configuration
  PORT: z.string().transform(Number).default('3008'),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Elasticsearch Configuration
  ELASTICSEARCH_URL: z.string().url().default('http://localhost:9200'),
  ELASTICSEARCH_USERNAME: z.string().optional(),
  ELASTICSEARCH_PASSWORD: z.string().optional(),
  ELASTICSEARCH_INDEX_PREFIX: z.string().default('lms_'),
  ELASTICSEARCH_MAX_RETRIES: z.string().transform(Number).default('3'),
  ELASTICSEARCH_REQUEST_TIMEOUT: z.string().transform(Number).default('30000'),
  ELASTICSEARCH_PING_TIMEOUT: z.string().transform(Number).default('3000'),

  // Redis Configuration
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().transform(Number).default('0'),
  REDIS_KEY_PREFIX: z.string().default('search:'),

  // RabbitMQ Configuration
  RABBITMQ_URL: z.string().optional(),
  RABBITMQ_HOST: z.string().default('localhost'),
  RABBITMQ_PORT: z.string().transform(Number).default('5672'),
  RABBITMQ_USER: z.string().default('guest'),
  RABBITMQ_PASSWORD: z.string().default('guest'),
  RABBITMQ_VHOST: z.string().default('/'),

  // JWT Configuration
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // External Services
  AUTH_SERVICE_URL: z.string().url().default('http://localhost:3001'),
  USER_SERVICE_URL: z.string().url().default('http://localhost:3002'),
  COURSE_SERVICE_URL: z.string().url().default('http://localhost:3003'),
  FILE_SERVICE_URL: z.string().url().default('http://localhost:3005'),
  ASSESSMENT_SERVICE_URL: z.string().url().default('http://localhost:3004'),

  // Search Configuration
  SEARCH_RESULTS_LIMIT: z.string().transform(Number).default('50'),
  SEARCH_MAX_RESULTS: z.string().transform(Number).default('1000'),
  SUGGESTIONS_LIMIT: z.string().transform(Number).default('10'),
  POPULAR_SEARCHES_LIMIT: z.string().transform(Number).default('20'),
  SEARCH_TIMEOUT: z.string().transform(Number).default('5000'),

  // Cache Configuration
  CACHE_TTL_SEARCH_RESULTS: z.string().transform(Number).default('900'),
  CACHE_TTL_SUGGESTIONS: z.string().transform(Number).default('3600'),
  CACHE_TTL_POPULAR_SEARCHES: z.string().transform(Number).default('1800'),
  CACHE_TTL_INDEX_STATUS: z.string().transform(Number).default('300'),
  MEMORY_CACHE_SIZE: z.string().transform(Number).default('1000'),

  // Rate Limiting
  RATE_LIMIT_MAX: z.string().transform(Number).default('100'),
  RATE_LIMIT_WINDOW: z.string().transform(Number).default('60000'),
  RATE_LIMIT_SEARCH_MAX: z.string().transform(Number).default('50'),
  RATE_LIMIT_SEARCH_WINDOW: z.string().transform(Number).default('60000'),

  // CORS Configuration
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  CORS_CREDENTIALS: z.string().transform(val => val === 'true').default('true'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple']).default('json'),

  // Features
  ENABLE_ANALYTICS: z.string().transform(val => val === 'true').default('true'),
  ENABLE_SUGGESTIONS: z.string().transform(val => val === 'true').default('true'),
  ENABLE_PERSONALIZATION: z.string().transform(val => val === 'true').default('true'),
  ENABLE_SPELL_CHECK: z.string().transform(val => val === 'true').default('true'),
  ENABLE_FACETED_SEARCH: z.string().transform(val => val === 'true').default('true'),

  // Circuit Breaker Configuration
  CIRCUIT_BREAKER_TIMEOUT: z.string().transform(Number).default('5000'),
  CIRCUIT_BREAKER_ERROR_THRESHOLD: z.string().transform(Number).default('50'),
  CIRCUIT_BREAKER_RESET_TIMEOUT: z.string().transform(Number).default('30000'),

  // Indexing Configuration
  BULK_INDEX_SIZE: z.string().transform(Number).default('100'),
  BULK_INDEX_TIMEOUT: z.string().transform(Number).default('30000'),
  REINDEX_BATCH_SIZE: z.string().transform(Number).default('1000'),
  INDEX_REFRESH_INTERVAL: z.string().default('1s'),

  // Analytics Configuration
  ANALYTICS_BATCH_SIZE: z.string().transform(Number).default('100'),
  ANALYTICS_FLUSH_INTERVAL: z.string().transform(Number).default('30000'),
  TRACK_SEARCH_QUERIES: z.string().transform(val => val === 'true').default('true'),
  TRACK_CLICK_THROUGH: z.string().transform(val => val === 'true').default('true'),
  TRACK_USER_BEHAVIOR: z.string().transform(val => val === 'true').default('true'),

  // Performance Configuration
  MAX_CONCURRENT_SEARCHES: z.string().transform(Number).default('10'),
  SEARCH_QUEUE_SIZE: z.string().transform(Number).default('1000'),
  INDEX_QUEUE_SIZE: z.string().transform(Number).default('5000'),
});

// Validate environment variables
const env = envSchema.parse(process.env);

// Export configuration object
export const config = {
  // Server
  port: env.PORT,
  host: env.HOST,
  nodeEnv: env.NODE_ENV,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',

  // Elasticsearch
  elasticsearch: {
    url: env.ELASTICSEARCH_URL,
    username: env.ELASTICSEARCH_USERNAME,
    password: env.ELASTICSEARCH_PASSWORD,
    indexPrefix: env.ELASTICSEARCH_INDEX_PREFIX,
    maxRetries: env.ELASTICSEARCH_MAX_RETRIES,
    requestTimeout: env.ELASTICSEARCH_REQUEST_TIMEOUT,
    pingTimeout: env.ELASTICSEARCH_PING_TIMEOUT,
  },

  // Redis
  redis: {
    url: env.REDIS_URL || `redis://${env.REDIS_HOST}:${env.REDIS_PORT}/${env.REDIS_DB}`,
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
    keyPrefix: env.REDIS_KEY_PREFIX,
  },

  // RabbitMQ
  rabbitmq: {
    url: env.RABBITMQ_URL || `amqp://${env.RABBITMQ_USER}:${env.RABBITMQ_PASSWORD}@${env.RABBITMQ_HOST}:${env.RABBITMQ_PORT}${env.RABBITMQ_VHOST}`,
    host: env.RABBITMQ_HOST,
    port: env.RABBITMQ_PORT,
    user: env.RABBITMQ_USER,
    password: env.RABBITMQ_PASSWORD,
    vhost: env.RABBITMQ_VHOST,
  },

  // JWT
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  },

  // External Services
  services: {
    auth: env.AUTH_SERVICE_URL,
    user: env.USER_SERVICE_URL,
    course: env.COURSE_SERVICE_URL,
    file: env.FILE_SERVICE_URL,
    assessment: env.ASSESSMENT_SERVICE_URL,
  },

  // Search
  search: {
    resultsLimit: env.SEARCH_RESULTS_LIMIT,
    maxResults: env.SEARCH_MAX_RESULTS,
    suggestionsLimit: env.SUGGESTIONS_LIMIT,
    popularSearchesLimit: env.POPULAR_SEARCHES_LIMIT,
    timeout: env.SEARCH_TIMEOUT,
  },

  // Cache
  cache: {
    searchResults: env.CACHE_TTL_SEARCH_RESULTS,
    suggestions: env.CACHE_TTL_SUGGESTIONS,
    popularSearches: env.CACHE_TTL_POPULAR_SEARCHES,
    indexStatus: env.CACHE_TTL_INDEX_STATUS,
    memoryCacheSize: env.MEMORY_CACHE_SIZE,
  },

  // Rate Limiting
  rateLimit: {
    max: env.RATE_LIMIT_MAX,
    window: env.RATE_LIMIT_WINDOW,
    searchMax: env.RATE_LIMIT_SEARCH_MAX,
    searchWindow: env.RATE_LIMIT_SEARCH_WINDOW,
  },

  // CORS
  cors: {
    origin: env.CORS_ORIGIN.split(','),
    credentials: env.CORS_CREDENTIALS,
  },

  // Logging
  logging: {
    level: env.LOG_LEVEL,
    format: env.LOG_FORMAT,
  },

  // Features
  features: {
    analytics: env.ENABLE_ANALYTICS,
    suggestions: env.ENABLE_SUGGESTIONS,
    personalization: env.ENABLE_PERSONALIZATION,
    spellCheck: env.ENABLE_SPELL_CHECK,
    facetedSearch: env.ENABLE_FACETED_SEARCH,
  },

  // Circuit Breaker
  circuitBreaker: {
    timeout: env.CIRCUIT_BREAKER_TIMEOUT,
    errorThreshold: env.CIRCUIT_BREAKER_ERROR_THRESHOLD,
    resetTimeout: env.CIRCUIT_BREAKER_RESET_TIMEOUT,
  },

  // Indexing
  indexing: {
    bulkSize: env.BULK_INDEX_SIZE,
    bulkTimeout: env.BULK_INDEX_TIMEOUT,
    reindexBatchSize: env.REINDEX_BATCH_SIZE,
    refreshInterval: env.INDEX_REFRESH_INTERVAL,
  },

  // Analytics
  analytics: {
    batchSize: env.ANALYTICS_BATCH_SIZE,
    flushInterval: env.ANALYTICS_FLUSH_INTERVAL,
    trackSearchQueries: env.TRACK_SEARCH_QUERIES,
    trackClickThrough: env.TRACK_CLICK_THROUGH,
    trackUserBehavior: env.TRACK_USER_BEHAVIOR,
  },

  // Performance
  performance: {
    maxConcurrentSearches: env.MAX_CONCURRENT_SEARCHES,
    searchQueueSize: env.SEARCH_QUEUE_SIZE,
    indexQueueSize: env.INDEX_QUEUE_SIZE,
  },
} as const;

// Type for configuration
export type Config = typeof config;

// Validate critical configuration
if (config.isProduction) {
  if (config.jwt.secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
  
  if (!config.elasticsearch.url) {
    throw new Error('Elasticsearch URL is required in production');
  }
}

export default config;
