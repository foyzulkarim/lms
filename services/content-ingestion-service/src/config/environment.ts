import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const environmentSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3007),
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

  // External Services
  LLM_GATEWAY_URL: z.string().url().default('http://localhost:3010'),
  FILE_SERVICE_URL: z.string().url().default('http://localhost:3005'),
  SEARCH_SERVICE_URL: z.string().url().default('http://localhost:3008'),

  // JWT Configuration
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // Processing Configuration
  CHUNK_SIZE: z.coerce.number().default(500),
  CHUNK_OVERLAP: z.coerce.number().default(50),
  MIN_CHUNK_SIZE: z.coerce.number().default(100),
  MAX_CHUNK_SIZE: z.coerce.number().default(1000),
  MAX_CONCURRENT_JOBS: z.coerce.number().default(5),
  BATCH_SIZE: z.coerce.number().default(10),

  // Embedding Configuration
  EMBEDDING_MODEL: z.string().default('text-embedding-ada-002'),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(1536),
  EMBEDDING_BATCH_SIZE: z.coerce.number().default(10),
  EMBEDDING_TIMEOUT: z.coerce.number().default(30000),

  // Content Extraction
  ENABLE_OCR: z.coerce.boolean().default(true),
  ENABLE_SPEECH_TO_TEXT: z.coerce.boolean().default(true),
  WHISPER_MODEL: z.string().default('base'),
  TESSERACT_LANG: z.string().default('eng'),
  EXTRACTION_TIMEOUT: z.coerce.number().default(300000), // 5 minutes
  CONFIDENCE_THRESHOLD: z.coerce.number().default(0.7),

  // External APIs
  YOUTUBE_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Job Queue Configuration
  QUEUE_REDIS_URL: z.string().optional(),
  JOB_CONCURRENCY: z.coerce.number().default(10),
  JOB_RETRY_ATTEMPTS: z.coerce.number().default(3),
  JOB_RETRY_DELAY: z.coerce.number().default(5000),
  JOB_TIMEOUT: z.coerce.number().default(600000), // 10 minutes

  // Event Bus Configuration
  KAFKA_BROKERS: z.string().optional(),
  KAFKA_CLIENT_ID: z.string().default('content-ingestion-service'),
  KAFKA_GROUP_ID: z.string().default('content-ingestion-group'),

  // File Storage
  TEMP_DIR: z.string().default('/tmp/content-ingestion'),
  MAX_FILE_SIZE: z.coerce.number().default(100 * 1024 * 1024), // 100MB
  ALLOWED_MIME_TYPES: z.string().default('application/pdf,text/plain,text/html,image/*,video/*,audio/*'),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().default(60000), // 1 minute

  // Health Check
  HEALTH_CHECK_TIMEOUT: z.coerce.number().default(5000),
  HEALTH_CHECK_INTERVAL: z.coerce.number().default(30000),

  // Monitoring
  ENABLE_METRICS: z.coerce.boolean().default(true),
  METRICS_PORT: z.coerce.number().default(9090),
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
export const processingConfig = {
  chunking: {
    defaultSize: config.CHUNK_SIZE,
    overlap: config.CHUNK_OVERLAP,
    minChunkSize: config.MIN_CHUNK_SIZE,
    maxChunkSize: config.MAX_CHUNK_SIZE,
  },
  embedding: {
    model: config.EMBEDDING_MODEL,
    dimensions: config.EMBEDDING_DIMENSIONS,
    batchSize: config.EMBEDDING_BATCH_SIZE,
    timeout: config.EMBEDDING_TIMEOUT,
  },
  extraction: {
    enableOCR: config.ENABLE_OCR,
    enableSpeechToText: config.ENABLE_SPEECH_TO_TEXT,
    whisperModel: config.WHISPER_MODEL,
    tesseractLang: config.TESSERACT_LANG,
    timeout: config.EXTRACTION_TIMEOUT,
    confidenceThreshold: config.CONFIDENCE_THRESHOLD,
  },
  jobs: {
    concurrency: config.JOB_CONCURRENCY,
    retryAttempts: config.JOB_RETRY_ATTEMPTS,
    retryDelay: config.JOB_RETRY_DELAY,
    timeout: config.JOB_TIMEOUT,
  },
};

export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';
