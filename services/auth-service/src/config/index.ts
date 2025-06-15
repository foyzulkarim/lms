import { z } from 'zod';

const configSchema = z.object({
  // Server Configuration
  port: z.coerce.number().default(3001),
  host: z.string().default('0.0.0.0'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Database Configuration
  database: z.object({
    url: z.string(),
    host: z.string().default('localhost'),
    port: z.coerce.number().default(5432),
    name: z.string().default('lms_auth'),
    user: z.string().default('lms_user'),
    password: z.string(),
  }),

  // Redis Configuration
  redis: z.object({
    url: z.string().optional(),
    host: z.string().default('localhost'),
    port: z.coerce.number().default(6379),
    password: z.string().optional(),
  }),

  // JWT Configuration
  jwt: z.object({
    secret: z.string().min(32),
    expiresIn: z.string().default('24h'),
    refreshSecret: z.string().min(32),
    refreshExpiresIn: z.string().default('7d'),
  }),

  // Session Configuration
  session: z.object({
    secret: z.string().min(32),
    maxAge: z.coerce.number().default(86400000), // 24 hours
  }),

  // OAuth Configuration
  oauth: z.object({
    google: z.object({
      clientId: z.string(),
      clientSecret: z.string(),
      callbackUrl: z.string().default('http://localhost:3001/oauth/google/callback'),
    }),
  }),

  // RabbitMQ Configuration
  rabbitmq: z.object({
    url: z.string().default('amqp://localhost:5672'),
    exchange: z.string().default('lms.events'),
  }),

  // Security Configuration
  security: z.object({
    passwordMinLength: z.coerce.number().default(8),
  }),

  // Rate Limiting
  rateLimit: z.object({
    max: z.coerce.number().default(100),
    window: z.coerce.number().default(60000), // 1 minute
  }),

  // CORS Configuration
  cors: z.object({
    origin: z.string().default('http://localhost:3000'),
    credentials: z.coerce.boolean().default(true),
  }),

  // Logging
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    format: z.enum(['json', 'simple']).default('json'),
  }),
});

const rawConfig = {
  port: process.env.PORT,
  host: process.env.HOST,
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
  },

  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: process.env.JWT_EXPIRES_IN,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  },

  session: {
    secret: process.env.SESSION_SECRET!,
    maxAge: process.env.SESSION_MAX_AGE,
  },

  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackUrl: process.env.GOOGLE_CALLBACK_URL,
    },
  },

  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    exchange: process.env.RABBITMQ_EXCHANGE,
  },

  security: {
    passwordMinLength: process.env.PASSWORD_MIN_LENGTH,
  },

  rateLimit: {
    max: process.env.RATE_LIMIT_MAX,
    window: process.env.RATE_LIMIT_WINDOW,
  },

  cors: {
    origin: process.env.CORS_ORIGIN,
    credentials: process.env.CORS_CREDENTIALS,
  },

  logging: {
    level: process.env.LOG_LEVEL,
    format: process.env.LOG_FORMAT,
  },
};

export const config = configSchema.parse(rawConfig);
export type Config = z.infer<typeof configSchema>;
