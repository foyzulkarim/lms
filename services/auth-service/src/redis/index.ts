import { createClient, RedisClientType } from 'redis';
import { config } from '../config';
import { logger } from '../utils/logger';

let redisClient: RedisClientType;

export const initializeRedis = async (): Promise<void> => {
  try {
    redisClient = createClient({
      url: config.redis.url || `redis://${config.redis.host}:${config.redis.port}`,
      password: config.redis.password,
    });

    redisClient.on('error', (error) => {
      logger.error('Redis error:', error);
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected');
    });

    redisClient.on('disconnect', () => {
      logger.warn('Redis disconnected');
    });

    await redisClient.connect();
    logger.info('Redis initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Redis:', error);
    throw error;
  }
};

export const getRedisClient = (): RedisClientType => {
  if (!redisClient) {
    throw new Error('Redis not initialized. Call initializeRedis() first.');
  }
  return redisClient;
};

export const closeRedis = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
};

// Cache utilities
export class CacheService {
  private static client = () => getRedisClient();

  static async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const client = this.client();
    const serializedValue = JSON.stringify(value);
    
    if (ttlSeconds) {
      await client.setEx(key, ttlSeconds, serializedValue);
    } else {
      await client.set(key, serializedValue);
    }
  }

  static async get<T>(key: string): Promise<T | null> {
    const client = this.client();
    const value = await client.get(key);
    
    if (!value) return null;
    
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  static async del(key: string): Promise<boolean> {
    const client = this.client();
    const result = await client.del(key);
    return result > 0;
  }

  static async exists(key: string): Promise<boolean> {
    const client = this.client();
    const result = await client.exists(key);
    return result > 0;
  }

  static async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const client = this.client();
    const result = await client.expire(key, ttlSeconds);
    return result;
  }

  static async incr(key: string): Promise<number> {
    const client = this.client();
    return await client.incr(key);
  }

  static async decr(key: string): Promise<number> {
    const client = this.client();
    return await client.decr(key);
  }

  // Specialized methods for auth service
  static async setRefreshToken(userId: string, token: string, ttlSeconds: number): Promise<void> {
    await this.set(`refresh_token:${userId}`, token, ttlSeconds);
  }

  static async getRefreshToken(userId: string): Promise<string | null> {
    return await this.get<string>(`refresh_token:${userId}`);
  }

  static async deleteRefreshToken(userId: string): Promise<boolean> {
    return await this.del(`refresh_token:${userId}`);
  }

  static async setPasswordResetToken(email: string, token: string, ttlSeconds: number): Promise<void> {
    await this.set(`password_reset:${email}`, token, ttlSeconds);
  }

  static async getPasswordResetToken(email: string): Promise<string | null> {
    return await this.get<string>(`password_reset:${email}`);
  }

  static async deletePasswordResetToken(email: string): Promise<boolean> {
    return await this.del(`password_reset:${email}`);
  }

  static async setEmailVerificationToken(email: string, token: string, ttlSeconds: number): Promise<void> {
    await this.set(`email_verification:${email}`, token, ttlSeconds);
  }

  static async getEmailVerificationToken(email: string): Promise<string | null> {
    return await this.get<string>(`email_verification:${email}`);
  }

  static async deleteEmailVerificationToken(email: string): Promise<boolean> {
    return await this.del(`email_verification:${email}`);
  }

  static async setOAuthState(state: string, data: any, ttlSeconds: number): Promise<void> {
    await this.set(`oauth_state:${state}`, data, ttlSeconds);
  }

  static async getOAuthState(state: string): Promise<any | null> {
    return await this.get(`oauth_state:${state}`);
  }

  static async deleteOAuthState(state: string): Promise<boolean> {
    return await this.del(`oauth_state:${state}`);
  }

  static async setFailedLoginAttempts(email: string, attempts: number, ttlSeconds: number): Promise<void> {
    await this.set(`failed_login:${email}`, attempts, ttlSeconds);
  }

  static async getFailedLoginAttempts(email: string): Promise<number> {
    const attempts = await this.get<number>(`failed_login:${email}`);
    return attempts || 0;
  }

  static async incrementFailedLoginAttempts(email: string, ttlSeconds: number): Promise<number> {
    const key = `failed_login:${email}`;
    const attempts = await this.incr(key);
    if (attempts === 1) {
      await this.expire(key, ttlSeconds);
    }
    return attempts;
  }

  static async deleteFailedLoginAttempts(email: string): Promise<boolean> {
    return await this.del(`failed_login:${email}`);
  }
}
