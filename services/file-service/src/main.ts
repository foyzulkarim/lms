import { createApp, setupGracefulShutdown } from './app';
import { initializeDatabase } from '@/database/connection';
import { getServerConfig } from '@/config/env';
import { logger } from '@/utils/logger';

async function startServer() {
  try {
    // Load configuration
    const config = getServerConfig();
    
    logger.info('Starting LMS File Service...', {
      nodeEnv: config.nodeEnv,
      port: config.port,
      logLevel: config.logLevel
    });

    // Initialize database
    logger.info('Initializing database connection...');
    await initializeDatabase();
    logger.info('Database connection established');

    // Create and configure app
    logger.info('Creating application instance...');
    const app = await createApp();

    // Setup graceful shutdown
    await setupGracefulShutdown(app);

    // Start server
    logger.info('Starting HTTP server...');
    await app.listen({
      port: config.port,
      host: config.host
    });

    logger.info(`🚀 File Service is running!`, {
      port: config.port,
      host: config.host,
      environment: config.nodeEnv,
      docs: `http://${config.host}:${config.port}/docs`,
      health: `http://${config.host}:${config.port}/health`
    });

    // Log service capabilities
    logger.info('Service capabilities:', {
      features: [
        'File upload/download',
        'Image processing and optimization',
        'Video transcoding and HLS generation',
        'S3-compatible storage (MinIO)',
        'Chunked uploads for large files',
        'File versioning and metadata management',
        'Role-based access control',
        'Processing queue with retry logic',
        'Comprehensive audit logging',
        'Health monitoring and metrics'
      ],
      storage: 'MinIO (S3-compatible)',
      processing: 'Sharp (images) + FFmpeg (videos)',
      authentication: 'JWT-based',
      documentation: '/docs'
    });

  } catch (error) {
    logger.error('Failed to start server', {
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    process.exit(1);
  }
}

// Handle startup errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception during startup', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection during startup', {
    reason,
    promise
  });
  process.exit(1);
});

// Start the server
startServer();
