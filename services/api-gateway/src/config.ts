interface Config {
  port: number;
  cors: {
    origins: string[];
  };
  rateLimit: {
    max: number;
    timeWindow: string;
  };
  jwt: {
    secret: string;
  };
  services: {
    auth: string;
    user: string;
    course: string;
    assessment: string;
    file: string;
    search: string;
    notification: string;
    analytics: string;
  };
}

export const config: Config = {
  port: Number(process.env.PORT) || 3000,
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
  },
  rateLimit: {
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
    timeWindow: process.env.RATE_LIMIT_TIME_WINDOW || '1 minute',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
  },
  services: {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    user: process.env.USER_SERVICE_URL || 'http://localhost:3002',
    course: process.env.COURSE_SERVICE_URL || 'http://localhost:3003',
    assessment: process.env.ASSESSMENT_SERVICE_URL || 'http://localhost:3004',
    file: process.env.FILE_SERVICE_URL || 'http://localhost:3005',
    search: process.env.SEARCH_SERVICE_URL || 'http://localhost:3006',
    notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3007',
    analytics: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3008',
  },
}; 
