import { Knex } from 'knex';
import { db, transformRowToCamelCase, transformObjectToSnakeCase, buildPaginationQuery, buildSortQuery, buildSearchQuery } from '@/database/connection';
import { User, CreateUser, UpdateUser, UserSearch, Pagination, UserRow, UserRoleType, UserStatusType } from '@/types/user.types';
import { log } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class UserModel {
  private tableName = 'users';
  
  // Create a new user
  async create(userData: CreateUser, trx?: Knex.Transaction): Promise<User> {
    try {
      const dbInstance = trx || db;
      const id = uuidv4();
      
      const userRow = transformObjectToSnakeCase({
        id,
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      const [createdUser] = await dbInstance(this.tableName)
        .insert(userRow)
        .returning('*');
      
      log.debug('User created in database', { userId: id });
      
      return transformRowToCamelCase<User>(createdUser);
    } catch (error) {
      log.error('Failed to create user in database', error, { userData });
      throw error;
    }
  }
  
  // Find user by ID
  async findById(id: string, trx?: Knex.Transaction): Promise<User | null> {
    try {
      const dbInstance = trx || db;
      
      const user = await dbInstance(this.tableName)
        .where({ id })
        .first();
      
      if (!user) {
        return null;
      }
      
      return transformRowToCamelCase<User>(user);
    } catch (error) {
      log.error('Failed to find user by ID', error, { userId: id });
      throw error;
    }
  }
  
  // Find user by auth ID
  async findByAuthId(authId: string, trx?: Knex.Transaction): Promise<User | null> {
    try {
      const dbInstance = trx || db;
      
      const user = await dbInstance(this.tableName)
        .where({ auth_id: authId })
        .first();
      
      if (!user) {
        return null;
      }
      
      return transformRowToCamelCase<User>(user);
    } catch (error) {
      log.error('Failed to find user by auth ID', error, { authId });
      throw error;
    }
  }
  
  // Find user by email
  async findByEmail(email: string, trx?: Knex.Transaction): Promise<User | null> {
    try {
      const dbInstance = trx || db;
      
      const user = await dbInstance(this.tableName)
        .where({ email: email.toLowerCase() })
        .first();
      
      if (!user) {
        return null;
      }
      
      return transformRowToCamelCase<User>(user);
    } catch (error) {
      log.error('Failed to find user by email', error, { email });
      throw error;
    }
  }
  
  // Find user by username
  async findByUsername(username: string, trx?: Knex.Transaction): Promise<User | null> {
    try {
      const dbInstance = trx || db;
      
      const user = await dbInstance(this.tableName)
        .where({ username: username.toLowerCase() })
        .first();
      
      if (!user) {
        return null;
      }
      
      return transformRowToCamelCase<User>(user);
    } catch (error) {
      log.error('Failed to find user by username', error, { username });
      throw error;
    }
  }
  
  // Update user
  async update(id: string, updates: UpdateUser, trx?: Knex.Transaction): Promise<User | null> {
    try {
      const dbInstance = trx || db;
      
      const updateData = transformObjectToSnakeCase({
        ...updates,
        updatedAt: new Date(),
      });
      
      const [updatedUser] = await dbInstance(this.tableName)
        .where({ id })
        .update(updateData)
        .returning('*');
      
      if (!updatedUser) {
        return null;
      }
      
      log.debug('User updated in database', { userId: id });
      
      return transformRowToCamelCase<User>(updatedUser);
    } catch (error) {
      log.error('Failed to update user', error, { userId: id, updates });
      throw error;
    }
  }
  
  // Update user role
  async updateRole(id: string, role: UserRoleType, trx?: Knex.Transaction): Promise<User | null> {
    try {
      const dbInstance = trx || db;
      
      const [updatedUser] = await dbInstance(this.tableName)
        .where({ id })
        .update({
          role,
          updated_at: new Date(),
        })
        .returning('*');
      
      if (!updatedUser) {
        return null;
      }
      
      log.debug('User role updated in database', { userId: id, role });
      
      return transformRowToCamelCase<User>(updatedUser);
    } catch (error) {
      log.error('Failed to update user role', error, { userId: id, role });
      throw error;
    }
  }
  
  // Update user status
  async updateStatus(id: string, status: UserStatusType, trx?: Knex.Transaction): Promise<User | null> {
    try {
      const dbInstance = trx || db;
      
      const [updatedUser] = await dbInstance(this.tableName)
        .where({ id })
        .update({
          status,
          updated_at: new Date(),
        })
        .returning('*');
      
      if (!updatedUser) {
        return null;
      }
      
      log.debug('User status updated in database', { userId: id, status });
      
      return transformRowToCamelCase<User>(updatedUser);
    } catch (error) {
      log.error('Failed to update user status', error, { userId: id, status });
      throw error;
    }
  }
  
  // Update last active timestamp
  async updateLastActive(id: string, trx?: Knex.Transaction): Promise<void> {
    try {
      const dbInstance = trx || db;
      
      await dbInstance(this.tableName)
        .where({ id })
        .update({
          last_active_at: new Date(),
          updated_at: new Date(),
        });
      
      log.debug('User last active updated', { userId: id });
    } catch (error) {
      log.error('Failed to update user last active', error, { userId: id });
      throw error;
    }
  }
  
  // Soft delete user
  async softDelete(id: string, trx?: Knex.Transaction): Promise<boolean> {
    try {
      const dbInstance = trx || db;
      
      const result = await dbInstance(this.tableName)
        .where({ id })
        .update({
          status: 'deleted',
          updated_at: new Date(),
        });
      
      const deleted = result > 0;
      
      if (deleted) {
        log.debug('User soft deleted', { userId: id });
      }
      
      return deleted;
    } catch (error) {
      log.error('Failed to soft delete user', error, { userId: id });
      throw error;
    }
  }
  
  // Hard delete user (use with caution)
  async hardDelete(id: string, trx?: Knex.Transaction): Promise<boolean> {
    try {
      const dbInstance = trx || db;
      
      const result = await dbInstance(this.tableName)
        .where({ id })
        .del();
      
      const deleted = result > 0;
      
      if (deleted) {
        log.warn('User hard deleted', { userId: id });
      }
      
      return deleted;
    } catch (error) {
      log.error('Failed to hard delete user', error, { userId: id });
      throw error;
    }
  }
  
  // Search users with pagination
  async search(searchParams: UserSearch, trx?: Knex.Transaction): Promise<{ users: User[]; pagination: Pagination }> {
    try {
      const dbInstance = trx || db;
      const {
        page = 1,
        limit = 20,
        search,
        role,
        status,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = searchParams;
      
      // Build base query
      let query = dbInstance(this.tableName).select('*');
      
      // Apply filters
      if (role) {
        query = query.where({ role });
      }
      
      if (status) {
        query = query.where({ status });
      }
      
      // Apply search
      if (search) {
        query = buildSearchQuery(query, search, [
          'first_name',
          'last_name',
          'email',
          'username',
          'display_name',
        ]);
      }
      
      // Get total count
      const totalQuery = query.clone();
      const [{ count }] = await totalQuery.count('* as count');
      const total = parseInt(count as string, 10);
      
      // Apply sorting and pagination
      query = buildSortQuery(query, sortBy === 'createdAt' ? 'created_at' : sortBy, sortOrder);
      query = buildPaginationQuery(query, page, limit);
      
      // Execute query
      const users = await query;
      
      // Calculate pagination
      const totalPages = Math.ceil(total / limit);
      const pagination: Pagination = {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      };
      
      log.debug('User search completed', {
        searchParams,
        resultCount: users.length,
        total,
      });
      
      return {
        users: users.map(user => transformRowToCamelCase<User>(user)),
        pagination,
      };
    } catch (error) {
      log.error('Failed to search users', error, { searchParams });
      throw error;
    }
  }
  
  // Get users by role
  async findByRole(role: UserRoleType, trx?: Knex.Transaction): Promise<User[]> {
    try {
      const dbInstance = trx || db;
      
      const users = await dbInstance(this.tableName)
        .where({ role })
        .orderBy('created_at', 'desc');
      
      return users.map(user => transformRowToCamelCase<User>(user));
    } catch (error) {
      log.error('Failed to find users by role', error, { role });
      throw error;
    }
  }
  
  // Get users by status
  async findByStatus(status: UserStatusType, trx?: Knex.Transaction): Promise<User[]> {
    try {
      const dbInstance = trx || db;
      
      const users = await dbInstance(this.tableName)
        .where({ status })
        .orderBy('created_at', 'desc');
      
      return users.map(user => transformRowToCamelCase<User>(user));
    } catch (error) {
      log.error('Failed to find users by status', error, { status });
      throw error;
    }
  }
  
  // Get user statistics
  async getStats(trx?: Knex.Transaction): Promise<any> {
    try {
      const dbInstance = trx || db;
      
      const [stats] = await dbInstance(this.tableName)
        .select([
          dbInstance.raw('COUNT(*) as total'),
          dbInstance.raw("COUNT(*) FILTER (WHERE status = 'active') as active"),
          dbInstance.raw("COUNT(*) FILTER (WHERE status = 'inactive') as inactive"),
          dbInstance.raw("COUNT(*) FILTER (WHERE status = 'suspended') as suspended"),
          dbInstance.raw("COUNT(*) FILTER (WHERE role = 'admin') as admins"),
          dbInstance.raw("COUNT(*) FILTER (WHERE role = 'instructor') as instructors"),
          dbInstance.raw("COUNT(*) FILTER (WHERE role = 'student') as students"),
          dbInstance.raw("COUNT(*) FILTER (WHERE email_verified = true) as email_verified"),
          dbInstance.raw("COUNT(*) FILTER (WHERE profile_completed = true) as profile_completed"),
        ]);
      
      return {
        total: parseInt(stats.total, 10),
        byStatus: {
          active: parseInt(stats.active, 10),
          inactive: parseInt(stats.inactive, 10),
          suspended: parseInt(stats.suspended, 10),
        },
        byRole: {
          admin: parseInt(stats.admins, 10),
          instructor: parseInt(stats.instructors, 10),
          student: parseInt(stats.students, 10),
        },
        verification: {
          emailVerified: parseInt(stats.email_verified, 10),
          profileCompleted: parseInt(stats.profile_completed, 10),
        },
      };
    } catch (error) {
      log.error('Failed to get user statistics', error);
      throw error;
    }
  }
  
  // Bulk update user roles
  async bulkUpdateRole(userIds: string[], role: UserRoleType, trx?: Knex.Transaction): Promise<number> {
    try {
      const dbInstance = trx || db;
      
      const result = await dbInstance(this.tableName)
        .whereIn('id', userIds)
        .update({
          role,
          updated_at: new Date(),
        });
      
      log.debug('Bulk user role update completed', { userIds, role, updatedCount: result });
      
      return result;
    } catch (error) {
      log.error('Failed to bulk update user roles', error, { userIds, role });
      throw error;
    }
  }
  
  // Check if email exists
  async emailExists(email: string, excludeUserId?: string, trx?: Knex.Transaction): Promise<boolean> {
    try {
      const dbInstance = trx || db;
      
      let query = dbInstance(this.tableName)
        .where({ email: email.toLowerCase() });
      
      if (excludeUserId) {
        query = query.whereNot({ id: excludeUserId });
      }
      
      const user = await query.first();
      
      return !!user;
    } catch (error) {
      log.error('Failed to check email existence', error, { email });
      throw error;
    }
  }
  
  // Check if username exists
  async usernameExists(username: string, excludeUserId?: string, trx?: Knex.Transaction): Promise<boolean> {
    try {
      const dbInstance = trx || db;
      
      let query = dbInstance(this.tableName)
        .where({ username: username.toLowerCase() });
      
      if (excludeUserId) {
        query = query.whereNot({ id: excludeUserId });
      }
      
      const user = await query.first();
      
      return !!user;
    } catch (error) {
      log.error('Failed to check username existence', error, { username });
      throw error;
    }
  }
}

export const userModel = new UserModel();
