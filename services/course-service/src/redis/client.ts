import { createClient, RedisClientType } from 'redis';
import { config } from '../config';
import { logger } from '../utils/logger';

// Redis client instance
let redisClient: RedisClientType | null = null;

// Initialize Redis connection
export const initializeRedis = async (): Promise<RedisClientType> => {
  try {
    if (redisClient) {
      return redisClient;
    }

    logger.info('Initializing Redis connection...');

    redisClient = createClient({
      url: config.redis.url,
      socket: {
        host: config.redis.host,
        port: config.redis.port,
        reconnectStrategy: (retries) => Math.min(retries * 50, 500),
      },
      password: config.redis.password,
      database: config.redis.db,
    });

    // Error handling
    redisClient.on('error', (error) => {
      logger.error('Redis client error:', error);
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('end', () => {
      logger.info('Redis client connection ended');
    });

    // Connect to Redis
    await redisClient.connect();

    logger.info('Redis connection established successfully');
    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Redis connection:', error);
    throw error;
  }
};

// Get Redis client instance
export const getRedisClient = (): RedisClientType => {
  if (!redisClient) {
    throw new Error('Redis not initialized. Call initializeRedis() first.');
  }
  return redisClient;
};

// Close Redis connection
export const closeRedis = async (): Promise<void> => {
  if (redisClient) {
    logger.info('Closing Redis connection...');
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
};

// Health check
export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    if (!redisClient) {
      return false;
    }
    
    await redisClient.ping();
    return true;
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
};

// Cache service class
export class CacheService {
  private client: RedisClientType;

  constructor(client: RedisClientType) {
    this.client = client;
  }

  // Get value from cache
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  // Set value in cache with TTL
  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  // Delete key from cache
  async del(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  // Delete multiple keys
  async delPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }
      return await this.client.del(keys);
    } catch (error) {
      logger.error(`Cache delete pattern error for pattern ${pattern}:`, error);
      return 0;
    }
  }

  // Check if key exists
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  // Set TTL for existing key
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, ttlSeconds);
      return result;
    } catch (error) {
      logger.error(`Cache expire error for key ${key}:`, error);
      return false;
    }
  }

  // Get TTL for key
  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error(`Cache TTL error for key ${key}:`, error);
      return -1;
    }
  }

  // Increment counter
  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error(`Cache increment error for key ${key}:`, error);
      return 0;
    }
  }

  // Increment counter with TTL
  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    try {
      const value = await this.client.incr(key);
      if (value === 1) {
        // First time setting the key, set TTL
        await this.client.expire(key, ttlSeconds);
      }
      return value;
    } catch (error) {
      logger.error(`Cache increment with TTL error for key ${key}:`, error);
      return 0;
    }
  }

  // Add to set
  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.sAdd(key, members);
    } catch (error) {
      logger.error(`Cache set add error for key ${key}:`, error);
      return 0;
    }
  }

  // Check if member exists in set
  async sismember(key: string, member: string): Promise<boolean> {
    try {
      return await this.client.sIsMember(key, member);
    } catch (error) {
      logger.error(`Cache set member check error for key ${key}:`, error);
      return false;
    }
  }

  // Get all members of set
  async smembers(key: string): Promise<string[]> {
    try {
      return await this.client.sMembers(key);
    } catch (error) {
      logger.error(`Cache set members error for key ${key}:`, error);
      return [];
    }
  }

  // Remove from set
  async srem(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.sRem(key, members);
    } catch (error) {
      logger.error(`Cache set remove error for key ${key}:`, error);
      return 0;
    }
  }
}

// Export cache service instance
export const getCacheService = (): CacheService => {
  const client = getRedisClient();
  return new CacheService(client);
};
