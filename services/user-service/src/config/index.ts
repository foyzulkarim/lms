import { config } from 'dotenv';
import { z } from 'zod';

// Load environment variables
config();

// Configuration schema with validation
const configSchema = z.object({
  // Server Configuration
  server: z.object({
    port: z.number().int().positive().default(3002),
    host: z.string().default('0.0.0.0'),
    nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  }),

  // Database Configuration
  database: z.object({
    url: z.string().optional(),
    host: z.string().default('localhost'),
    port: z.number().int().positive().default(5432),
    name: z.string().default('lms_users'),
    user: z.string().default('lms_user'),
    password: z.string().default('password'),
    ssl: z.boolean().default(false),
    pool: z.object({
      min: z.number().int().nonnegative().default(2),
      max: z.number().int().positive().default(10),
    }),
  }),

  // Redis Configuration
  redis: z.object({
    url: z.string().optional(),
    host: z.string().default('localhost'),
    port: z.number().int().positive().default(6379),
    password: z.string().optional(),
    db: z.number().int().nonnegative().default(0),
    keyPrefix: z.string().default('user-service:'),
  }),

  // RabbitMQ Configuration
  rabbitmq: z.object({
    url: z.string().optional(),
    host: z.string().default('localhost'),
    port: z.number().int().positive().default(5672),
    username: z.string().default('guest'),
    password: z.string().default('guest'),
    vhost: z.string().default('/'),
    exchange: z.string().default('lms.events'),
    queue: z.string().default('user-service.events'),
  }),

  // JWT Configuration
  jwt: z.object({
    secret: z.string().min(32),
    expiresIn: z.string().default('24h'),
    refreshExpiresIn: z.string().default('7d'),
  }),

  // External Services
  services: z.object({
    auth: z.string().url().default('http://localhost:3001'),
    course: z.string().url().default('http://localhost:3003'),
    analytics: z.string().url().default('http://localhost:3004'),
    email: z.string().url().optional(),
  }),

  // Rate Limiting
  rateLimit: z.object({
    max: z.number().int().positive().default(100),
    window: z.number().int().positive().default(60000),
    skipSuccessful: z.boolean().default(false),
  }),

  // CORS Configuration
  cors: z.object({
    origin: z.union([z.string(), z.array(z.string())]).default('http://localhost:3000'),
    credentials: z.boolean().default(true),
    methods: z.array(z.string()).default(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']),
    allowedHeaders: z.array(z.string()).default(['Content-Type', 'Authorization', 'X-Requested-With']),
  }),

  // Security
  security: z.object({
    helmetEnabled: z.boolean().default(true),
    bcryptRounds: z.number().int().positive().default(12),
  }),

  // Logging
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    format: z.enum(['json', 'simple']).default('json'),
    fileEnabled: z.boolean().default(false),
    filePath: z.string().default('./logs/user-service.log'),
  }),

  // Cache Configuration
  cache: z.object({
    ttl: z.object({
      userProfile: z.number().int().positive().default(900), // 15 minutes
      userPreferences: z.number().int().positive().default(1800), // 30 minutes
      userEnrollments: z.number().int().positive().default(300), // 5 minutes
      userSearch: z.number().int().positive().default(120), // 2 minutes
    }),
  }),

  // Pagination
  pagination: z.object({
    defaultPageSize: z.number().int().positive().default(20),
    maxPageSize: z.number().int().positive().default(100),
  }),

  // File Upload
  upload: z.object({
    maxFileSize: z.number().int().positive().default(5242880), // 5MB
    allowedTypes: z.array(z.string()).default(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  }),

  // Health Check
  healthCheck: z.object({
    timeout: z.number().int().positive().default(5000),
    interval: z.number().int().positive().default(30000),
  }),

  // Metrics
  metrics: z.object({
    enabled: z.boolean().default(true),
    port: z.number().int().positive().default(9090),
    path: z.string().default('/metrics'),
  }),

  // Feature Flags
  features: z.object({
    userRegistration: z.boolean().default(true),
    profileCompletionTracking: z.boolean().default(true),
    enrollmentAnalytics: z.boolean().default(true),
    preferenceCaching: z.boolean().default(true),
    sessionTracking: z.boolean().default(true),
  }),

  // Audit Configuration
  audit: z.object({
    enabled: z.boolean().default(true),
    sensitiveFields: z.array(z.string()).default(['password', 'email', 'phone']),
  }),
});

