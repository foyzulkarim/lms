import { createClient, RedisClientType } from 'redis';
import { LRUCache } from 'lru-cache';
import { SearchResponse, SearchSuggestion, PopularSearch } from '../types/search.types';
import { config } from '../config';
import { logger, logError } from './logger';

// Redis client instance
let redisClient: RedisClientType | null = null;

// In-memory LRU cache for frequently accessed data
const memoryCache = new LRUCache<string, any>({
  max: config.cache.memoryCacheSize,
  ttl: 1000 * 60 * 5, // 5 minutes default TTL
});

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
      logError('Redis client error', error);
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
    logError('Failed to initialize Redis connection', error as Error);
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
    logError('Redis health check failed', error as Error);
    return false;
  }
};

// Cache manager class
export class CacheManager {
  private redis: RedisClientType;
  private keyPrefix: string;

  constructor(redis: RedisClientType) {
    this.redis = redis;
    this.keyPrefix = config.redis.keyPrefix;
  }

  // Generate cache key
  private getCacheKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  // Get from cache (L1: Memory, L2: Redis)
  async get<T>(key: string): Promise<T | null> {
    try {
      // Check L1 cache (memory)
      const memoryResult = memoryCache.get(key);
      if (memoryResult !== undefined) {
        logger.debug('Cache hit (memory)', { key });
        return memoryResult;
      }

      // Check L2 cache (Redis)
      const redisKey = this.getCacheKey(key);
      const redisResult = await this.redis.get(redisKey);
      
      if (redisResult) {
        const parsed = JSON.parse(redisResult);
        // Store in L1 cache for faster access
        memoryCache.set(key, parsed);
        logger.debug('Cache hit (redis)', { key });
        return parsed;
      }

      logger.debug('Cache miss', { key });
      return null;
    } catch (error) {
      logError(`Cache get error for key ${key}`, error as Error);
      return null;
    }
  }

  // Set in cache (both L1 and L2)
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      const redisKey = this.getCacheKey(key);

      // Set in L1 cache (memory)
      memoryCache.set(key, value, { ttl: (ttlSeconds || 300) * 1000 });

      // Set in L2 cache (Redis)
      if (ttlSeconds) {
        await this.redis.setEx(redisKey, ttlSeconds, serialized);
      } else {
        await this.redis.set(redisKey, serialized);
      }

      logger.debug('Cache set', { key, ttl: ttlSeconds });
      return true;
    } catch (error) {
      logError(`Cache set error for key ${key}`, error as Error);
      return false;
    }
  }

  // Delete from cache
  async delete(key: string): Promise<boolean> {
    try {
      // Delete from L1 cache
      memoryCache.delete(key);

      // Delete from L2 cache
      const redisKey = this.getCacheKey(key);
      const result = await this.redis.del(redisKey);
      
      logger.debug('Cache delete', { key });
      return result > 0;
    } catch (error) {
      logError(`Cache delete error for key ${key}`, error as Error);
      return false;
    }
  }

  // Delete multiple keys by pattern
  async deletePattern(pattern: string): Promise<number> {
    try {
      const redisPattern = this.getCacheKey(pattern);
      const keys = await this.redis.keys(redisPattern);
      
      if (keys.length === 0) {
        return 0;
      }

      // Delete from Redis
      const deletedCount = await this.redis.del(keys);

      // Clear memory cache (simple approach - clear all)
      memoryCache.clear();

      logger.debug('Cache delete pattern', { pattern, count: deletedCount });
      return deletedCount;
    } catch (error) {
      logError(`Cache delete pattern error for pattern ${pattern}`, error as Error);
      return 0;
    }
  }

  // Check if key exists
  async exists(key: string): Promise<boolean> {
    try {
      // Check L1 cache first
      if (memoryCache.has(key)) {
        return true;
      }

      // Check L2 cache
      const redisKey = this.getCacheKey(key);
      const result = await this.redis.exists(redisKey);
      return result === 1;
    } catch (error) {
      logError(`Cache exists error for key ${key}`, error as Error);
      return false;
    }
  }

  // Get TTL for key
  async ttl(key: string): Promise<number> {
    try {
      const redisKey = this.getCacheKey(key);
      return await this.redis.ttl(redisKey);
    } catch (error) {
      logError(`Cache TTL error for key ${key}`, error as Error);
      return -1;
    }
  }

  // Increment counter
  async increment(key: string, by: number = 1): Promise<number> {
    try {
      const redisKey = this.getCacheKey(key);
      return await this.redis.incrBy(redisKey, by);
    } catch (error) {
      logError(`Cache increment error for key ${key}`, error as Error);
      return 0;
    }
  }

  // Increment with TTL
  async incrementWithTtl(key: string, by: number = 1, ttlSeconds: number = 3600): Promise<number> {
    try {
      const redisKey = this.getCacheKey(key);
      const value = await this.redis.incrBy(redisKey, by);
      
      if (value === by) {
        // First time setting the key, set TTL
        await this.redis.expire(redisKey, ttlSeconds);
      }
      
      return value;
    } catch (error) {
      logError(`Cache increment with TTL error for key ${key}`, error as Error);
      return 0;
    }
  }

  // Add to set
  async addToSet(key: string, ...members: string[]): Promise<number> {
    try {
      const redisKey = this.getCacheKey(key);
      return await this.redis.sAdd(redisKey, members);
    } catch (error) {
      logError(`Cache set add error for key ${key}`, error as Error);
      return 0;
    }
  }

  // Check if member exists in set
  async isSetMember(key: string, member: string): Promise<boolean> {
    try {
      const redisKey = this.getCacheKey(key);
      return await this.redis.sIsMember(redisKey, member);
    } catch (error) {
      logError(`Cache set member check error for key ${key}`, error as Error);
      return false;
    }
  }

  // Get all members of set
  async getSetMembers(key: string): Promise<string[]> {
    try {
      const redisKey = this.getCacheKey(key);
      return await this.redis.sMembers(redisKey);
    } catch (error) {
      logError(`Cache set members error for key ${key}`, error as Error);
      return [];
    }
  }

  // Remove from set
  async removeFromSet(key: string, ...members: string[]): Promise<number> {
    try {
      const redisKey = this.getCacheKey(key);
      return await this.redis.sRem(redisKey, members);
    } catch (error) {
      logError(`Cache set remove error for key ${key}`, error as Error);
      return 0;
    }
  }

  // Add to sorted set
  async addToSortedSet(key: string, score: number, member: string): Promise<number> {
    try {
      const redisKey = this.getCacheKey(key);
      return await this.redis.zAdd(redisKey, { score, value: member });
    } catch (error) {
      logError(`Cache sorted set add error for key ${key}`, error as Error);
      return 0;
    }
  }

  // Get sorted set range
  async getSortedSetRange(key: string, start: number = 0, stop: number = -1, reverse: boolean = false): Promise<string[]> {
    try {
      const redisKey = this.getCacheKey(key);
      
      if (reverse) {
        return await this.redis.zRevRange(redisKey, start, stop);
      } else {
        return await this.redis.zRange(redisKey, start, stop);
      }
    } catch (error) {
      logError(`Cache sorted set range error for key ${key}`, error as Error);
      return [];
    }
  }

  // Get sorted set range with scores
  async getSortedSetRangeWithScores(key: string, start: number = 0, stop: number = -1, reverse: boolean = false): Promise<Array<{ value: string; score: number }>> {
    try {
      const redisKey = this.getCacheKey(key);
      
      if (reverse) {
        return await this.redis.zRevRangeWithScores(redisKey, start, stop);
      } else {
        return await this.redis.zRangeWithScores(redisKey, start, stop);
      }
    } catch (error) {
      logError(`Cache sorted set range with scores error for key ${key}`, error as Error);
      return [];
    }
  }

  // Clear all caches
  async clear(): Promise<void> {
    try {
      // Clear memory cache
      memoryCache.clear();

      // Clear Redis cache (by pattern)
      const pattern = this.getCacheKey('*');
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(keys);
      }

      logger.info('All caches cleared');
    } catch (error) {
      logError('Cache clear error', error as Error);
    }
  }

  // Get cache statistics
  async getStats(): Promise<any> {
    try {
      const memoryStats = {
        size: memoryCache.size,
        max: memoryCache.max,
        calculatedSize: memoryCache.calculatedSize,
      };

      const redisInfo = await this.redis.info('memory');
      
      return {
        memory: memoryStats,
        redis: {
          info: redisInfo,
        },
      };
    } catch (error) {
      logError('Cache stats error', error as Error);
      return null;
    }
  }
}

