import { createClient, RedisClientType } from 'redis';
import { redisConfig, cacheConfig } from '@/config';
import { log } from '@/utils/logger';

// Redis client instance
let redisClient: RedisClientType;

// Initialize Redis connection
export const initializeRedis = async (): Promise<void> => {
  try {
    log.info('Initializing Redis connection...');
    
    const connectionUrl = redisConfig.url || `redis://${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`;
    
    redisClient = createClient({
      url: connectionUrl,
      password: redisConfig.password,
      database: redisConfig.db,
      socket: {
        connectTimeout: 10000,
        lazyConnect: true,
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            log.error('Redis reconnection failed after 10 attempts');
            return new Error('Redis reconnection failed');
          }
          const delay = Math.min(retries * 100, 3000);
          log.warn(`Redis reconnecting in ${delay}ms (attempt ${retries})`);
          return delay;
        },
      },
    });
    
    // Event listeners
    redisClient.on('connect', () => {
      log.info('Redis client connected');
    });
    
    redisClient.on('ready', () => {
      log.info('Redis client ready');
    });
    
    redisClient.on('error', (error) => {
      log.error('Redis client error', error);
    });
    
    redisClient.on('end', () => {
      log.info('Redis client connection ended');
    });
    
    redisClient.on('reconnecting', () => {
      log.info('Redis client reconnecting...');
    });
    
    // Connect to Redis
    await redisClient.connect();
    
    log.info('Redis connection established successfully', {
      host: redisConfig.host,
      port: redisConfig.port,
      database: redisConfig.db,
    });
    
  } catch (error) {
    log.error('Failed to initialize Redis connection', error);
    throw error;
  }
};

// Close Redis connection
export const closeRedisConnection = async (): Promise<void> => {
  try {
    if (redisClient && redisClient.isOpen) {
      log.info('Closing Redis connection...');
      await redisClient.quit();
      log.info('Redis connection closed successfully');
    }
  } catch (error) {
    log.error('Error closing Redis connection', error);
    throw error;
  }
};

