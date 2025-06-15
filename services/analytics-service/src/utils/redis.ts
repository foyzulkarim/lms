import Redis from 'ioredis';
import { getRedisConfig, env } from '@/config/environment';
import { logger } from './logger';
import { CacheError } from '@/types/analytics.types';

class RedisManager {
  private static instance: RedisManager;
  private client: Redis | null = null;
  private isConnected = false;

  private constructor() {}

  public static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  public async connect(): Promise<Redis> {
    if (this.client && this.isConnected) {
      return this.client;
    }

    try {
      const config = getRedisConfig();
      this.client = new Redis(config);

      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info('✅ Redis connected successfully');
      });

      this.client.on('error', (error) => {
        this.isConnected = false;
        logger.error('❌ Redis connection error:', error);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        logger.warn('⚠️ Redis connection closed');
      });

      this.client.on('reconnecting', () => {
        logger.info('🔄 Redis reconnecting...');
      });

      // Test the connection
      await this.client.ping();
      
      return this.client;
    } catch (error) {
      logger.error('❌ Redis connection failed:', error);
      throw new CacheError('Failed to connect to Redis', error);
    }
  }

  public getClient(): Redis {
    if (!this.client || !this.isConnected) {
      throw new CacheError('Redis not connected');
    }
    return this.client;
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.isConnected = false;
        this.client = null;
        logger.info('✅ Redis disconnected successfully');
      } catch (error) {
        logger.error('❌ Error disconnecting from Redis:', error);
        throw new CacheError('Failed to disconnect from Redis', error);
      }
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      if (!this.client || !this.isConnected) {
        return false;
      }
      
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return false;
    }
  }

  // Cache operations
  public async get<T = any>(key: string): Promise<T | null> {
    try {
      if (!this.client) {
        throw new CacheError('Redis not connected');
      }

      const value = await this.client.get(key);
      if (value === null) {
        return null;
      }

      return JSON.parse(value);
    } catch (error) {
      logger.error(`Failed to get cache key ${key}:`, error);
      throw new CacheError(`Failed to get cache key ${key}`, error);
    }
  }

  public async set<T = any>(
    key: string,
    value: T,
    ttlSeconds?: number
  ): Promise<void> {
    try {
      if (!this.client) {
        throw new CacheError('Redis not connected');
      }

      const serializedValue = JSON.stringify(value);
      
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
    } catch (error) {
      logger.error(`Failed to set cache key ${key}:`, error);
      throw new CacheError(`Failed to set cache key ${key}`, error);
    }
  }

  public async del(key: string | string[]): Promise<number> {
    try {
      if (!this.client) {
        throw new CacheError('Redis not connected');
      }

      return await this.client.del(key);
    } catch (error) {
      logger.error(`Failed to delete cache key(s) ${key}:`, error);
      throw new CacheError(`Failed to delete cache key(s) ${key}`, error);
    }
  }

  public async exists(key: string): Promise<boolean> {
    try {
      if (!this.client) {
        throw new CacheError('Redis not connected');
      }

      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Failed to check existence of cache key ${key}:`, error);
      throw new CacheError(`Failed to check existence of cache key ${key}`, error);
    }
  }

  public async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      if (!this.client) {
        throw new CacheError('Redis not connected');
      }

      const result = await this.client.expire(key, ttlSeconds);
      return result === 1;
    } catch (error) {
      logger.error(`Failed to set expiry for cache key ${key}:`, error);
      throw new CacheError(`Failed to set expiry for cache key ${key}`, error);
    }
  }

  public async ttl(key: string): Promise<number> {
    try {
      if (!this.client) {
        throw new CacheError('Redis not connected');
      }

      return await this.client.ttl(key);
    } catch (error) {
      logger.error(`Failed to get TTL for cache key ${key}:`, error);
      throw new CacheError(`Failed to get TTL for cache key ${key}`, error);
    }
  }

  // Hash operations
  public async hget<T = any>(key: string, field: string): Promise<T | null> {
    try {
      if (!this.client) {
        throw new CacheError('Redis not connected');
      }

      const value = await this.client.hget(key, field);
      if (value === null) {
        return null;
      }

      return JSON.parse(value);
    } catch (error) {
      logger.error(`Failed to get hash field ${field} from key ${key}:`, error);
      throw new CacheError(`Failed to get hash field ${field} from key ${key}`, error);
    }
  }

  public async hset<T = any>(
    key: string,
    field: string,
    value: T
  ): Promise<void> {
    try {
      if (!this.client) {
        throw new CacheError('Redis not connected');
      }

      const serializedValue = JSON.stringify(value);
      await this.client.hset(key, field, serializedValue);
    } catch (error) {
      logger.error(`Failed to set hash field ${field} in key ${key}:`, error);
      throw new CacheError(`Failed to set hash field ${field} in key ${key}`, error);
    }
  }

  public async hgetall<T = any>(key: string): Promise<Record<string, T>> {
    try {
      if (!this.client) {
        throw new CacheError('Redis not connected');
      }

      const hash = await this.client.hgetall(key);
      const result: Record<string, T> = {};

      for (const [field, value] of Object.entries(hash)) {
        result[field] = JSON.parse(value);
      }

      return result;
    } catch (error) {
      logger.error(`Failed to get all hash fields from key ${key}:`, error);
      throw new CacheError(`Failed to get all hash fields from key ${key}`, error);
    }
  }

  // List operations
  public async lpush<T = any>(key: string, ...values: T[]): Promise<number> {
    try {
      if (!this.client) {
        throw new CacheError('Redis not connected');
      }

      const serializedValues = values.map(v => JSON.stringify(v));
      return await this.client.lpush(key, ...serializedValues);
    } catch (error) {
      logger.error(`Failed to push to list ${key}:`, error);
      throw new CacheError(`Failed to push to list ${key}`, error);
    }
  }

  public async rpop<T = any>(key: string): Promise<T | null> {
    try {
      if (!this.client) {
        throw new CacheError('Redis not connected');
      }

      const value = await this.client.rpop(key);
      if (value === null) {
        return null;
      }

      return JSON.parse(value);
    } catch (error) {
      logger.error(`Failed to pop from list ${key}:`, error);
      throw new CacheError(`Failed to pop from list ${key}`, error);
    }
  }

  public async lrange<T = any>(
    key: string,
    start: number,
    stop: number
  ): Promise<T[]> {
    try {
      if (!this.client) {
        throw new CacheError('Redis not connected');
      }

      const values = await this.client.lrange(key, start, stop);
      return values.map(v => JSON.parse(v));
    } catch (error) {
      logger.error(`Failed to get range from list ${key}:`, error);
      throw new CacheError(`Failed to get range from list ${key}`, error);
    }
  }

  // Set operations
  public async sadd<T = any>(key: string, ...members: T[]): Promise<number> {
    try {
      if (!this.client) {
        throw new CacheError('Redis not connected');
      }

      const serializedMembers = members.map(m => JSON.stringify(m));
      return await this.client.sadd(key, ...serializedMembers);
    } catch (error) {
      logger.error(`Failed to add to set ${key}:`, error);
      throw new CacheError(`Failed to add to set ${key}`, error);
    }
  }

  public async smembers<T = any>(key: string): Promise<T[]> {
    try {
      if (!this.client) {
        throw new CacheError('Redis not connected');
      }

      const members = await this.client.smembers(key);
      return members.map(m => JSON.parse(m));
    } catch (error) {
      logger.error(`Failed to get members from set ${key}:`, error);
      throw new CacheError(`Failed to get members from set ${key}`, error);
    }
  }

  // Pattern operations
  public async keys(pattern: string): Promise<string[]> {
    try {
      if (!this.client) {
        throw new CacheError('Redis not connected');
      }

      return await this.client.keys(pattern);
    } catch (error) {
      logger.error(`Failed to get keys with pattern ${pattern}:`, error);
      throw new CacheError(`Failed to get keys with pattern ${pattern}`, error);
    }
  }

  public async flushPattern(pattern: string): Promise<number> {
    try {
      if (!this.client) {
        throw new CacheError('Redis not connected');
      }

      const keys = await this.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      return await this.del(keys);
    } catch (error) {
      logger.error(`Failed to flush keys with pattern ${pattern}:`, error);
      throw new CacheError(`Failed to flush keys with pattern ${pattern}`, error);
    }
  }

  // Cache statistics
  public async getStats(): Promise<{
    connected: boolean;
    usedMemory: string;
    totalConnections: number;
    keyspaceHits: number;
    keyspaceMisses: number;
    hitRate: number;
  }> {
    try {
      if (!this.client || !this.isConnected) {
        return {
          connected: false,
          usedMemory: '0',
          totalConnections: 0,
          keyspaceHits: 0,
          keyspaceMisses: 0,
          hitRate: 0,
        };
      }

      const info = await this.client.info('memory,stats');
      const lines = info.split('\r\n');
      const stats: Record<string, string> = {};

      lines.forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      });

      const keyspaceHits = parseInt(stats.keyspace_hits || '0', 10);
      const keyspaceMisses = parseInt(stats.keyspace_misses || '0', 10);
      const totalRequests = keyspaceHits + keyspaceMisses;
      const hitRate = totalRequests > 0 ? (keyspaceHits / totalRequests) * 100 : 0;

      return {
        connected: true,
        usedMemory: stats.used_memory_human || '0',
        totalConnections: parseInt(stats.total_connections_received || '0', 10),
        keyspaceHits,
        keyspaceMisses,
        hitRate: Math.round(hitRate * 100) / 100,
      };
    } catch (error) {
      logger.error('Failed to get Redis stats:', error);
      throw new CacheError('Failed to get Redis stats', error);
    }
  }
}

// Export singleton instance
export const redis = RedisManager.getInstance();

// Helper functions for common cache operations
export const cache = {
  get: <T = any>(key: string): Promise<T | null> => redis.get<T>(key),
  set: <T = any>(key: string, value: T, ttl?: number): Promise<void> => 
    redis.set(key, value, ttl),
  del: (key: string | string[]): Promise<number> => redis.del(key),
  exists: (key: string): Promise<boolean> => redis.exists(key),
  expire: (key: string, ttl: number): Promise<boolean> => redis.expire(key, ttl),
  ttl: (key: string): Promise<number> => redis.ttl(key),
  flush: (pattern: string): Promise<number> => redis.flushPattern(pattern),
};

// Cache key builders
export const cacheKeys = {
  dashboard: (timeframe: string, filters?: string) => 
    `dashboard:${timeframe}${filters ? `:${filters}` : ''}`,
  userAnalytics: (userId: string) => `user:analytics:${userId}`,
  courseAnalytics: (courseId: string) => `course:analytics:${courseId}`,
  assessmentAnalytics: (assessmentId: string) => `assessment:analytics:${assessmentId}`,
  learningProgress: (userId: string, courseId?: string) => 
    `progress:${userId}${courseId ? `:${courseId}` : ''}`,
  metrics: (type: string, timeframe: string) => `metrics:${type}:${timeframe}`,
  report: (reportId: string, jobId: string) => `report:${reportId}:${jobId}`,
  aggregation: (type: string, date: string) => `aggregation:${type}:${date}`,
};

// Cache health check utility
export const checkCacheHealth = async (): Promise<{
  status: 'healthy' | 'unhealthy';
  details: {
    connected: boolean;
    responseTime?: number;
    stats?: any;
    error?: string;
  };
}> => {
  const startTime = Date.now();
  
  try {
    const isHealthy = await redis.healthCheck();
    const responseTime = Date.now() - startTime;
    
    if (isHealthy) {
      const stats = await redis.getStats();
      return {
        status: 'healthy',
        details: {
          connected: true,
          responseTime,
          stats,
        },
      };
    } else {
      return {
        status: 'unhealthy',
        details: {
          connected: false,
          responseTime,
        },
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
};

export default redis;
