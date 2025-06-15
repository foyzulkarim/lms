import Redis from 'ioredis';
import { redisConfig } from '@/config/env';
import { logger } from '@/utils/logger';

// Create Redis client
export const redisClient = new Redis(redisConfig.url, {
  keyPrefix: redisConfig.keyPrefix,
  retryDelayOnFailover: redisConfig.retryDelayOnFailover,
  enableReadyCheck: redisConfig.enableReadyCheck,
  maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
  lazyConnect: redisConfig.lazyConnect
});

// Redis event handlers
redisClient.on('connect', () => {
  logger.info('Redis connected');
});

redisClient.on('ready', () => {
  logger.info('Redis ready');
});

redisClient.on('error', (error) => {
  logger.error('Redis error', error);
});

redisClient.on('close', () => {
  logger.info('Redis connection closed');
});

redisClient.on('reconnecting', () => {
  logger.info('Redis reconnecting');
});

// Redis utility functions
export class RedisUtils {
  static async healthCheck(): Promise<boolean> {
    try {
      const result = await redisClient.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed', error);
      return false;
    }
  }

  static async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      if (ttl) {
        await redisClient.setex(key, ttl, serialized);
      } else {
        await redisClient.set(key, serialized);
      }
    } catch (error) {
      logger.error('Redis set failed', { key, error });
      throw error;
    }
  }

  static async get<T = any>(key: string): Promise<T | null> {
    try {
      const value = await redisClient.get(key);
      if (!value) return null;
      
      try {
        return JSON.parse(value);
      } catch {
        return value as T;
      }
    } catch (error) {
      logger.error('Redis get failed', { key, error });
      throw error;
    }
  }

  static async del(key: string | string[]): Promise<number> {
    try {
      return await redisClient.del(key);
    } catch (error) {
      logger.error('Redis del failed', { key, error });
      throw error;
    }
  }

  static async exists(key: string): Promise<boolean> {
    try {
      const result = await redisClient.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis exists failed', { key, error });
      throw error;
    }
  }

  static async expire(key: string, ttl: number): Promise<boolean> {
    try {
      const result = await redisClient.expire(key, ttl);
      return result === 1;
    } catch (error) {
      logger.error('Redis expire failed', { key, ttl, error });
      throw error;
    }
  }

  static async incr(key: string): Promise<number> {
    try {
      return await redisClient.incr(key);
    } catch (error) {
      logger.error('Redis incr failed', { key, error });
      throw error;
    }
  }

  static async decr(key: string): Promise<number> {
    try {
      return await redisClient.decr(key);
    } catch (error) {
      logger.error('Redis decr failed', { key, error });
      throw error;
    }
  }

  static async keys(pattern: string): Promise<string[]> {
    try {
      return await redisClient.keys(pattern);
    } catch (error) {
      logger.error('Redis keys failed', { pattern, error });
      throw error;
    }
  }

  static async flushAll(): Promise<void> {
    try {
      await redisClient.flushall();
      logger.info('Redis cache cleared');
    } catch (error) {
      logger.error('Redis flush failed', error);
      throw error;
    }
  }

  static async closeConnection(): Promise<void> {
    try {
      await redisClient.quit();
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Failed to close Redis connection', error);
      throw error;
    }
  }

  // Cache with automatic serialization/deserialization
  static async cache<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 3600
  ): Promise<T> {
    try {
      // Try to get from cache first
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // Fetch fresh data
      const data = await fetcher();
      
      // Cache the result
      await this.set(key, data, ttl);
      
      return data;
    } catch (error) {
      logger.error('Redis cache operation failed', { key, error });
      // Fallback to fetcher if cache fails
      return await fetcher();
    }
  }

  // Rate limiting
  static async rateLimit(
    key: string,
    limit: number,
    window: number
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    try {
      const current = await redisClient.incr(key);
      
      if (current === 1) {
        await redisClient.expire(key, window);
      }
      
      const ttl = await redisClient.ttl(key);
      const resetTime = Date.now() + (ttl * 1000);
      
      return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current),
        resetTime
      };
    } catch (error) {
      logger.error('Redis rate limit failed', { key, limit, window, error });
      // Allow request if Redis fails
      return {
        allowed: true,
        remaining: limit,
        resetTime: Date.now() + window * 1000
      };
    }
  }
}

export default redisClient;
