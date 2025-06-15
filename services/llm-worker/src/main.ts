import 'dotenv/config';
import { WorkerManager } from './worker-manager';
import { logger } from './utils/logger';
import { config } from './config';
import { HealthServer } from './health-server';

async function start() {
  logger.info('Starting LLM Worker Service', {
    workerId: config.worker.id,
    environment: config.nodeEnv,
    concurrency: config.worker.concurrency,
  });

  try {
    // Initialize health server
    const healthServer = new HealthServer();
    await healthServer.start();

    // Initialize worker manager
    const workerManager = new WorkerManager();
    await workerManager.initialize();
    await workerManager.start();

    logger.info('LLM Worker Service started successfully', {
      workerId: config.worker.id,
      healthPort: config.health.port,
      ollamaUrl: config.ollama.baseUrl,
    });

    // Handle graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        await workerManager.stop();
        await healthServer.stop();
        logger.info('LLM Worker Service stopped gracefully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // Handle unhandled errors
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start LLM Worker Service:', error);
    process.exit(1);
  }
}

start();
