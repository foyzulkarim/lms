import amqp, { Connection, Channel } from 'amqplib';
import { logger } from '../utils/logger';
import { config } from '../config';

let connection: Connection | null = null;
let channel: Channel | null = null;

export const initializeRabbitMQ = async (): Promise<void> => {
  try {
    connection = await amqp.connect(config.rabbitmq.url);
    channel = await connection.createChannel();

    // Declare exchanges
    await channel.assertExchange('auth.events', 'topic', { durable: true });
    await channel.assertExchange('user.events', 'topic', { durable: true });

    // Handle connection events
    connection.on('error', (err) => {
      logger.error('RabbitMQ connection error:', err);
    });

    connection.on('close', () => {
      logger.warn('RabbitMQ connection closed');
    });

    logger.info('RabbitMQ initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize RabbitMQ:', error);
    throw error;
  }
};

export const getChannel = (): Channel => {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }
  return channel;
};

export const closeRabbitMQ = async (): Promise<void> => {
  try {
    if (channel) {
      await channel.close();
    }
    if (connection) {
      await connection.close();
    }
    logger.info('RabbitMQ connection closed');
  } catch (error) {
    logger.error('Error closing RabbitMQ connection:', error);
  }
}; 
