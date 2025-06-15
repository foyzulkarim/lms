import 'dotenv/config';
import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { createApp } from './app';
import { logger } from './utils/logger';
import { config } from './config';

async function start() {
  const fastify = Fastify({
    logger: false, // We use our custom logger
    trustProxy: true,
    keepAliveTimeout: config.server.keepAliveTimeout,
    bodyLimit: config.server.bodyLimit,
  }).withTypeProvider<TypeBoxTypeProvider>();

  try {
    // Register the application
    await fastify.register(createApp);

    // Start the server
    await fastify.listen({
      port: config.server.port,
      host: config.server.host,
    });

    logger.info(`LLM Gateway started on ${config.server.host}:${config.server.port}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    logger.info(`Ollama URL: ${config.ollama.baseUrl}`);
    logger.info(`Swagger UI available at: http://${config.server.host}:${config.server.port}/docs`);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

start();
