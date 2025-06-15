import { getDatabase } from '../database';
import { User, CreateUser, UpdateUser } from '../types/auth';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { config } from '../config';

const TABLE_NAME = 'users';

export class UserModel {
  static async create(userData: CreateUser): Promise<User> {
    const db = getDatabase();
    const hashedPassword = await bcrypt.hash(userData.password, config.security.bcryptRounds);
    
    const [user] = await db(TABLE_NAME)
      .insert({
        id: uuidv4(),
        email: userData.email.toLowerCase(),
        username: userData.username,
        firstName: userData.firstName,
        lastName: userData.lastName,
        passwordHash: hashedPassword,
        isActive: true,
        isEmailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning('*');

    // Remove password hash from response
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }

  static async findById(id: string): Promise<User | null> {
    const db = getDatabase();
    const user = await db(TABLE_NAME)
      .where({ id })
      .first();

    if (!user) return null;

    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }

  static async findByEmail(email: string): Promise<User | null> {
    const db = getDatabase();
    const user = await db(TABLE_NAME)
      .where({ email: email.toLowerCase() })
      .first();

    if (!user) return null;

    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }

  static async findByUsername(username: string): Promise<User | null> {
    const db = getDatabase();
    const user = await db(TABLE_NAME)
      .where({ username })
      .first();

    if (!user) return null;

    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }

  static async findByEmailWithPassword(email: string): Promise<(User & { passwordHash: string }) | null> {
    const db = getDatabase();
    const user = await db(TABLE_NAME)
      .where({ email: email.toLowerCase() })
      .first();

    return user || null;
  }

  static async update(id: string, userData: UpdateUser): Promise<User | null> {
    const db = getDatabase();
    const [user] = await db(TABLE_NAME)
      .where({ id })
      .update({
        ...userData,
        updatedAt: new Date(),
      })
      .returning('*');

    if (!user) return null;

    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }

  static async updatePassword(id: string, newPassword: string): Promise<boolean> {
    const db = getDatabase();
    const hashedPassword = await bcrypt.hash(newPassword, config.security.bcryptRounds);
    
    const result = await db(TABLE_NAME)
      .where({ id })
      .update({
        passwordHash: hashedPassword,
        updatedAt: new Date(),
      });

    return result > 0;
  }

  static async verifyEmail(id: string): Promise<boolean> {
    const db = getDatabase();
    const result = await db(TABLE_NAME)
      .where({ id })
      .update({
        isEmailVerified: true,
        updatedAt: new Date(),
      });

    return result > 0;
  }

  static async updateLastLogin(id: string): Promise<boolean> {
    const db = getDatabase();
    const result = await db(TABLE_NAME)
      .where({ id })
      .update({
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      });

    return result > 0;
  }

  static async deactivate(id: string): Promise<boolean> {
    const db = getDatabase();
    const result = await db(TABLE_NAME)
      .where({ id })
      .update({
        isActive: false,
        updatedAt: new Date(),
      });

    return result > 0;
  }

  static async activate(id: string): Promise<boolean> {
    const db = getDatabase();
    const result = await db(TABLE_NAME)
      .where({ id })
      .update({
        isActive: true,
        updatedAt: new Date(),
      });

    return result > 0;
  }

  static async verifyPassword(email: string, password: string): Promise<User | null> {
    const user = await this.findByEmailWithPassword(email);
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return null;

    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }

  static async emailExists(email: string): Promise<boolean> {
    const db = getDatabase();
    const user = await db(TABLE_NAME)
      .where({ email: email.toLowerCase() })
      .first();

    return !!user;
  }

  static async usernameExists(username: string): Promise<boolean> {
    const db = getDatabase();
    const user = await db(TABLE_NAME)
      .where({ username })
      .first();

    return !!user;
  }
}