// Redis health check
export const checkRedisHealth = async (): Promise<{ status: 'connected' | 'disconnected'; responseTime?: number }> => {
  const start = Date.now();
  
  try {
    if (!redisClient || !redisClient.isOpen) {
      return { status: 'disconnected' };
    }
    
    await redisClient.ping();
    const responseTime = Date.now() - start;
    
    log.debug('Redis health check passed', { responseTime });
    
    return {
      status: 'connected',
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - start;
    
    log.error('Redis health check failed', error, { responseTime });
    
    return {
      status: 'disconnected',
      responseTime,
    };
  }
};

// Cache utility class
export class CacheService {
  private keyPrefix: string;
  
  constructor(keyPrefix: string = redisConfig.keyPrefix) {
    this.keyPrefix = keyPrefix;
  }
  
  private getKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }
  
  // Basic cache operations
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redisClient.get(this.getKey(key));
      return value ? JSON.parse(value) : null;
    } catch (error) {
      log.error('Cache get error', error, { key });
      return null;
    }
  }
  
  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    try {
      const serializedValue = JSON.stringify(value);
      
      if (ttlSeconds) {
        await redisClient.setEx(this.getKey(key), ttlSeconds, serializedValue);
      } else {
        await redisClient.set(this.getKey(key), serializedValue);
      }
      
      return true;
    } catch (error) {
      log.error('Cache set error', error, { key, ttlSeconds });
      return false;
    }
  }
  
  async del(key: string): Promise<boolean> {
    try {
      const result = await redisClient.del(this.getKey(key));
      return result > 0;
    } catch (error) {
      log.error('Cache delete error', error, { key });
      return false;
    }
  }
  
  async exists(key: string): Promise<boolean> {
    try {
      const result = await redisClient.exists(this.getKey(key));
      return result > 0;
    } catch (error) {
      log.error('Cache exists error', error, { key });
      return false;
    }
  }
  
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await redisClient.expire(this.getKey(key), ttlSeconds);
      return result;
    } catch (error) {
      log.error('Cache expire error', error, { key, ttlSeconds });
      return false;
    }
  }
  
  async ttl(key: string): Promise<number> {
    try {
      return await redisClient.ttl(this.getKey(key));
    } catch (error) {
      log.error('Cache TTL error', error, { key });
      return -1;
    }
  }
  
  // Pattern-based operations
  async keys(pattern: string): Promise<string[]> {
    try {
      const keys = await redisClient.keys(this.getKey(pattern));
      return keys.map(key => key.replace(this.keyPrefix, ''));
    } catch (error) {
      log.error('Cache keys error', error, { pattern });
      return [];
    }
  }
  
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await redisClient.keys(this.getKey(pattern));
      if (keys.length === 0) return 0;
      
      return await redisClient.del(keys);
    } catch (error) {
      log.error('Cache delete pattern error', error, { pattern });
      return 0;
    }
  }
  
  // Hash operations
  async hGet<T>(key: string, field: string): Promise<T | null> {
    try {
      const value = await redisClient.hGet(this.getKey(key), field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      log.error('Cache hGet error', error, { key, field });
      return null;
    }
  }
  
  async hSet(key: string, field: string, value: any): Promise<boolean> {
    try {
      const serializedValue = JSON.stringify(value);
      const result = await redisClient.hSet(this.getKey(key), field, serializedValue);
      return result > 0;
    } catch (error) {
      log.error('Cache hSet error', error, { key, field });
      return false;
    }
  }
  
  async hGetAll<T>(key: string): Promise<Record<string, T>> {
    try {
      const hash = await redisClient.hGetAll(this.getKey(key));
      const result: Record<string, T> = {};
      
      for (const [field, value] of Object.entries(hash)) {
        result[field] = JSON.parse(value);
      }
      
      return result;
    } catch (error) {
      log.error('Cache hGetAll error', error, { key });
      return {};
    }
  }
  
  async hDel(key: string, field: string): Promise<boolean> {
    try {
      const result = await redisClient.hDel(this.getKey(key), field);
      return result > 0;
    } catch (error) {
      log.error('Cache hDel error', error, { key, field });
      return false;
    }
  }
  
  // List operations
  async lPush(key: string, ...values: any[]): Promise<number> {
    try {
      const serializedValues = values.map(v => JSON.stringify(v));
      return await redisClient.lPush(this.getKey(key), serializedValues);
    } catch (error) {
      log.error('Cache lPush error', error, { key });
      return 0;
    }
  }
  
  async lPop<T>(key: string): Promise<T | null> {
    try {
      const value = await redisClient.lPop(this.getKey(key));
      return value ? JSON.parse(value) : null;
    } catch (error) {
      log.error('Cache lPop error', error, { key });
      return null;
    }
  }
  
  async lRange<T>(key: string, start: number, stop: number): Promise<T[]> {
    try {
      const values = await redisClient.lRange(this.getKey(key), start, stop);
      return values.map(v => JSON.parse(v));
    } catch (error) {
      log.error('Cache lRange error', error, { key, start, stop });
      return [];
    }
  }
  
  // Set operations
  async sAdd(key: string, ...members: any[]): Promise<number> {
    try {
      const serializedMembers = members.map(m => JSON.stringify(m));
      return await redisClient.sAdd(this.getKey(key), serializedMembers);
    } catch (error) {
      log.error('Cache sAdd error', error, { key });
      return 0;
    }
  }
  
  async sMembers<T>(key: string): Promise<T[]> {
    try {
      const members = await redisClient.sMembers(this.getKey(key));
      return members.map(m => JSON.parse(m));
    } catch (error) {
      log.error('Cache sMembers error', error, { key });
      return [];
    }
  }
  
  async sRem(key: string, ...members: any[]): Promise<number> {
    try {
      const serializedMembers = members.map(m => JSON.stringify(m));
      return await redisClient.sRem(this.getKey(key), serializedMembers);
    } catch (error) {
      log.error('Cache sRem error', error, { key });
      return 0;
    }
  }
  
  // Increment/Decrement operations
  async incr(key: string): Promise<number> {
    try {
      return await redisClient.incr(this.getKey(key));
    } catch (error) {
      log.error('Cache incr error', error, { key });
      return 0;
    }
  }
  
  async incrBy(key: string, increment: number): Promise<number> {
    try {
      return await redisClient.incrBy(this.getKey(key), increment);
    } catch (error) {
      log.error('Cache incrBy error', error, { key, increment });
      return 0;
    }
  }
  
  async decr(key: string): Promise<number> {
    try {
      return await redisClient.decr(this.getKey(key));
    } catch (error) {
      log.error('Cache decr error', error, { key });
      return 0;
    }
  }
}

