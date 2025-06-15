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

  // Course-specific cache methods
  static async setCourse(courseId: string, course: any): Promise<void> {
    await this.set(`course:${courseId}`, course, config.cache.ttlCourses);
  }

  static async getCourse(courseId: string): Promise<any | null> {
    return await this.get(`course:${courseId}`);
  }

  static async deleteCourse(courseId: string): Promise<boolean> {
    return await this.del(`course:${courseId}`);
  }

  static async setCourseWithModules(courseId: string, courseWithModules: any): Promise<void> {
    await this.set(`course_with_modules:${courseId}`, courseWithModules, config.cache.ttlCourses);
  }

  static async getCourseWithModules(courseId: string): Promise<any | null> {
    return await this.get(`course_with_modules:${courseId}`);
  }

  static async deleteCourseWithModules(courseId: string): Promise<boolean> {
    return await this.del(`course_with_modules:${courseId}`);
  }

  static async setModule(moduleId: string, module: any): Promise<void> {
    await this.set(`module:${moduleId}`, module, config.cache.ttlModules);
  }

  static async getModule(moduleId: string): Promise<any | null> {
    return await this.get(`module:${moduleId}`);
  }

  static async deleteModule(moduleId: string): Promise<boolean> {
    return await this.del(`module:${moduleId}`);
  }

  static async setLesson(lessonId: string, lesson: any): Promise<void> {
    await this.set(`lesson:${lessonId}`, lesson, config.cache.ttlLessons);
  }

  static async getLesson(lessonId: string): Promise<any | null> {
    return await this.get(`lesson:${lessonId}`);
  }

  static async deleteLesson(lessonId: string): Promise<boolean> {
    return await this.del(`lesson:${lessonId}`);
  }

  static async setCourseModules(courseId: string, modules: any[]): Promise<void> {
    await this.set(`course_modules:${courseId}`, modules, config.cache.ttlModules);
  }

  static async getCourseModules(courseId: string): Promise<any[] | null> {
    return await this.get(`course_modules:${courseId}`);
  }

  static async deleteCourseModules(courseId: string): Promise<boolean> {
    return await this.del(`course_modules:${courseId}`);
  }

  static async setModuleLessons(moduleId: string, lessons: any[]): Promise<void> {
    await this.set(`module_lessons:${moduleId}`, lessons, config.cache.ttlLessons);
  }

  static async getModuleLessons(moduleId: string): Promise<any[] | null> {
    return await this.get(`module_lessons:${moduleId}`);
  }

  static async deleteModuleLessons(moduleId: string): Promise<boolean> {
    return await this.del(`module_lessons:${moduleId}`);
  }

  // Invalidate related caches
  static async invalidateCourseCache(courseId: string): Promise<void> {
    await Promise.all([
      this.deleteCourse(courseId),
      this.deleteCourseWithModules(courseId),
      this.deleteCourseModules(courseId),
    ]);
  }

  static async invalidateModuleCache(moduleId: string, courseId?: string): Promise<void> {
    const promises = [
      this.deleteModule(moduleId),
      this.deleteModuleLessons(moduleId),
    ];

    if (courseId) {
      promises.push(
        this.deleteCourseWithModules(courseId),
        this.deleteCourseModules(courseId)
      );
    }

    await Promise.all(promises);
  }

  static async invalidateLessonCache(lessonId: string, moduleId?: string, courseId?: string): Promise<void> {
    const promises = [this.deleteLesson(lessonId)];

    if (moduleId) {
      promises.push(this.deleteModuleLessons(moduleId));
    }

    if (courseId) {
      promises.push(
        this.deleteCourseWithModules(courseId),
        this.deleteCourseModules(courseId)
      );
    }

    await Promise.all(promises);
  }
}
