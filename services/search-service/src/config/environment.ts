import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const environmentSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3008),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Database Configuration
  DATABASE_URL: z.string().min(1, 'Database URL is required'),
  VECTOR_DB_URL: z.string().optional(),
  DB_POOL_MIN: z.coerce.number().default(2),
  DB_POOL_MAX: z.coerce.number().default(10),

  // Redis Configuration
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().default(0),

  // Elasticsearch Configuration
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_USERNAME: z.string().optional(),
  ELASTICSEARCH_PASSWORD: z.string().optional(),
  ELASTICSEARCH_INDEX_PREFIX: z.string().default('lms'),
  ELASTICSEARCH_MAX_RESULT_WINDOW: z.coerce.number().default(10000),
  ELASTICSEARCH_TIMEOUT: z.coerce.number().default(30000),

  // Vector Search Configuration
  VECTOR_DIMENSIONS: z.coerce.number().default(1536),
  SIMILARITY_THRESHOLD: z.coerce.number().default(0.7),
  MAX_VECTOR_RESULTS: z.coerce.number().default(100),
  VECTOR_SEARCH_TIMEOUT: z.coerce.number().default(5000),

  // LLM Integration
  LLM_GATEWAY_URL: z.string().url().default('http://localhost:3010'),
  DEFAULT_EMBEDDING_MODEL: z.string().default('text-embedding-ada-002'),
  DEFAULT_RAG_MODEL: z.string().default('gpt-4'),
  RAG_MAX_CONTEXTS: z.coerce.number().default(10),
  RAG_CONTEXT_MAX_TOKENS: z.coerce.number().default(4000),
  RAG_TEMPERATURE: z.coerce.number().default(0.3),
  RAG_MAX_TOKENS: z.coerce.number().default(1000),

  // Search Configuration
  DEFAULT_SEARCH_LIMIT: z.coerce.number().default(20),
  MAX_SEARCH_LIMIT: z.coerce.number().default(100),
  SEARCH_TIMEOUT_MS: z.coerce.number().default(5000),
  ENABLE_QUERY_EXPANSION: z.coerce.boolean().default(true),
  ENABLE_SPELL_CHECK: z.coerce.boolean().default(true),
  MIN_QUERY_LENGTH: z.coerce.number().default(2),

  // Caching Configuration
  CACHE_SEARCH_RESULTS: z.coerce.boolean().default(true),
  SEARCH_CACHE_TTL: z.coerce.number().default(300), // 5 minutes
  SUGGESTIONS_CACHE_TTL: z.coerce.number().default(3600), // 1 hour
  RAG_CACHE_TTL: z.coerce.number().default(1800), // 30 minutes
  VECTOR_CACHE_TTL: z.coerce.number().default(600), // 10 minutes

  // JWT Configuration
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().default(60000), // 1 minute
  RAG_RATE_LIMIT_MAX: z.coerce.number().default(20),
  RAG_RATE_LIMIT_WINDOW: z.coerce.number().default(60000),

  // External Services
  CONTENT_INGESTION_SERVICE_URL: z.string().url().default('http://localhost:3007'),
  FILE_SERVICE_URL: z.string().url().default('http://localhost:3005'),
  COURSE_SERVICE_URL: z.string().url().default('http://localhost:3002'),

  // Event Bus Configuration
  KAFKA_BROKERS: z.string().optional(),
  KAFKA_CLIENT_ID: z.string().default('search-service'),
  KAFKA_GROUP_ID: z.string().default('search-service-group'),

  // Indexing Configuration
  INDEX_BATCH_SIZE: z.coerce.number().default(100),
  INDEX_CONCURRENCY: z.coerce.number().default(5),
  AUTO_INDEX_ENABLED: z.coerce.boolean().default(true),
  INDEX_RETRY_ATTEMPTS: z.coerce.number().default(3),
  INDEX_RETRY_DELAY: z.coerce.number().default(5000),

  // Analytics Configuration
  ENABLE_SEARCH_ANALYTICS: z.coerce.boolean().default(true),
  ANALYTICS_BATCH_SIZE: z.coerce.number().default(50),
  ANALYTICS_FLUSH_INTERVAL: z.coerce.number().default(30000), // 30 seconds

  // Health Check Configuration
  HEALTH_CHECK_TIMEOUT: z.coerce.number().default(5000),
  HEALTH_CHECK_INTERVAL: z.coerce.number().default(30000),

  // Monitoring
  ENABLE_METRICS: z.coerce.boolean().default(true),
  METRICS_PORT: z.coerce.number().default(9090),

  // Feature Flags
  ENABLE_RAG_SEARCH: z.coerce.boolean().default(true),
  ENABLE_SEMANTIC_SEARCH: z.coerce.boolean().default(true),
  ENABLE_HYBRID_SEARCH: z.coerce.boolean().default(true),
  ENABLE_AUTOCOMPLETE: z.coerce.boolean().default(true),
  ENABLE_FACETED_SEARCH: z.coerce.boolean().default(true),
  ENABLE_QUERY_SUGGESTIONS: z.coerce.boolean().default(true),
});

export type Environment = z.infer<typeof environmentSchema>;

let config: Environment;

try {
  config = environmentSchema.parse(process.env);
} catch (error) {
  console.error('❌ Invalid environment configuration:', error);
  process.exit(1);
}

export { config };

// Derived configurations
export const searchConfig = {
  elasticsearch: {
    url: config.ELASTICSEARCH_URL,
    username: config.ELASTICSEARCH_USERNAME,
    password: config.ELASTICSEARCH_PASSWORD,
    indexPrefix: config.ELASTICSEARCH_INDEX_PREFIX,
    maxResultWindow: config.ELASTICSEARCH_MAX_RESULT_WINDOW,
    timeout: config.ELASTICSEARCH_TIMEOUT,
  },
  vector: {
    dimensions: config.VECTOR_DIMENSIONS,
    similarityThreshold: config.SIMILARITY_THRESHOLD,
    maxResults: config.MAX_VECTOR_RESULTS,
    timeout: config.VECTOR_SEARCH_TIMEOUT,
  },
  rag: {
    maxContexts: config.RAG_MAX_CONTEXTS,
    contextMaxTokens: config.RAG_CONTEXT_MAX_TOKENS,
    temperature: config.RAG_TEMPERATURE,
    maxTokens: config.RAG_MAX_TOKENS,
    model: config.DEFAULT_RAG_MODEL,
  },
  cache: {
    searchResults: config.CACHE_SEARCH_RESULTS,
    searchTTL: config.SEARCH_CACHE_TTL,
    suggestionsTTL: config.SUGGESTIONS_CACHE_TTL,
    ragTTL: config.RAG_CACHE_TTL,
    vectorTTL: config.VECTOR_CACHE_TTL,
  },
  limits: {
    defaultLimit: config.DEFAULT_SEARCH_LIMIT,
    maxLimit: config.MAX_SEARCH_LIMIT,
    timeout: config.SEARCH_TIMEOUT_MS,
    minQueryLength: config.MIN_QUERY_LENGTH,
  },
  features: {
    ragSearch: config.ENABLE_RAG_SEARCH,
    semanticSearch: config.ENABLE_SEMANTIC_SEARCH,
    hybridSearch: config.ENABLE_HYBRID_SEARCH,
    autocomplete: config.ENABLE_AUTOCOMPLETE,
    facetedSearch: config.ENABLE_FACETED_SEARCH,
    querySuggestions: config.ENABLE_QUERY_SUGGESTIONS,
    queryExpansion: config.ENABLE_QUERY_EXPANSION,
    spellCheck: config.ENABLE_SPELL_CHECK,
  },
};

export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';
