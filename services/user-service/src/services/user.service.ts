import { userModel } from '@/models/user.model';
import { enrollmentModel } from '@/models/enrollment.model';
import { preferenceModel } from '@/models/preference.model';
import { userCache } from '@/redis/client';
import { eventPublisher } from '@/rabbitmq/connection';
import { withTransaction } from '@/database/connection';
import { log } from '@/utils/logger';
import { 
  User, 
  CreateUser, 
  UpdateUser, 
  UserSearch, 
  UserStats, 
  PaginatedUsers,
  UserRoleType,
  UserStatusType,
  BulkUpdateRole,
} from '@/types/user.types';
import { 
  NotFoundError, 
  ConflictError, 
  ValidationError,
  AppError,
} from '@/types/api.types';
import { v4 as uuidv4 } from 'uuid';

export class UserService {
  // Create a new user
  async createUser(userData: CreateUser): Promise<User> {
    try {
      log.info('Creating new user', { email: userData.email, role: userData.role });
      
      // Check if user already exists
      const existingUser = await userModel.findByAuthId(userData.authId);
      if (existingUser) {
        throw new ConflictError('User already exists with this auth ID');
      }
      
      // Check if email is already taken
      const emailExists = await userModel.emailExists(userData.email);
      if (emailExists) {
        throw new ConflictError('Email address is already registered');
      }
      
      // Check if username is already taken (if provided)
      if (userData.username) {
        const usernameExists = await userModel.usernameExists(userData.username);
        if (usernameExists) {
          throw new ConflictError('Username is already taken');
        }
      }
      
      // Create user in transaction
      const user = await withTransaction(async (trx) => {
        // Create user
        const newUser = await userModel.create(userData, trx);
        
        // Set default preferences
        await preferenceModel.setDefaultPreferences(newUser.id, trx);
        
        return newUser;
      });
      
      // Cache user profile
      await userCache.setUserProfile(user.id, user);
      
      // Publish user created event
      await eventPublisher.publishUserEvent({
        type: 'user.created',
        data: {
          userId: user.id,
          authId: user.authId,
          email: user.email,
          role: user.role,
          profile: {
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          },
        },
        correlationId: uuidv4(),
      });
      
      log.info('User created successfully', { userId: user.id, email: user.email });
      
      return user;
    } catch (error) {
      log.error('Failed to create user', error, { userData });
      throw error;
    }
  }
  
  // Get user by ID
  async getUserById(id: string): Promise<User> {
    try {
      // Try to get from cache first
      const cachedUser = await userCache.getUserProfile(id);
      if (cachedUser) {
        log.debug('User retrieved from cache', { userId: id });
        return cachedUser;
      }
      
      // Get from database
      const user = await userModel.findById(id);
      if (!user) {
        throw new NotFoundError('User', id);
      }
      
      // Cache the user
      await userCache.setUserProfile(id, user);
      
      log.debug('User retrieved from database', { userId: id });
      
      return user;
    } catch (error) {
      log.error('Failed to get user by ID', error, { userId: id });
      throw error;
    }
  }
  
  // Get user by auth ID
  async getUserByAuthId(authId: string): Promise<User> {
    try {
      const user = await userModel.findByAuthId(authId);
      if (!user) {
        throw new NotFoundError('User with auth ID', authId);
      }
      
      // Cache the user
      await userCache.setUserProfile(user.id, user);
      
      log.debug('User retrieved by auth ID', { userId: user.id, authId });
      
      return user;
    } catch (error) {
      log.error('Failed to get user by auth ID', error, { authId });
      throw error;
    }
  }
  
  // Get user by email
  async getUserByEmail(email: string): Promise<User> {
    try {
      const user = await userModel.findByEmail(email);
      if (!user) {
        throw new NotFoundError('User with email', email);
      }
      
      log.debug('User retrieved by email', { userId: user.id, email });
      
      return user;
    } catch (error) {
      log.error('Failed to get user by email', error, { email });
      throw error;
    }
  }
  
