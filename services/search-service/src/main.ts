import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';

async function start() {
  // Create Fastify instance with TypeBox type provider
  const fastify = Fastify({
    logger: false, // We use our custom logger
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  }).withTypeProvider<TypeBoxTypeProvider>();

  try {
    // Register the main application
    await fastify.register(createApp);

    // Start the server
    const address = await fastify.listen({
      port: config.port,
      host: config.host,
    });

    logger.info('Search service started successfully', {
      address,
      port: config.port,
      host: config.host,
      environment: config.nodeEnv,
      version: '1.0.0',
      features: {
        analytics: config.features.analytics,
        suggestions: config.features.suggestions,
        personalization: config.features.personalization,
        spellCheck: config.features.spellCheck,
        facetedSearch: config.features.facetedSearch,
      },
      elasticsearch: {
        url: config.elasticsearch.url,
        indexPrefix: config.elasticsearch.indexPrefix,
      },
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: config.redis.keyPrefix,
      },
    });

    // Log service readiness
    logger.info('🔍 Search Service is ready to handle requests', {
      docs: `${address}/docs`,
      health: `${address}/api/v1/health`,
      search: `${address}/api/v1/search`,
      suggestions: `${address}/api/v1/suggestions`,
    });

  } catch (error) {
    logger.error('Failed to start search service:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the service
start().catch((error) => {
  logger.error('Failed to start service:', error);
  process.exit(1);
});
