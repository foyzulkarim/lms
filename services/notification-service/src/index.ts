import { config } from '@/config/env';
import { logger } from '@/utils/logger';
import { createApp, startServices } from '@/app';

async function bootstrap() {
  try {
    logger.info('🚀 Starting Notification Service v2.0.0...');
    logger.info('Configuration loaded', {
      nodeEnv: config.NODE_ENV,
      port: config.PORT,
      logLevel: config.LOG_LEVEL,
      emailDispatcherUrl: config.EMAIL_DISPATCHER_URL,
      enableEmailNotifications: config.ENABLE_EMAIL_NOTIFICATIONS,
      enablePushNotifications: config.ENABLE_PUSH_NOTIFICATIONS,
      enableBulkMessaging: config.ENABLE_BULK_MESSAGING,
      enableScheduledNotifications: config.ENABLE_SCHEDULED_NOTIFICATIONS
    });

    // Start all services
    await startServices();

    // Create and start the Fastify app
    const app = await createApp();
    
    // Start the server
    await app.listen({
      port: config.PORT,
      host: config.HOST
    });

    logger.info(`🎉 Notification Service started successfully!`, {
      port: config.PORT,
      host: config.HOST,
      environment: config.NODE_ENV,
      pid: process.pid,
      endpoints: {
        health: `http://${config.HOST}:${config.PORT}/health`,
        docs: config.ENABLE_SWAGGER ? `http://${config.HOST}:${config.PORT}/docs` : null,
        api: `http://${config.HOST}:${config.PORT}/api/v1`,
        metrics: config.ENABLE_PROMETHEUS ? `http://${config.HOST}:${config.PORT}/metrics` : null
      }
    });

    // Log service capabilities
    logger.info('📧 Service Capabilities:', {
      channels: [
        config.ENABLE_EMAIL_NOTIFICATIONS ? 'Email (via EMAIL-Dispatcher)' : null,
        config.ENABLE_PUSH_NOTIFICATIONS ? 'Web Push' : null
      ].filter(Boolean),
      features: [
        'Template Management',
        'User Preferences',
        'Delivery Tracking',
        'Analytics & Reporting',
        config.ENABLE_BULK_MESSAGING ? 'Bulk Messaging' : null,
        config.ENABLE_SCHEDULED_NOTIFICATIONS ? 'Scheduled Notifications' : null
      ].filter(Boolean),
      integrations: [
        'EMAIL-Dispatcher Service',
        'Web Push API',
        'Kafka Event Bus',
        'Redis Queue System',
        'PostgreSQL Database'
      ]
    });

  } catch (error) {
    logger.fatal('❌ Failed to start Notification Service', error);
    process.exit(1);
  }
}

// Handle process events
process.on('uncaughtException', (error) => {
  logger.fatal('Uncaught Exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

// Start the service
bootstrap().catch((error) => {
  logger.fatal('Bootstrap failed', error);
  process.exit(1);
});

export { createApp } from '@/app';
