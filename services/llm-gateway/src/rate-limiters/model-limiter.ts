import { Redis } from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';
import { RateLimitInfo } from '../types/llm';

export class ModelRateLimiter {
  private redis: Redis;
  private window: number;
  private maxRequestsPerModel: number;

  constructor(redis: Redis) {
    this.redis = redis;
    this.window = config.rateLimit.window;
    this.maxRequestsPerModel = config.rateLimit.maxRequestsPerModel;
  }

  async checkModelRateLimit(userId: string, model: string): Promise<RateLimitInfo> {
    const key = `rate_limit:model:${userId}:${model}`;
    const now = Date.now();
    const windowStart = Math.floor(now / (this.window * 1000)) * this.window;

    // Get current count for this model
    const currentCount = await this.redis.get(`${key}:${windowStart}`);
    const count = parseInt(currentCount || '0');

    // Check if limit exceeded
    if (count >= this.maxRequestsPerModel) {
      const resetTime = (windowStart + this.window) * 1000;
      return {
        limit: this.maxRequestsPerModel,
        remaining: 0,
        reset: resetTime,
        retryAfter: Math.ceil((resetTime - now) / 1000),
      };
    }

    // Increment counter
    const pipeline = this.redis.pipeline();
    pipeline.incr(`${key}:${windowStart}`);
    pipeline.expire(`${key}:${windowStart}`, this.window + 60); // Add buffer
    await pipeline.exec();

    const resetTime = (windowStart + this.window) * 1000;
    
    return {
      limit: this.maxRequestsPerModel,
      remaining: Math.max(0, this.maxRequestsPerModel - count - 1),
      reset: resetTime,
    };
  }

  async getModelUsage(userId: string, model: string): Promise<{
    currentRequests: number;
    limit: number;
    remaining: number;
    windowStart: number;
  }> {
    const now = Date.now();
    const windowStart = Math.floor(now / (this.window * 1000)) * this.window;
    const key = `rate_limit:model:${userId}:${model}:${windowStart}`;

    const currentCount = await this.redis.get(key);
    const count = parseInt(currentCount || '0');

    return {
      currentRequests: count,
      limit: this.maxRequestsPerModel,
      remaining: Math.max(0, this.maxRequestsPerModel - count),
      windowStart,
    };
  }

  async getAllModelUsage(userId: string): Promise<Map<string, any>> {
    const pattern = `rate_limit:model:${userId}:*`;
    const keys = await this.redis.keys(pattern);
    const usage = new Map();

    if (keys.length === 0) {
      return usage;
    }

    const values = await this.redis.mget(...keys);
    
    keys.forEach((key, index) => {
      const parts = key.split(':');
      if (parts.length >= 4) {
        const model = parts[3];
        const count = parseInt(values[index] || '0');
        
        if (!usage.has(model)) {
          usage.set(model, { total: 0, windows: [] });
        }
        
        const modelUsage = usage.get(model);
        modelUsage.total += count;
        modelUsage.windows.push({ key, count });
      }
    });

    return usage;
  }

  async getTopModels(limit: number = 10): Promise<Array<{
    model: string;
    requests: number;
    users: number;
  }>> {
    const pattern = 'rate_limit:model:*';
    const keys = await this.redis.keys(pattern);
    
    if (keys.length === 0) {
      return [];
    }

    const values = await this.redis.mget(...keys);
    const modelStats = new Map<string, { requests: number; users: Set<string> }>();

    keys.forEach((key, index) => {
      const parts = key.split(':');
      if (parts.length >= 4) {
        const userId = parts[2];
        const model = parts[3];
        const count = parseInt(values[index] || '0');

        if (!modelStats.has(model)) {
          modelStats.set(model, { requests: 0, users: new Set() });
        }

        const stats = modelStats.get(model)!;
        stats.requests += count;
        stats.users.add(userId);
      }
    });

    return Array.from(modelStats.entries())
      .map(([model, stats]) => ({
        model,
        requests: stats.requests,
        users: stats.users.size,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, limit);
  }

  async resetModelLimit(userId: string, model: string): Promise<void> {
    const pattern = `rate_limit:model:${userId}:${model}:*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
      logger.info('Model rate limit reset', { userId, model });
    }
  }

  async resetAllModelLimits(userId: string): Promise<void> {
    const pattern = `rate_limit:model:${userId}:*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
      logger.info('All model rate limits reset for user', { userId });
    }
  }

  async getModelStats(): Promise<{
    totalRequests: number;
    uniqueModels: number;
    uniqueUsers: number;
    topModels: Array<{ model: string; requests: number }>;
  }> {
    const pattern = 'rate_limit:model:*';
    const keys = await this.redis.keys(pattern);
    
    if (keys.length === 0) {
      return {
        totalRequests: 0,
        uniqueModels: 0,
        uniqueUsers: 0,
        topModels: [],
      };
    }

    const values = await this.redis.mget(...keys);
    const models = new Set<string>();
    const users = new Set<string>();
    const modelRequests = new Map<string, number>();
    let totalRequests = 0;

    keys.forEach((key, index) => {
      const parts = key.split(':');
      if (parts.length >= 4) {
        const userId = parts[2];
        const model = parts[3];
        const count = parseInt(values[index] || '0');

        users.add(userId);
        models.add(model);
        totalRequests += count;

        modelRequests.set(model, (modelRequests.get(model) || 0) + count);
      }
    });

    const topModels = Array.from(modelRequests.entries())
      .map(([model, requests]) => ({ model, requests }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    return {
      totalRequests,
      uniqueModels: models.size,
      uniqueUsers: users.size,
      topModels,
    };
  }

  async cleanupExpiredKeys(): Promise<number> {
    const now = Date.now();
    const expiredThreshold = now - (this.window * 2 * 1000); // 2x window size
    
    const pattern = 'rate_limit:model:*';
    const keys = await this.redis.keys(pattern);
    
    let deletedCount = 0;
    
    for (const key of keys) {
      const parts = key.split(':');
      if (parts.length >= 5) {
        const timestamp = parseInt(parts[4]);
        if (timestamp * 1000 < expiredThreshold) {
          await this.redis.del(key);
          deletedCount++;
        }
      }
    }

    if (deletedCount > 0) {
      logger.debug('Cleaned up expired model rate limit keys', { deletedCount });
    }

    return deletedCount;
  }
}