// Specialized cache services
export class SearchCacheService extends CacheManager {
  // Cache search results
  async cacheSearchResults(query: string, filters: any, results: SearchResponse): Promise<void> {
    const key = this.generateSearchKey(query, filters);
    await this.set(key, results, config.cache.searchResults);
  }

  // Get cached search results
  async getCachedSearchResults(query: string, filters: any): Promise<SearchResponse | null> {
    const key = this.generateSearchKey(query, filters);
    return await this.get<SearchResponse>(key);
  }

  // Cache suggestions
  async cacheSuggestions(partial: string, suggestions: SearchSuggestion[]): Promise<void> {
    const key = `suggestions:${partial.toLowerCase()}`;
    await this.set(key, suggestions, config.cache.suggestions);
  }

  // Get cached suggestions
  async getCachedSuggestions(partial: string): Promise<SearchSuggestion[] | null> {
    const key = `suggestions:${partial.toLowerCase()}`;
    return await this.get<SearchSuggestion[]>(key);
  }

  // Cache popular searches
  async cachePopularSearches(searches: PopularSearch[]): Promise<void> {
    const key = 'popular_searches';
    await this.set(key, searches, config.cache.popularSearches);
  }

  // Get cached popular searches
  async getCachedPopularSearches(): Promise<PopularSearch[] | null> {
    const key = 'popular_searches';
    return await this.get<PopularSearch[]>(key);
  }

  // Track search query
  async trackSearchQuery(query: string): Promise<void> {
    const key = `query_count:${query.toLowerCase()}`;
    await this.incrementWithTtl(key, 1, 86400); // 24 hours
  }

  // Get search query count
  async getSearchQueryCount(query: string): Promise<number> {
    const key = `query_count:${query.toLowerCase()}`;
    const redisKey = this.getCacheKey(key);
    
    try {
      const count = await this.redis.get(redisKey);
      return count ? parseInt(count, 10) : 0;
    } catch (error) {
      return 0;
    }
  }

  // Generate search cache key
  private generateSearchKey(query: string, filters: any): string {
    const filterString = JSON.stringify(filters || {});
    const hash = this.simpleHash(query + filterString);
    return `search:${hash}`;
  }

  // Simple hash function for cache keys
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

// Export cache service instance
export const getCacheManager = (): CacheManager => {
  const client = getRedisClient();
  return new CacheManager(client);
};

export const getSearchCacheService = (): SearchCacheService => {
  const client = getRedisClient();
  return new SearchCacheService(client);
};

export default {
  initializeRedis,
  getRedisClient,
  closeRedis,
  checkRedisHealth,
  CacheManager,
  SearchCacheService,
  getCacheManager,
  getSearchCacheService,
};