  // Update user
  async updateUser(id: string, updates: UpdateUser): Promise<User> {
    try {
      log.info('Updating user', { userId: id, updates });
      
      // Get current user
      const currentUser = await this.getUserById(id);
      
      // Check if username is being changed and is available
      if (updates.username && updates.username !== currentUser.username) {
        const usernameExists = await userModel.usernameExists(updates.username, id);
        if (usernameExists) {
          throw new ConflictError('Username is already taken');
        }
      }
      
      // Update user
      const updatedUser = await userModel.update(id, updates);
      if (!updatedUser) {
        throw new NotFoundError('User', id);
      }
      
      // Update cache
      await userCache.setUserProfile(id, updatedUser);
      
      // Check if profile is now completed
      const profileCompleted = this.isProfileCompleted(updatedUser);
      if (profileCompleted && !currentUser.profileCompleted) {
        await userModel.update(id, { profileCompleted: true });
        updatedUser.profileCompleted = true;
        await userCache.setUserProfile(id, updatedUser);
      }
      
      // Publish user updated event
      await eventPublisher.publishUserEvent({
        type: 'user.updated',
        data: {
          userId: updatedUser.id,
          changes: updates,
          profile: {
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            displayName: updatedUser.displayName,
            avatarUrl: updatedUser.avatarUrl,
          },
        },
        correlationId: uuidv4(),
      });
      
      log.info('User updated successfully', { userId: id });
      
      return updatedUser;
    } catch (error) {
      log.error('Failed to update user', error, { userId: id, updates });
      throw error;
    }
  }
  
  // Update user role
  async updateUserRole(id: string, role: UserRoleType): Promise<User> {
    try {
      log.info('Updating user role', { userId: id, role });
      
      const updatedUser = await userModel.updateRole(id, role);
      if (!updatedUser) {
        throw new NotFoundError('User', id);
      }
      
      // Update cache
      await userCache.setUserProfile(id, updatedUser);
      
      // Publish role changed event
      await eventPublisher.publishUserEvent({
        type: 'user.role_changed',
        data: {
          userId: updatedUser.id,
          oldRole: role, // We don't have the old role here, but it's in the event for completeness
          newRole: updatedUser.role,
        },
        correlationId: uuidv4(),
      });
      
      log.info('User role updated successfully', { userId: id, role });
      
      return updatedUser;
    } catch (error) {
      log.error('Failed to update user role', error, { userId: id, role });
      throw error;
    }
  }
  
  // Update user status
  async updateUserStatus(id: string, status: UserStatusType): Promise<User> {
    try {
      log.info('Updating user status', { userId: id, status });
      
      const updatedUser = await userModel.updateStatus(id, status);
      if (!updatedUser) {
        throw new NotFoundError('User', id);
      }
      
      // Update cache
      await userCache.setUserProfile(id, updatedUser);
      
      // Publish status changed event
      await eventPublisher.publishUserEvent({
        type: 'user.status_changed',
        data: {
          userId: updatedUser.id,
          status: updatedUser.status,
        },
        correlationId: uuidv4(),
      });
      
      log.info('User status updated successfully', { userId: id, status });
      
      return updatedUser;
    } catch (error) {
      log.error('Failed to update user status', error, { userId: id, status });
      throw error;
    }
  }
  
  // Delete user (soft delete)
  async deleteUser(id: string): Promise<boolean> {
    try {
      log.info('Deleting user', { userId: id });
      
      // Get user before deletion
      const user = await this.getUserById(id);
      
      // Soft delete user
      const deleted = await userModel.softDelete(id);
      if (!deleted) {
        throw new NotFoundError('User', id);
      }
      
      // Remove from cache
      await userCache.deleteUserProfile(id);
      await userCache.invalidateUserCache(id);
      
      // Publish user deleted event
      await eventPublisher.publishUserEvent({
        type: 'user.deleted',
        data: {
          userId: user.id,
          email: user.email,
        },
        correlationId: uuidv4(),
      });
      
      log.info('User deleted successfully', { userId: id });
      
      return true;
    } catch (error) {
      log.error('Failed to delete user', error, { userId: id });
      throw error;
    }
  }
  
  // Search users
  async searchUsers(searchParams: UserSearch): Promise<PaginatedUsers> {
    try {
      log.debug('Searching users', { searchParams });
      
      const result = await userModel.search(searchParams);
      
      log.debug('User search completed', { 
        resultCount: result.users.length, 
        total: result.pagination.total 
      });
      
      return result;
    } catch (error) {
      log.error('Failed to search users', error, { searchParams });
      throw error;
    }
  }
  
  // Get users by role
  async getUsersByRole(role: UserRoleType): Promise<User[]> {
    try {
      const users = await userModel.findByRole(role);
      
      log.debug('Users retrieved by role', { role, count: users.length });
      
      return users;
    } catch (error) {
      log.error('Failed to get users by role', error, { role });
      throw error;
    }
  }
  
