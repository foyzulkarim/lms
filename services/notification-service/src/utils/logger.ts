import pino from 'pino';
import { config } from '@/config/env';

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: config.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname'
    }
  } : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'notification-service',
    version: '2.0.0'
  }
});

// Add notification-specific logging methods
export const notificationLogger = {
  ...logger,
  
  notificationSent: (data: any) => {
    logger.info('Notification sent', { event: 'notification_sent', ...data });
  },
  
  notificationDelivered: (data: any) => {
    logger.info('Notification delivered', { event: 'notification_delivered', ...data });
  },
  
  notificationFailed: (data: any) => {
    logger.error('Notification failed', { event: 'notification_failed', ...data });
  },
  
  templateRendered: (data: any) => {
    logger.debug('Template rendered', { event: 'template_rendered', ...data });
  },
  
  queueProcessed: (data: any) => {
    logger.debug('Queue processed', { event: 'queue_processed', ...data });
  }
};
