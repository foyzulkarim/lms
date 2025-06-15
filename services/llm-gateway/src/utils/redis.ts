import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

let redis: Redis;

export const initializeRedis = async (): Promise<Redis> => {
  try {
    const redisConfig = config.redis.url 
      ? { url: config.redis.url }
      : {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db,
        };

    redis = new Redis({
      ...redisConfig,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redis.on('connect', () => {
      logger.info('Redis connected');
    });

    redis.on('ready', () => {
      logger.info('Redis ready');
    });

    redis.on('error', (error) => {
      logger.error('Redis error:', error);
    });

    redis.on('close', () => {
      logger.warn('Redis connection closed');
    });

    redis.on('reconnecting', () => {
      logger.info('Redis reconnecting');
    });

    // Test the connection
    await redis.ping();
    logger.info('Redis initialized successfully');

    return redis;
  } catch (error) {
    logger.error('Failed to initialize Redis:', error);
    throw error;
  }
};

export const getRedis = (): Redis => {
  if (!redis) {
    throw new Error('Redis not initialized. Call initializeRedis() first.');
  }
  return redis;
};

export const closeRedis = async (): Promise<void> => {
  if (redis) {
    await redis.quit();
    logger.info('Redis connection closed');
  }
};