// Parse and validate configuration
const parseConfig = () => {
  const rawConfig = {
    server: {
      port: parseInt(process.env.PORT || '3002', 10),
      host: process.env.HOST || '0.0.0.0',
      nodeEnv: process.env.NODE_ENV || 'development',
    },
    database: {
      url: process.env.DATABASE_URL,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      name: process.env.DB_NAME || 'lms_users',
      user: process.env.DB_USER || 'lms_user',
      password: process.env.DB_PASSWORD || 'password',
      ssl: process.env.DB_SSL === 'true',
      pool: {
        min: parseInt(process.env.DB_POOL_MIN || '2', 10),
        max: parseInt(process.env.DB_POOL_MAX || '10', 10),
      },
    },
    redis: {
      url: process.env.REDIS_URL,
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'user-service:',
    },
    rabbitmq: {
      url: process.env.RABBITMQ_URL,
      host: process.env.RABBITMQ_HOST || 'localhost',
      port: parseInt(process.env.RABBITMQ_PORT || '5672', 10),
      username: process.env.RABBITMQ_USERNAME || 'guest',
      password: process.env.RABBITMQ_PASSWORD || 'guest',
      vhost: process.env.RABBITMQ_VHOST || '/',
      exchange: process.env.RABBITMQ_EXCHANGE || 'lms.events',
      queue: process.env.RABBITMQ_QUEUE || 'user-service.events',
    },
    jwt: {
      secret: process.env.JWT_SECRET || '',
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
    services: {
      auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
      course: process.env.COURSE_SERVICE_URL || 'http://localhost:3003',
      analytics: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3004',
      email: process.env.EMAIL_SERVICE_URL,
    },
    rateLimit: {
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      window: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
      skipSuccessful: process.env.RATE_LIMIT_SKIP_SUCCESSFUL === 'true',
    },
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
      credentials: process.env.CORS_CREDENTIALS !== 'false',
      methods: process.env.CORS_METHODS?.split(',') || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: process.env.CORS_ALLOWED_HEADERS?.split(',') || ['Content-Type', 'Authorization', 'X-Requested-With'],
    },
    security: {
      helmetEnabled: process.env.HELMET_ENABLED !== 'false',
      bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      format: process.env.LOG_FORMAT || 'json',
      fileEnabled: process.env.LOG_FILE_ENABLED === 'true',
      filePath: process.env.LOG_FILE_PATH || './logs/user-service.log',
    },
    cache: {
      ttl: {
        userProfile: parseInt(process.env.CACHE_TTL_USER_PROFILE || '900', 10),
        userPreferences: parseInt(process.env.CACHE_TTL_USER_PREFERENCES || '1800', 10),
        userEnrollments: parseInt(process.env.CACHE_TTL_USER_ENROLLMENTS || '300', 10),
        userSearch: parseInt(process.env.CACHE_TTL_USER_SEARCH || '120', 10),
      },
    },
    pagination: {
      defaultPageSize: parseInt(process.env.DEFAULT_PAGE_SIZE || '20', 10),
      maxPageSize: parseInt(process.env.MAX_PAGE_SIZE || '100', 10),
    },
    upload: {
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10),
      allowedTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    },
    healthCheck: {
      timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000', 10),
      interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
    },
    metrics: {
      enabled: process.env.METRICS_ENABLED !== 'false',
      port: parseInt(process.env.METRICS_PORT || '9090', 10),
      path: process.env.METRICS_PATH || '/metrics',
    },
    features: {
      userRegistration: process.env.ENABLE_USER_REGISTRATION !== 'false',
      profileCompletionTracking: process.env.ENABLE_PROFILE_COMPLETION_TRACKING !== 'false',
      enrollmentAnalytics: process.env.ENABLE_ENROLLMENT_ANALYTICS !== 'false',
      preferenceCaching: process.env.ENABLE_PREFERENCE_CACHING !== 'false',
      sessionTracking: process.env.ENABLE_SESSION_TRACKING !== 'false',
    },
    audit: {
      enabled: process.env.AUDIT_ENABLED !== 'false',
      sensitiveFields: process.env.AUDIT_SENSITIVE_FIELDS?.split(',') || ['password', 'email', 'phone'],
    },
  };

  try {
    return configSchema.parse(rawConfig);
  } catch (error) {
    console.error('Configuration validation failed:', error);
    process.exit(1);
  }
};

export const appConfig = parseConfig();
export type AppConfig = z.infer<typeof configSchema>;

// Export individual config sections for convenience
export const {
  server: serverConfig,
  database: databaseConfig,
  redis: redisConfig,
  rabbitmq: rabbitmqConfig,
  jwt: jwtConfig,
  services: servicesConfig,
  rateLimit: rateLimitConfig,
  cors: corsConfig,
  security: securityConfig,
  logging: loggingConfig,
  cache: cacheConfig,
  pagination: paginationConfig,
  upload: uploadConfig,
  healthCheck: healthCheckConfig,
  metrics: metricsConfig,
  features: featuresConfig,
  audit: auditConfig,
} = appConfig;
