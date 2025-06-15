import { FastifyInstance } from 'fastify';
import { config } from '../config';
import { registerAuthRoutes } from './auth';
import { registerUserRoutes } from './user';
import { registerCourseRoutes } from './course';
import { registerAssessmentRoutes } from './assessment';
import { registerFileRoutes } from './file';
import { registerSearchRoutes } from './search';
import { registerNotificationRoutes } from './notification';
import { registerAnalyticsRoutes } from './analytics';

export const registerRoutes = (server: FastifyInstance) => {
  // Health check route
  server.get('/health', async () => {
    return { status: 'ok' };
  });

  // Register service routes
  registerAuthRoutes(server);
  registerUserRoutes(server);
  registerCourseRoutes(server);
  registerAssessmentRoutes(server);
  registerFileRoutes(server);
  registerSearchRoutes(server);
  registerNotificationRoutes(server);
  registerAnalyticsRoutes(server);
}; 
