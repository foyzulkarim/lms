import { z } from 'zod';

const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default(3006),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database Configuration
  DATABASE_URL: z.string().min(1, 'Database URL is required'),
  DB_POOL_MIN: z.string().transform(Number).default(2),
  DB_POOL_MAX: z.string().transform(Number).default(10),
  DB_TIMEOUT: z.string().transform(Number).default(30000),

  // Redis Configuration
  REDIS_URL: z.string().min(1, 'Redis URL is required'),
  REDIS_KEY_PREFIX: z.string().default('notification:'),
  REDIS_TTL: z.string().transform(Number).default(3600),

  // EMAIL-Dispatcher Integration
  EMAIL_DISPATCHER_URL: z.string().url('Invalid EMAIL-Dispatcher URL'),
  EMAIL_DISPATCHER_API_KEY: z.string().min(1, 'EMAIL-Dispatcher API key is required'),
  EMAIL_DISPATCHER_TIMEOUT: z.string().transform(Number).default(30000),
  DEFAULT_FROM_NAME: z.string().default('LMS Platform'),
  DEFAULT_FROM_EMAIL: z.string().email().default('noreply@lms.example.com'),
  DEFAULT_REPLY_TO: z.string().email().optional(),

  // Web Push Configuration
  VAPID_SUBJECT: z.string().min(1, 'VAPID subject is required'),
  VAPID_PUBLIC_KEY: z.string().min(1, 'VAPID public key is required'),
  VAPID_PRIVATE_KEY: z.string().min(1, 'VAPID private key is required'),
  DEFAULT_PUSH_ICON: z.string().default('/icons/notification-icon.png'),
  DEFAULT_PUSH_BADGE: z.string().default('/icons/badge-icon.png'),
  PUSH_TTL: z.string().transform(Number).default(86400), // 24 hours

  // Queue Configuration
  QUEUE_CONCURRENCY: z.string().transform(Number).default(10),
  MAX_RETRY_ATTEMPTS: z.string().transform(Number).default(3),
  RETRY_DELAY_MS: z.string().transform(Number).default(5000),
  BATCH_SIZE: z.string().transform(Number).default(100),
  BULK_THROTTLE_MS: z.string().transform(Number).default(1000),
  QUEUE_CLEANUP_INTERVAL: z.string().transform(Number).default(3600000), // 1 hour

  // Rate Limiting
  EMAIL_RATE_LIMIT: z.string().transform(Number).default(1000), // per hour per user
  PUSH_RATE_LIMIT: z.string().transform(Number).default(500), // per hour per user
  GLOBAL_RATE_LIMIT: z.string().transform(Number).default(10000), // per hour
  RATE_LIMIT_WINDOW: z.string().transform(Number).default(3600000), // 1 hour

  // Template Configuration
  TEMPLATE_CACHE_TTL: z.string().transform(Number).default(3600),
  ENABLE_TEMPLATE_VALIDATION: z.string().transform(Boolean).default(true),
  MAX_TEMPLATE_SIZE: z.string().transform(Number).default(1048576), // 1MB
  TEMPLATE_RENDER_TIMEOUT: z.string().transform(Number).default(5000),

  // Analytics Configuration
  ENABLE_DELIVERY_TRACKING: z.string().transform(Boolean).default(true),
  ENABLE_OPEN_TRACKING: z.string().transform(Boolean).default(true),
  ENABLE_CLICK_TRACKING: z.string().transform(Boolean).default(true),
  ANALYTICS_RETENTION_DAYS: z.string().transform(Number).default(90),

  // Event Bus Configuration (Kafka)
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().default('notification-service'),
  KAFKA_GROUP_ID: z.string().default('notification-service-group'),
  KAFKA_RETRY_ATTEMPTS: z.string().transform(Number).default(5),
  KAFKA_RETRY_DELAY: z.string().transform(Number).default(1000),

  // Security Configuration
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  API_KEY_HEADER: z.string().default('x-api-key'),
  CORS_ORIGIN: z.string().default('*'),
  ENABLE_SWAGGER: z.string().transform(Boolean).default(true),

  // Monitoring Configuration
  METRICS_PORT: z.string().transform(Number).default(9090),
  HEALTH_CHECK_INTERVAL: z.string().transform(Number).default(30000),
  ENABLE_PROMETHEUS: z.string().transform(Boolean).default(true),

  // Feature Flags
  ENABLE_EMAIL_NOTIFICATIONS: z.string().transform(Boolean).default(true),
  ENABLE_PUSH_NOTIFICATIONS: z.string().transform(Boolean).default(true),
  ENABLE_BULK_MESSAGING: z.string().transform(Boolean).default(true),
  ENABLE_SCHEDULED_NOTIFICATIONS: z.string().transform(Boolean).default(true),
  ENABLE_TEMPLATE_CACHING: z.string().transform(Boolean).default(true),

  // External Service URLs
  USER_SERVICE_URL: z.string().url().default('http://user-service:3001'),
  COURSE_SERVICE_URL: z.string().url().default('http://course-service:3002'),
  AUTH_SERVICE_URL: z.string().url().default('http://auth-service:3000'),

  // Notification Limits
  MAX_RECIPIENTS_PER_NOTIFICATION: z.string().transform(Number).default(10000),
  MAX_BULK_SIZE: z.string().transform(Number).default(50000),
  MAX_TEMPLATE_VARIABLES: z.string().transform(Number).default(100),
  MAX_ATTACHMENT_SIZE: z.string().transform(Number).default(10485760), // 10MB

  // Quiet Hours Configuration
  DEFAULT_QUIET_START: z.string().default('22:00'),
  DEFAULT_QUIET_END: z.string().default('08:00'),
  DEFAULT_TIMEZONE: z.string().default('UTC'),

  // Unsubscribe Configuration
  UNSUBSCRIBE_BASE_URL: z.string().url().default('https://lms.example.com/unsubscribe'),
  UNSUBSCRIBE_SECRET: z.string().min(32, 'Unsubscribe secret must be at least 32 characters'),

  // Development Configuration
  MOCK_EMAIL_DISPATCHER: z.string().transform(Boolean).default(false),
  MOCK_PUSH_SERVICE: z.string().transform(Boolean).default(false),
  LOG_SQL_QUERIES: z.string().transform(Boolean).default(false)
});

