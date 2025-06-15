import { z } from 'zod';

const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3005),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Database Configuration
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),

  // Redis Configuration
  REDIS_URL: z.string().url(),
  REDIS_KEY_PREFIX: z.string().default('file-service:'),

  // Storage Configuration
  STORAGE_BACKEND: z.enum(['local', 'minio', 's3']).default('minio'),
  STORAGE_BUCKET: z.string().default('lms-files'),
  STORAGE_REGION: z.string().default('us-east-1'),

  // MinIO Configuration
  MINIO_ENDPOINT: z.string().default('localhost:9000'),
  MINIO_ACCESS_KEY: z.string().default('minioadmin'),
  MINIO_SECRET_KEY: z.string().default('minioadmin'),
  MINIO_USE_SSL: z.coerce.boolean().default(false),
  MINIO_PORT: z.coerce.number().default(9000),

  // AWS S3 Configuration (if using S3)
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),

  // Local Storage Configuration
  LOCAL_STORAGE_PATH: z.string().default('./uploads'),
  LOCAL_STORAGE_PUBLIC_URL: z.string().default('http://localhost:3005/files'),

  // Processing Configuration
  PROCESSING_ENABLED: z.coerce.boolean().default(true),
  MAX_CONCURRENT_JOBS: z.coerce.number().default(10),
  IMAGE_PROCESSING_QUALITY: z.coerce.number().default(85),
  VIDEO_PROCESSING_PRESETS: z.string().default('360p,720p,1080p'),

  // Security Configuration
  JWT_SECRET: z.string().min(32),
  MAX_FILE_SIZE: z.coerce.number().default(104857600), // 100MB
  VIRUS_SCAN_ENABLED: z.coerce.boolean().default(false),
  ALLOWED_MIME_TYPES: z.string().default('image/*,video/*,application/pdf,text/*'),

  // Rate Limiting
  UPLOAD_RATE_LIMIT: z.coerce.number().default(100),
  DOWNLOAD_RATE_LIMIT: z.coerce.number().default(1000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 minutes

  // CDN Configuration
  CDN_ENABLED: z.coerce.boolean().default(false),
  CDN_BASE_URL: z.string().optional(),
  CDN_INVALIDATION_ENABLED: z.coerce.boolean().default(false),

  // Event Bus Configuration
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().default('file-service'),
  KAFKA_GROUP_ID: z.string().default('file-service-group'),

  // Feature Flags
  CHUNK_UPLOAD_ENABLED: z.coerce.boolean().default(true),
  VIDEO_PROCESSING_ENABLED: z.coerce.boolean().default(true),
  FILE_VERSIONING_ENABLED: z.coerce.boolean().default(true),
  AUDIT_LOGGING_ENABLED: z.coerce.boolean().default(true),
  COMPRESSION_ENABLED: z.coerce.boolean().default(true),

  // HLS Configuration
  HLS_SEGMENT_DURATION: z.coerce.number().default(10), // seconds
  HLS_PLAYLIST_TYPE: z.enum(['vod', 'live']).default('vod'),
  HLS_OUTPUT_FORMAT: z.string().default('m3u8'),

  // Monitoring
  METRICS_ENABLED: z.coerce.boolean().default(true),
  HEALTH_CHECK_INTERVAL: z.coerce.number().default(30000), // 30 seconds
});

export type EnvConfig = z.infer<typeof envSchema>;

let config: EnvConfig;

export function loadConfig(): EnvConfig {
  if (config) {
    return config;
  }

  try {
    config = envSchema.parse(process.env);
    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      throw new Error(`Environment validation failed:\n${missingVars.join('\n')}`);
    }
    throw error;
  }
}

export function getConfig(): EnvConfig {
  if (!config) {
    throw new Error('Configuration not loaded. Call loadConfig() first.');
  }
  return config;
}

// Export individual config sections for convenience
export const getServerConfig = () => {
  const cfg = getConfig();
  return {
    nodeEnv: cfg.NODE_ENV,
    port: cfg.PORT,
    host: cfg.HOST,
    logLevel: cfg.LOG_LEVEL,
  };
};

export const getDatabaseConfig = () => {
  const cfg = getConfig();
  return {
    url: cfg.DATABASE_URL,
    poolMin: cfg.DATABASE_POOL_MIN,
    poolMax: cfg.DATABASE_POOL_MAX,
  };
};

export const getRedisConfig = () => {
  const cfg = getConfig();
  return {
    url: cfg.REDIS_URL,
    keyPrefix: cfg.REDIS_KEY_PREFIX,
  };
};

export const getStorageConfig = () => {
  const cfg = getConfig();
  return {
    backend: cfg.STORAGE_BACKEND,
    bucket: cfg.STORAGE_BUCKET,
    region: cfg.STORAGE_REGION,
    minio: {
      endpoint: cfg.MINIO_ENDPOINT,
      accessKey: cfg.MINIO_ACCESS_KEY,
      secretKey: cfg.MINIO_SECRET_KEY,
      useSSL: cfg.MINIO_USE_SSL,
      port: cfg.MINIO_PORT,
    },
    aws: {
      accessKeyId: cfg.AWS_ACCESS_KEY_ID,
      secretAccessKey: cfg.AWS_SECRET_ACCESS_KEY,
      region: cfg.AWS_REGION,
    },
    local: {
      path: cfg.LOCAL_STORAGE_PATH,
      publicUrl: cfg.LOCAL_STORAGE_PUBLIC_URL,
    },
  };
};

export const getProcessingConfig = () => {
  const cfg = getConfig();
  return {
    enabled: cfg.PROCESSING_ENABLED,
    maxConcurrentJobs: cfg.MAX_CONCURRENT_JOBS,
    imageQuality: cfg.IMAGE_PROCESSING_QUALITY,
    videoPresets: cfg.VIDEO_PROCESSING_PRESETS.split(','),
    hls: {
      segmentDuration: cfg.HLS_SEGMENT_DURATION,
      playlistType: cfg.HLS_PLAYLIST_TYPE,
      outputFormat: cfg.HLS_OUTPUT_FORMAT,
    },
  };
};

export const getSecurityConfig = () => {
  const cfg = getConfig();
  return {
    jwtSecret: cfg.JWT_SECRET,
    maxFileSize: cfg.MAX_FILE_SIZE,
    virusScanEnabled: cfg.VIRUS_SCAN_ENABLED,
    allowedMimeTypes: cfg.ALLOWED_MIME_TYPES.split(','),
    rateLimits: {
      upload: cfg.UPLOAD_RATE_LIMIT,
      download: cfg.DOWNLOAD_RATE_LIMIT,
      windowMs: cfg.RATE_LIMIT_WINDOW_MS,
    },
  };
};

export const getFeatureFlags = () => {
  const cfg = getConfig();
  return {
    chunkUploadEnabled: cfg.CHUNK_UPLOAD_ENABLED,
    videoProcessingEnabled: cfg.VIDEO_PROCESSING_ENABLED,
    fileVersioningEnabled: cfg.FILE_VERSIONING_ENABLED,
    auditLoggingEnabled: cfg.AUDIT_LOGGING_ENABLED,
    compressionEnabled: cfg.COMPRESSION_ENABLED,
  };
};