  // Get user statistics
  async getUserStats(id: string): Promise<UserStats> {
    try {
      const user = await this.getUserById(id);
      
      // Get enrollment statistics
      const enrollmentStats = await enrollmentModel.getUserEnrollmentStats(id);
      
      // Calculate profile completion percentage
      const profileCompletionPercentage = this.calculateProfileCompletion(user);
      
      const stats: UserStats = {
        totalEnrollments: enrollmentStats.total,
        activeEnrollments: enrollmentStats.active,
        completedEnrollments: enrollmentStats.completed,
        totalProgress: enrollmentStats.totalProgress,
        averageProgress: enrollmentStats.averageProgress,
        lastLoginAt: user.lastActiveAt,
        totalLoginCount: 0, // This would need to be tracked separately
        profileCompletionPercentage,
      };
      
      log.debug('User statistics calculated', { userId: id, stats });
      
      return stats;
    } catch (error) {
      log.error('Failed to get user statistics', error, { userId: id });
      throw error;
    }
  }
  
  // Update last active timestamp
  async updateLastActive(id: string): Promise<void> {
    try {
      await userModel.updateLastActive(id);
      
      // Update cache
      const cachedUser = await userCache.getUserProfile(id);
      if (cachedUser) {
        cachedUser.lastActiveAt = new Date().toISOString();
        await userCache.setUserProfile(id, cachedUser);
      }
      
      log.debug('User last active updated', { userId: id });
    } catch (error) {
      log.error('Failed to update user last active', error, { userId: id });
      throw error;
    }
  }
  
  // Bulk update user roles
  async bulkUpdateRoles(bulkUpdate: BulkUpdateRole): Promise<{ successful: number; failed: number; errors: any[] }> {
    try {
      log.info('Bulk updating user roles', { 
        userIds: bulkUpdate.userIds, 
        role: bulkUpdate.role,
        count: bulkUpdate.userIds.length,
      });
      
      const errors: any[] = [];
      let successful = 0;
      let failed = 0;
      
      // Process each user
      for (const userId of bulkUpdate.userIds) {
        try {
          await this.updateUserRole(userId, bulkUpdate.role);
          successful++;
        } catch (error) {
          failed++;
          errors.push({
            id: userId,
            error: error.message,
          });
          log.error('Failed to update role for user in bulk operation', error, { userId });
        }
      }
      
      log.info('Bulk role update completed', { 
        total: bulkUpdate.userIds.length,
        successful,
        failed,
      });
      
      return { successful, failed, errors };
    } catch (error) {
      log.error('Failed to bulk update user roles', error, { bulkUpdate });
      throw error;
    }
  }
  
  // Get overall user statistics
  async getOverallStats(): Promise<any> {
    try {
      const stats = await userModel.getStats();
      
      log.debug('Overall user statistics retrieved', { stats });
      
      return stats;
    } catch (error) {
      log.error('Failed to get overall user statistics', error);
      throw error;
    }
  }
  
  // Check if profile is completed
  private isProfileCompleted(user: User): boolean {
    const requiredFields = [
      user.firstName,
      user.lastName,
      user.email,
      user.timezone,
      user.language,
    ];
    
    return requiredFields.every(field => field && field.trim().length > 0);
  }
  
  // Calculate profile completion percentage
  private calculateProfileCompletion(user: User): number {
    const fields = [
      { field: user.firstName, weight: 20 },
      { field: user.lastName, weight: 20 },
      { field: user.email, weight: 20 },
      { field: user.username, weight: 10 },
      { field: user.bio, weight: 10 },
      { field: user.avatarUrl, weight: 10 },
      { field: user.phone, weight: 5 },
      { field: user.timezone, weight: 2.5 },
      { field: user.language, weight: 2.5 },
    ];
    
    let completedWeight = 0;
    let totalWeight = 0;
    
    for (const { field, weight } of fields) {
      totalWeight += weight;
      if (field && field.toString().trim().length > 0) {
        completedWeight += weight;
      }
    }
    
    return Math.round((completedWeight / totalWeight) * 100);
  }
  
  // Validate user data
  private validateUserData(userData: CreateUser | UpdateUser): void {
    if ('email' in userData && userData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(userData.email)) {
        throw new ValidationError('Invalid email format');
      }
    }
    
    if ('username' in userData && userData.username) {
      const usernameRegex = /^[a-zA-Z0-9_-]{3,50}$/;
      if (!usernameRegex.test(userData.username)) {
        throw new ValidationError('Username must be 3-50 characters and contain only letters, numbers, underscores, and hyphens');
      }
    }
    
    if ('phone' in userData && userData.phone) {
      const phoneRegex = /^\+?[\d\s\-\(\)]{10,20}$/;
      if (!phoneRegex.test(userData.phone)) {
        throw new ValidationError('Invalid phone number format');
      }
    }
  }
}

export const userService = new UserService();
