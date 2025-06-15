import { getDatabase } from '../database';
import { Session } from '../types/auth';
import { v4 as uuidv4 } from 'uuid';

const TABLE_NAME = 'sessions';

export class SessionModel {
  static async create(
    userId: string,
    deviceInfo: string,
    ipAddress: string,
    userAgent: string,
    expiresAt: Date
  ): Promise<Session> {
    const db = getDatabase();
    
    const [session] = await db(TABLE_NAME)
      .insert({
        id: uuidv4(),
        userId,
        deviceInfo,
        ipAddress,
        userAgent,
        isActive: true,
        expiresAt,
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      })
      .returning('*');

    return session as Session;
  }

  static async findById(id: string): Promise<Session | null> {
    const db = getDatabase();
    const session = await db(TABLE_NAME)
      .where({ id, isActive: true })
      .where('expiresAt', '>', new Date())
      .first();

    return session || null;
  }

  static async findByUserId(userId: string): Promise<Session[]> {
    const db = getDatabase();
    const sessions = await db(TABLE_NAME)
      .where({ userId, isActive: true })
      .where('expiresAt', '>', new Date())
      .orderBy('lastAccessedAt', 'desc');

    return sessions as Session[];
  }

  static async updateLastAccessed(id: string): Promise<boolean> {
    const db = getDatabase();
    const result = await db(TABLE_NAME)
      .where({ id })
      .update({
        lastAccessedAt: new Date(),
      });

    return result > 0;
  }

  static async deactivate(id: string): Promise<boolean> {
    const db = getDatabase();
    const result = await db(TABLE_NAME)
      .where({ id })
      .update({
        isActive: false,
      });

    return result > 0;
  }

  static async deactivateAllForUser(userId: string): Promise<number> {
    const db = getDatabase();
    const result = await db(TABLE_NAME)
      .where({ userId })
      .update({
        isActive: false,
      });

    return result;
  }

  static async deactivateOtherSessions(userId: string, currentSessionId: string): Promise<number> {
    const db = getDatabase();
    const result = await db(TABLE_NAME)
      .where({ userId })
      .whereNot({ id: currentSessionId })
      .update({
        isActive: false,
      });

    return result;
  }

  static async cleanupExpiredSessions(): Promise<number> {
    const db = getDatabase();
    const result = await db(TABLE_NAME)
      .where('expiresAt', '<', new Date())
      .update({
        isActive: false,
      });

    return result;
  }

  static async deleteExpiredSessions(): Promise<number> {
    const db = getDatabase();
    const result = await db(TABLE_NAME)
      .where('expiresAt', '<', new Date())
      .where('isActive', false)
      .del();

    return result;
  }
}
