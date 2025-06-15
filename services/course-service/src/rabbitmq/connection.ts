import amqp, { Connection, Channel } from 'amqplib';
import { config } from '../config';
import { logger } from '../utils/logger';

// RabbitMQ connection and channel instances
let connection: Connection | null = null;
let channel: Channel | null = null;

// Exchange and queue names
export const EXCHANGES = {
  COURSE_EVENTS: 'course.events',
  USER_EVENTS: 'user.events',
  FILE_EVENTS: 'file.events',
  ANALYTICS_EVENTS: 'analytics.events',
} as const;

export const QUEUES = {
  COURSE_SERVICE: 'course-service',
  COURSE_ANALYTICS: 'course-analytics',
  COURSE_SEARCH_INDEX: 'course-search-index',
  COURSE_NOTIFICATIONS: 'course-notifications',
} as const;

export const ROUTING_KEYS = {
  // Course events
  COURSE_CREATED: 'course.created',
  COURSE_UPDATED: 'course.updated',
  COURSE_PUBLISHED: 'course.published',
  COURSE_UNPUBLISHED: 'course.unpublished',
  COURSE_DELETED: 'course.deleted',
  
  // Module events
  MODULE_CREATED: 'module.created',
  MODULE_UPDATED: 'module.updated',
  MODULE_DELETED: 'module.deleted',
  
  // Lesson events
  LESSON_CREATED: 'lesson.created',
  LESSON_UPDATED: 'lesson.updated',
  LESSON_DELETED: 'lesson.deleted',
  LESSON_COMPLETED: 'lesson.completed',
  
  // Progress events
  PROGRESS_UPDATED: 'progress.updated',
  COURSE_COMPLETED: 'course.completed',
  
  // User events (consumed)
  USER_ENROLLED: 'user.enrolled',
  USER_UNENROLLED: 'user.unenrolled',
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  
  // File events (consumed)
  FILE_UPLOADED: 'file.uploaded',
  FILE_DELETED: 'file.deleted',
  FILE_PROCESSED: 'file.processed',
} as const;

// Initialize RabbitMQ connection
export const initializeRabbitMQ = async (): Promise<{ connection: Connection; channel: Channel }> => {
  try {
    if (connection && channel) {
      return { connection, channel };
    }

    logger.info('Initializing RabbitMQ connection...');

    // Create connection
    connection = await amqp.connect(config.rabbitmq.url, {
      heartbeat: 60,
    });

    // Handle connection events
    connection.on('error', (error) => {
      logger.error('RabbitMQ connection error:', error);
    });

    connection.on('close', () => {
      logger.warn('RabbitMQ connection closed');
      connection = null;
      channel = null;
    });

    // Create channel
    channel = await connection.createChannel();

    // Handle channel events
    channel.on('error', (error) => {
      logger.error('RabbitMQ channel error:', error);
    });

    channel.on('close', () => {
      logger.warn('RabbitMQ channel closed');
      channel = null;
    });

    // Set prefetch count for better load distribution
    await channel.prefetch(10);

    // Declare exchanges
    await channel.assertExchange(EXCHANGES.COURSE_EVENTS, 'topic', { durable: true });
    await channel.assertExchange(EXCHANGES.USER_EVENTS, 'topic', { durable: true });
    await channel.assertExchange(EXCHANGES.FILE_EVENTS, 'topic', { durable: true });
    await channel.assertExchange(EXCHANGES.ANALYTICS_EVENTS, 'topic', { durable: true });

    // Declare queues
    await channel.assertQueue(QUEUES.COURSE_SERVICE, { durable: true });
    await channel.assertQueue(QUEUES.COURSE_ANALYTICS, { durable: true });
    await channel.assertQueue(QUEUES.COURSE_SEARCH_INDEX, { durable: true });
    await channel.assertQueue(QUEUES.COURSE_NOTIFICATIONS, { durable: true });

    // Bind queues to exchanges
    // User events that course service needs to handle
    await channel.bindQueue(QUEUES.COURSE_SERVICE, EXCHANGES.USER_EVENTS, ROUTING_KEYS.USER_ENROLLED);
    await channel.bindQueue(QUEUES.COURSE_SERVICE, EXCHANGES.USER_EVENTS, ROUTING_KEYS.USER_UNENROLLED);
    await channel.bindQueue(QUEUES.COURSE_SERVICE, EXCHANGES.USER_EVENTS, ROUTING_KEYS.USER_DELETED);

    // File events that course service needs to handle
    await channel.bindQueue(QUEUES.COURSE_SERVICE, EXCHANGES.FILE_EVENTS, ROUTING_KEYS.FILE_UPLOADED);
    await channel.bindQueue(QUEUES.COURSE_SERVICE, EXCHANGES.FILE_EVENTS, ROUTING_KEYS.FILE_DELETED);

    logger.info('RabbitMQ connection established successfully');
    return { connection, channel };
  } catch (error) {
    logger.error('Failed to initialize RabbitMQ connection:', error);
    throw error;
  }
};

// Get RabbitMQ channel
export const getRabbitMQChannel = (): Channel => {
  if (!channel) {
    throw new Error('RabbitMQ not initialized. Call initializeRabbitMQ() first.');
  }
  return channel;
};

// Close RabbitMQ connection
export const closeRabbitMQ = async (): Promise<void> => {
  try {
    if (channel) {
      logger.info('Closing RabbitMQ channel...');
      await channel.close();
      channel = null;
    }

    if (connection) {
      logger.info('Closing RabbitMQ connection...');
      await connection.close();
      connection = null;
    }

    logger.info('RabbitMQ connection closed');
  } catch (error) {
    logger.error('Error closing RabbitMQ connection:', error);
  }
};

// Health check
export const checkRabbitMQHealth = async (): Promise<boolean> => {
  try {
    if (!connection || !channel) {
      return false;
    }

    // Try to check queue
    await channel.checkQueue(QUEUES.COURSE_SERVICE);
    return true;
  } catch (error) {
    logger.error('RabbitMQ health check failed:', error);
    return false;
  }
};
