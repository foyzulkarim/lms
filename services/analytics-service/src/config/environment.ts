import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const environmentSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default(3007),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // Database Configuration
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().transform(Number).default(5432),
  DB_NAME: z.string().default('lms_analytics'),
  DB_USER: z.string().default('analytics_user'),
  DB_PASSWORD: z.string().default('analytics_password'),
  DB_POOL_MIN: z.string().transform(Number).default(2),
  DB_POOL_MAX: z.string().transform(Number).default(20),
  DB_SSL: z.string().transform(Boolean).default(false),
  
  // Redis Configuration
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().transform(Number).default(2),
  REDIS_KEY_PREFIX: z.string().default('analytics:'),
  
  // Kafka Configuration
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().default('analytics-service'),
  KAFKA_GROUP_ID: z.string().default('analytics-group'),
  KAFKA_USERNAME: z.string().optional(),
  KAFKA_PASSWORD: z.string().optional(),
  KAFKA_SSL: z.string().transform(Boolean).default(false),
  
  // Authentication
  JWT_SECRET: z.string().min(32),
  SERVICE_API_KEY: z.string().min(32),
  
  // Report Generation
  REPORTS_STORAGE_PATH: z.string().default('/tmp/reports'),
  MAX_REPORT_SIZE_MB: z.string().transform(Number).default(50),
  REPORT_RETENTION_DAYS: z.string().transform(Number).default(30),
  
  // Caching
  CACHE_TTL_SECONDS: z.string().transform(Number).default(300),
  DASHBOARD_CACHE_TTL_SECONDS: z.string().transform(Number).default(60),
  METRICS_CACHE_TTL_SECONDS: z.string().transform(Number).default(120),
  
  // Performance
  MAX_CONCURRENT_REPORTS: z.string().transform(Number).default(10),
  BATCH_SIZE: z.string().transform(Number).default(1000),
  QUERY_TIMEOUT_MS: z.string().transform(Number).default(30000),
  
  // Monitoring
  METRICS_ENABLED: z.string().transform(Boolean).default(true),
  HEALTH_CHECK_INTERVAL_MS: z.string().transform(Number).default(30000),
  
  // Rate Limiting
  RATE_LIMIT_MAX: z.string().transform(Number).default(1000),
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default(60000),
  
  // Event Processing
  EVENT_BATCH_SIZE: z.string().transform(Number).default(100),
  EVENT_PROCESSING_INTERVAL_MS: z.string().transform(Number).default(5000),
  MAX_EVENT_RETRY_ATTEMPTS: z.string().transform(Number).default(3),
  
  // Data Retention
  RAW_EVENT_RETENTION_DAYS: z.string().transform(Number).default(90),
  AGGREGATED_DATA_RETENTION_DAYS: z.string().transform(Number).default(365),
  
  // Feature Flags
  ENABLE_REAL_TIME_ANALYTICS: z.string().transform(Boolean).default(true),
  ENABLE_PREDICTIVE_ANALYTICS: z.string().transform(Boolean).default(false),
  ENABLE_ADVANCED_REPORTING: z.string().transform(Boolean).default(true),
  ENABLE_DATA_EXPORT: z.string().transform(Boolean).default(true),
});

export type Environment = z.infer<typeof environmentSchema>;

let env: Environment;

try {
  env = environmentSchema.parse(process.env);
} catch (error) {
  console.error('❌ Invalid environment configuration:', error);
  process.exit(1);
}

export { env };

// Database connection string
export const getDatabaseUrl = (): string => {
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL } = env;
  const sslParam = DB_SSL ? '?sslmode=require' : '';
  return `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}${sslParam}`;
};

// Redis connection configuration
export const getRedisConfig = () => ({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  db: env.REDIS_DB,
  keyPrefix: env.REDIS_KEY_PREFIX,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

// Kafka connection configuration
export const getKafkaConfig = () => ({
  clientId: env.KAFKA_CLIENT_ID,
  brokers: env.KAFKA_BROKERS.split(','),
  ssl: env.KAFKA_SSL,
  sasl: env.KAFKA_USERNAME && env.KAFKA_PASSWORD ? {
    mechanism: 'plain' as const,
    username: env.KAFKA_USERNAME,
    password: env.KAFKA_PASSWORD,
  } : undefined,
});

export default env;
