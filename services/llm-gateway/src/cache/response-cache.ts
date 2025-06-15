import { Redis } from 'ioredis';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';
import { ChatCompletionRequest, ChatCompletionResponse, EmbeddingsRequest, EmbeddingsResponse } from '../types/llm';

export class ResponseCache {
  private redis: Redis;
  private ttl: number;
  private enabled: boolean;

  constructor(redis: Redis) {
    this.redis = redis;
    this.ttl = config.cache.ttl;
    this.enabled = config.cache.responseCacheEnabled;
  }

  private generateCacheKey(request: ChatCompletionRequest | EmbeddingsRequest, userId: string): string {
    // Create a deterministic hash of the request
    const requestString = JSON.stringify({
      model: request.model,
      ...('messages' in request ? { messages: request.messages } : { input: request.input }),
      ...('temperature' in request && request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...('max_tokens' in request && request.max_tokens !== undefined ? { max_tokens: request.max_tokens } : {}),
      ...('top_p' in request && request.top_p !== undefined ? { top_p: request.top_p } : {}),
    });

    const hash = crypto.createHash('sha256').update(requestString).digest('hex');
    const type = 'messages' in request ? 'chat' : 'embeddings';
    
    return `llm_cache:${type}:${userId}:${hash}`;
  }

  async getCachedResponse(
    request: ChatCompletionRequest | EmbeddingsRequest,
    userId: string
  ): Promise<ChatCompletionResponse | EmbeddingsResponse | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const cacheKey = this.generateCacheKey(request, userId);
      const cachedData = await this.redis.get(cacheKey);

      if (!cachedData) {
        return null;
      }

      const parsed = JSON.parse(cachedData);
      
      // Update access count and last accessed time
      await this.redis.hincrby(`${cacheKey}:meta`, 'accessCount', 1);
      await this.redis.hset(`${cacheKey}:meta`, 'lastAccessed', Date.now());

      logger.debug('Cache hit', {
        cacheKey,
        userId,
        model: request.model,
      });

      return parsed.response;
    } catch (error) {
      logger.error('Error retrieving from cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        model: request.model,
      });
      return null;
    }
  }

  async setCachedResponse(
    request: ChatCompletionRequest | EmbeddingsRequest,
    response: ChatCompletionResponse | EmbeddingsResponse,
    userId: string
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const cacheKey = this.generateCacheKey(request, userId);
      const cacheData = {
        response,
        createdAt: Date.now(),
        model: request.model,
        userId,
      };

      // Store the response with TTL
      await this.redis.setex(cacheKey, this.ttl, JSON.stringify(cacheData));

      // Store metadata
      await this.redis.hmset(`${cacheKey}:meta`, {
        createdAt: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now(),
        model: request.model,
        userId,
        ttl: this.ttl,
      });

      // Set TTL for metadata
      await this.redis.expire(`${cacheKey}:meta`, this.ttl);

      logger.debug('Response cached', {
        cacheKey,
        userId,
        model: request.model,
        ttl: this.ttl,
      });
    } catch (error) {
      logger.error('Error storing in cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        model: request.model,
      });
    }
  }

  async invalidateUserCache(userId: string): Promise<number> {
    try {
      const pattern = `llm_cache:*:${userId}:*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length === 0) {
        return 0;
      }

      // Also get metadata keys
      const metaKeys = keys.map(key => `${key}:meta`);
      const allKeys = [...keys, ...metaKeys];

      await this.redis.del(...allKeys);
      
      logger.info('User cache invalidated', {
        userId,
        keysDeleted: allKeys.length,
      });

      return allKeys.length;
    } catch (error) {
      logger.error('Error invalidating user cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return 0;
    }
  }

  async invalidateModelCache(model: string): Promise<number> {
    try {
      // Get all cache keys
      const pattern = 'llm_cache:*';
      const keys = await this.redis.keys(pattern);
      
      if (keys.length === 0) {
        return 0;
      }

      // Filter keys by model using metadata
      const modelKeys: string[] = [];
      const metaKeys = keys.filter(key => key.endsWith(':meta'));
      
      for (const metaKey of metaKeys) {
        const metadata = await this.redis.hgetall(metaKey);
        if (metadata.model === model) {
          const cacheKey = metaKey.replace(':meta', '');
          modelKeys.push(cacheKey, metaKey);
        }
      }

      if (modelKeys.length > 0) {
        await this.redis.del(...modelKeys);
      }

      logger.info('Model cache invalidated', {
        model,
        keysDeleted: modelKeys.length,
      });

      return modelKeys.length;
    } catch (error) {
      logger.error('Error invalidating model cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        model,
      });
      return 0;
    }
  }

  async getCacheStats(): Promise<{
    totalEntries: number;
    totalSize: number;
    hitRate: number;
    topModels: Array<{ model: string; entries: number }>;
    topUsers: Array<{ userId: string; entries: number }>;
  }> {
    try {
      const pattern = 'llm_cache:*:meta';
      const metaKeys = await this.redis.keys(pattern);
      
      if (metaKeys.length === 0) {
        return {
          totalEntries: 0,
          totalSize: 0,
          hitRate: 0,
          topModels: [],
          topUsers: [],
        };
      }

      const modelCounts = new Map<string, number>();
      const userCounts = new Map<string, number>();
      let totalAccesses = 0;
      let totalHits = 0;

      for (const metaKey of metaKeys) {
        const metadata = await this.redis.hgetall(metaKey);
        const model = metadata.model;
        const userId = metadata.userId;
        const accessCount = parseInt(metadata.accessCount || '0');

        if (model) {
          modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
        }

        if (userId) {
          userCounts.set(userId, (userCounts.get(userId) || 0) + 1);
        }

        totalAccesses += accessCount;
        if (accessCount > 0) {
          totalHits += accessCount;
        }
      }

      const topModels = Array.from(modelCounts.entries())
        .map(([model, entries]) => ({ model, entries }))
        .sort((a, b) => b.entries - a.entries)
        .slice(0, 10);

      const topUsers = Array.from(userCounts.entries())
        .map(([userId, entries]) => ({ userId, entries }))
        .sort((a, b) => b.entries - a.entries)
        .slice(0, 10);

      // Estimate total size (rough approximation)
      const avgKeySize = 1024; // Assume 1KB per cache entry
      const totalSize = metaKeys.length * avgKeySize;

      const hitRate = totalAccesses > 0 ? (totalHits / totalAccesses) * 100 : 0;

      return {
        totalEntries: metaKeys.length,
        totalSize,
        hitRate,
        topModels,
        topUsers,
      };
    } catch (error) {
      logger.error('Error getting cache stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        totalEntries: 0,
        totalSize: 0,
        hitRate: 0,
        topModels: [],
        topUsers: [],
      };
    }
  }

  async cleanupExpiredEntries(): Promise<number> {
    try {
      const pattern = 'llm_cache:*:meta';
      const metaKeys = await this.redis.keys(pattern);
      
      if (metaKeys.length === 0) {
        return 0;
      }

      const now = Date.now();
      const expiredKeys: string[] = [];

      for (const metaKey of metaKeys) {
        const metadata = await this.redis.hgetall(metaKey);
        const createdAt = parseInt(metadata.createdAt || '0');
        const ttl = parseInt(metadata.ttl || '0');

        if (now - createdAt > ttl * 1000) {
          const cacheKey = metaKey.replace(':meta', '');
          expiredKeys.push(cacheKey, metaKey);
        }
      }

      if (expiredKeys.length > 0) {
        await this.redis.del(...expiredKeys);
        logger.debug('Cleaned up expired cache entries', {
          entriesDeleted: expiredKeys.length / 2,
        });
      }

      return expiredKeys.length / 2;
    } catch (error) {
      logger.error('Error cleaning up expired cache entries', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  async clearAllCache(): Promise<number> {
    try {
      const pattern = 'llm_cache:*';
      const keys = await this.redis.keys(pattern);
      
      if (keys.length === 0) {
        return 0;
      }

      await this.redis.del(...keys);
      
      logger.info('All cache cleared', {
        keysDeleted: keys.length,
      });

      return keys.length;
    } catch (error) {
      logger.error('Error clearing all cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info('Response cache enabled status changed', { enabled });
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
