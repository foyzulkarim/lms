import { Redis } from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';
import { RateLimitInfo } from '../types/llm';

export class UserRateLimiter {
  private redis: Redis;
  private window: number;
  private maxRequests: number;
  private burstSize: number;

  constructor(redis: Redis) {
    this.redis = redis;
    this.window = config.rateLimit.window;
    this.maxRequests = config.rateLimit.maxRequests;
    this.burstSize = config.rateLimit.burstSize;
  }

  async checkRateLimit(userId: string): Promise<RateLimitInfo> {
    const key = `rate_limit:user:${userId}`;
    const now = Date.now();
    const windowStart = Math.floor(now / (this.window * 1000)) * this.window;

    // Use Redis pipeline for atomic operations
    const pipeline = this.redis.pipeline();
    
    // Get current count
    pipeline.get(`${key}:${windowStart}`);
    
    // Get burst count (last minute)
    const burstWindowStart = Math.floor(now / 60000) * 60;
    pipeline.get(`${key}:burst:${burstWindowStart}`);

    const results = await pipeline.exec();
    
    if (!results) {
      throw new Error('Redis pipeline execution failed');
    }

    const currentCount = parseInt(results[0]?.[1] as string || '0');
    const burstCount = parseInt(results[1]?.[1] as string || '0');

    // Check burst limit (requests per minute)
    if (burstCount >= this.burstSize) {
      const resetTime = (burstWindowStart + 60) * 1000;
      return {
        limit: this.burstSize,
        remaining: 0,
        reset: resetTime,
        retryAfter: Math.ceil((resetTime - now) / 1000),
      };
    }

    // Check window limit
    if (currentCount >= this.maxRequests) {
      const resetTime = (windowStart + this.window) * 1000;
      return {
        limit: this.maxRequests,
        remaining: 0,
        reset: resetTime,
        retryAfter: Math.ceil((resetTime - now) / 1000),
      };
    }

    // Increment counters
    const incrementPipeline = this.redis.pipeline();
    
    // Increment window counter
    incrementPipeline.incr(`${key}:${windowStart}`);
    incrementPipeline.expire(`${key}:${windowStart}`, this.window + 60); // Add buffer
    
    // Increment burst counter
    incrementPipeline.incr(`${key}:burst:${burstWindowStart}`);
    incrementPipeline.expire(`${key}:burst:${burstWindowStart}`, 120); // 2 minutes buffer

    await incrementPipeline.exec();

    const resetTime = (windowStart + this.window) * 1000;
    
    return {
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - currentCount - 1),
      reset: resetTime,
    };
  }

  async getRemainingRequests(userId: string): Promise<number> {
    const rateLimitInfo = await this.checkRateLimit(userId);
    return rateLimitInfo.remaining;
  }

  async resetUserLimit(userId: string): Promise<void> {
    const pattern = `rate_limit:user:${userId}:*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
      logger.info('User rate limit reset', { userId });
    }
  }

  async getUserStats(userId: string): Promise<{
    currentRequests: number;
    burstRequests: number;
    windowStart: number;
    burstWindowStart: number;
  }> {
    const now = Date.now();
    const windowStart = Math.floor(now / (this.window * 1000)) * this.window;
    const burstWindowStart = Math.floor(now / 60000) * 60;

    const pipeline = this.redis.pipeline();
    pipeline.get(`rate_limit:user:${userId}:${windowStart}`);
    pipeline.get(`rate_limit:user:${userId}:burst:${burstWindowStart}`);

    const results = await pipeline.exec();
    
    if (!results) {
      throw new Error('Redis pipeline execution failed');
    }

    return {
      currentRequests: parseInt(results[0]?.[1] as string || '0'),
      burstRequests: parseInt(results[1]?.[1] as string || '0'),
      windowStart,
      burstWindowStart,
    };
  }

  async getAllUserStats(): Promise<Map<string, any>> {
    const pattern = 'rate_limit:user:*';
    const keys = await this.redis.keys(pattern);
    const stats = new Map();

    if (keys.length === 0) {
      return stats;
    }

    const values = await this.redis.mget(...keys);
    
    keys.forEach((key, index) => {
      const parts = key.split(':');
      if (parts.length >= 3) {
        const userId = parts[2];
        const count = parseInt(values[index] || '0');
        
        if (!stats.has(userId)) {
          stats.set(userId, { total: 0, windows: [] });
        }
        
        const userStats = stats.get(userId);
        userStats.total += count;
        userStats.windows.push({ key, count });
      }
    });

    return stats;
  }

  async cleanupExpiredKeys(): Promise<number> {
    const now = Date.now();
    const expiredThreshold = now - (this.window * 2 * 1000); // 2x window size
    
    const pattern = 'rate_limit:user:*';
    const keys = await this.redis.keys(pattern);
    
    let deletedCount = 0;
    
    for (const key of keys) {
      const parts = key.split(':');
      if (parts.length >= 4) {
        const timestamp = parseInt(parts[3]);
        if (timestamp * 1000 < expiredThreshold) {
          await this.redis.del(key);
          deletedCount++;
        }
      }
    }

    if (deletedCount > 0) {
      logger.debug('Cleaned up expired rate limit keys', { deletedCount });
    }

    return deletedCount;
  }
}