export type EnvConfig = z.infer<typeof envSchema>;

let config: EnvConfig;

try {
  config = envSchema.parse(process.env);
} catch (error) {
  console.error('❌ Invalid environment configuration:', error);
  process.exit(1);
}

export { config };

// Helper functions for configuration
export const isDevelopment = () => config.NODE_ENV === 'development';
export const isProduction = () => config.NODE_ENV === 'production';
export const isTest = () => config.NODE_ENV === 'test';

// Database configuration for Knex
export const databaseConfig = {
  client: 'postgresql',
  connection: config.DATABASE_URL,
  pool: {
    min: config.DB_POOL_MIN,
    max: config.DB_POOL_MAX,
    acquireTimeoutMillis: config.DB_TIMEOUT,
    createTimeoutMillis: config.DB_TIMEOUT,
    destroyTimeoutMillis: config.DB_TIMEOUT,
    idleTimeoutMillis: config.DB_TIMEOUT,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
  },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations'
  },
  seeds: {
    directory: './seeds'
  }
};

// Redis configuration
export const redisConfig = {
  url: config.REDIS_URL,
  keyPrefix: config.REDIS_KEY_PREFIX,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
  lazyConnect: true
};

// Kafka configuration
export const kafkaConfig = {
  clientId: config.KAFKA_CLIENT_ID,
  brokers: config.KAFKA_BROKERS.split(','),
  retry: {
    initialRetryTime: config.KAFKA_RETRY_DELAY,
    retries: config.KAFKA_RETRY_ATTEMPTS
  }
};

// Web Push configuration
export const webPushConfig = {
  vapidDetails: {
    subject: config.VAPID_SUBJECT,
    publicKey: config.VAPID_PUBLIC_KEY,
    privateKey: config.VAPID_PRIVATE_KEY
  },
  defaultOptions: {
    TTL: config.PUSH_TTL,
    urgency: 'normal' as const,
    icon: config.DEFAULT_PUSH_ICON,
    badge: config.DEFAULT_PUSH_BADGE
  }
};

export default config;
