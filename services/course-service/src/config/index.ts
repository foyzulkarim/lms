import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = z.object({
  // Server Configuration
  PORT: z.string().transform(Number).default('3003'),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database Configuration
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().transform(Number).default('5432'),
  DB_NAME: z.string().default('lms_courses'),
  DB_USER: z.string().default('lms_user'),
  DB_PASSWORD: z.string().default('password'),
  DB_POOL_MIN: z.string().transform(Number).default('2'),
  DB_POOL_MAX: z.string().transform(Number).default('10'),

  // Redis Configuration
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().transform(Number).default('0'),

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
  FILE_SERVICE_URL: z.string().url().default('http://localhost:3005'),
  SEARCH_SERVICE_URL: z.string().url().default('http://localhost:3006'),

  // Content Processing
  MAX_CONTENT_SIZE: z.string().transform(Number).default('10485760'),
  ALLOWED_VIDEO_FORMATS: z.string().default('mp4,webm,ogg'),
  ALLOWED_DOCUMENT_FORMATS: z.string().default('pdf,doc,docx,ppt,pptx'),
  CONTENT_CACHE_TTL: z.string().transform(Number).default('3600'),

  // File Upload
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_FILE_SIZE: z.string().transform(Number).default('52428800'),
  ALLOWED_IMAGE_FORMATS: z.string().default('jpg,jpeg,png,gif,webp'),

  // Rate Limiting
  RATE_LIMIT_MAX: z.string().transform(Number).default('200'),
  RATE_LIMIT_WINDOW: z.string().transform(Number).default('60000'),

  // CORS Configuration
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  CORS_CREDENTIALS: z.string().transform(val => val === 'true').default('true'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple']).default('json'),

  // Course Settings
  DEFAULT_COURSE_LANGUAGE: z.string().default('en'),
  MAX_MODULES_PER_COURSE: z.string().transform(Number).default('50'),
  MAX_LESSONS_PER_MODULE: z.string().transform(Number).default('100'),
  COURSE_SLUG_MAX_LENGTH: z.string().transform(Number).default('100'),
  FEATURED_COURSES_LIMIT: z.string().transform(Number).default('10'),
  POPULAR_COURSES_LIMIT: z.string().transform(Number).default('20'),

  // Cache TTL (in seconds)
  COURSE_CACHE_TTL: z.string().transform(Number).default('3600'),
  COURSE_LIST_CACHE_TTL: z.string().transform(Number).default('1800'),
  LESSON_CONTENT_CACHE_TTL: z.string().transform(Number).default('7200'),
  CATEGORY_CACHE_TTL: z.string().transform(Number).default('86400'),

  // Search Configuration
  SEARCH_RESULTS_LIMIT: z.string().transform(Number).default('50'),
  SEARCH_CACHE_TTL: z.string().transform(Number).default('300'),

  // Analytics
  ANALYTICS_BATCH_SIZE: z.string().transform(Number).default('100'),
  ANALYTICS_FLUSH_INTERVAL: z.string().transform(Number).default('30000'),
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

  // Database
  database: {
    url: env.DATABASE_URL || `postgresql://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`,
    host: env.DB_HOST,
    port: env.DB_PORT,
    name: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    pool: {
      min: env.DB_POOL_MIN,
      max: env.DB_POOL_MAX,
    },
  },

  // Redis
  redis: {
    url: env.REDIS_URL || `redis://${env.REDIS_HOST}:${env.REDIS_PORT}/${env.REDIS_DB}`,
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
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
    file: env.FILE_SERVICE_URL,
    search: env.SEARCH_SERVICE_URL,
  },

  // Content Processing
  content: {
    maxSize: env.MAX_CONTENT_SIZE,
    allowedVideoFormats: env.ALLOWED_VIDEO_FORMATS.split(','),
    allowedDocumentFormats: env.ALLOWED_DOCUMENT_FORMATS.split(','),
    cacheTtl: env.CONTENT_CACHE_TTL,
  },

  // File Upload
  fileUpload: {
    uploadDir: env.UPLOAD_DIR,
    maxFileSize: env.MAX_FILE_SIZE,
    allowedImageFormats: env.ALLOWED_IMAGE_FORMATS.split(','),
  },

  // Rate Limiting
  rateLimit: {
    max: env.RATE_LIMIT_MAX,
    window: env.RATE_LIMIT_WINDOW,
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

  // Course Settings
  course: {
    defaultLanguage: env.DEFAULT_COURSE_LANGUAGE,
    maxModulesPerCourse: env.MAX_MODULES_PER_COURSE,
    maxLessonsPerModule: env.MAX_LESSONS_PER_MODULE,
    slugMaxLength: env.COURSE_SLUG_MAX_LENGTH,
    featuredLimit: env.FEATURED_COURSES_LIMIT,
    popularLimit: env.POPULAR_COURSES_LIMIT,
  },

  // Cache TTL
  cache: {
    course: env.COURSE_CACHE_TTL,
    courseList: env.COURSE_LIST_CACHE_TTL,
    lessonContent: env.LESSON_CONTENT_CACHE_TTL,
    category: env.CATEGORY_CACHE_TTL,
  },

  // Search
  search: {
    resultsLimit: env.SEARCH_RESULTS_LIMIT,
    cacheTtl: env.SEARCH_CACHE_TTL,
  },

  // Analytics
  analytics: {
    batchSize: env.ANALYTICS_BATCH_SIZE,
    flushInterval: env.ANALYTICS_FLUSH_INTERVAL,
  },
} as const;

// Type for configuration
export type Config = typeof config;

// Validate critical configuration
if (config.isProduction) {
  if (config.jwt.secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
  
  if (!config.database.url && (!config.database.host || !config.database.password)) {
    throw new Error('Database configuration is required in production');
  }
}

export default config;