// Specialized cache services
export class UserCacheService extends CacheService {
  constructor() {
    super('user:');
  }
  
  async getUserProfile(userId: string) {
    return this.get(`profile:${userId}`);
  }
  
  async setUserProfile(userId: string, profile: any) {
    return this.set(`profile:${userId}`, profile, cacheConfig.ttl.userProfile);
  }
  
  async deleteUserProfile(userId: string) {
    return this.del(`profile:${userId}`);
  }
  
  async getUserPreferences(userId: string) {
    return this.get(`preferences:${userId}`);
  }
  
  async setUserPreferences(userId: string, preferences: any) {
    return this.set(`preferences:${userId}`, preferences, cacheConfig.ttl.userPreferences);
  }
  
  async deleteUserPreferences(userId: string) {
    return this.del(`preferences:${userId}`);
  }
  
  async getUserEnrollments(userId: string) {
    return this.get(`enrollments:${userId}`);
  }
  
  async setUserEnrollments(userId: string, enrollments: any) {
    return this.set(`enrollments:${userId}`, enrollments, cacheConfig.ttl.userEnrollments);
  }
  
  async deleteUserEnrollments(userId: string) {
    return this.del(`enrollments:${userId}`);
  }
  
  async invalidateUserCache(userId: string) {
    const pattern = `*:${userId}`;
    return this.deletePattern(pattern);
  }
}

// Session cache service
export class SessionCacheService extends CacheService {
  constructor() {
    super('session:');
  }
  
  async getSession(sessionToken: string) {
    return this.get(sessionToken);
  }
  
  async setSession(sessionToken: string, sessionData: any, ttlSeconds: number) {
    return this.set(sessionToken, sessionData, ttlSeconds);
  }
  
  async deleteSession(sessionToken: string) {
    return this.del(sessionToken);
  }
  
  async getUserSessions(userId: string) {
    return this.get(`user:${userId}`);
  }
  
  async setUserSessions(userId: string, sessions: string[]) {
    return this.set(`user:${userId}`, sessions, 86400); // 24 hours
  }
  
  async addUserSession(userId: string, sessionToken: string) {
    const sessions = await this.getUserSessions(userId) || [];
    sessions.push(sessionToken);
    return this.setUserSessions(userId, sessions);
  }
  
  async removeUserSession(userId: string, sessionToken: string) {
    const sessions = await this.getUserSessions(userId) || [];
    const updatedSessions = sessions.filter(s => s !== sessionToken);
    return this.setUserSessions(userId, updatedSessions);
  }
}

// Rate limiting cache service
export class RateLimitCacheService extends CacheService {
  constructor() {
    super('ratelimit:');
  }
  
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    try {
      const current = await this.incr(key);
      
      if (current === 1) {
        await this.expire(key, windowSeconds);
      }
      
      const ttl = await this.ttl(key);
      const resetTime = Date.now() + (ttl * 1000);
      
      return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current),
        resetTime,
      };
    } catch (error) {
      log.error('Rate limit check error', error, { key, limit, windowSeconds });
      return { allowed: true, remaining: limit, resetTime: Date.now() + (windowSeconds * 1000) };
    }
  }
}

// Create service instances
export const cache = new CacheService();
export const userCache = new UserCacheService();
export const sessionCache = new SessionCacheService();
export const rateLimitCache = new RateLimitCacheService();

// Export Redis client for direct access
export { redisClient };

export default redisClient;
