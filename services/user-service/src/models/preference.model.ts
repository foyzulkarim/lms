import { Knex } from 'knex';
import { db, transformRowToCamelCase, transformObjectToSnakeCase } from '@/database/connection';
import { UserPreference, UpsertPreference, UserPreferenceRow } from '@/types/user.types';
import { log } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class PreferenceModel {
  private tableName = 'user_preferences';
  
  // Create or update a preference
  async upsert(userId: string, preferenceData: UpsertPreference, trx?: Knex.Transaction): Promise<UserPreference> {
    try {
      const dbInstance = trx || db;
      const { category, key, value } = preferenceData;
      
      // Check if preference exists
      const existing = await dbInstance(this.tableName)
        .where({ user_id: userId, category, key })
        .first();
      
      if (existing) {
        // Update existing preference
        const [updatedPreference] = await dbInstance(this.tableName)
          .where({ user_id: userId, category, key })
          .update({
            value: JSON.stringify(value),
            updated_at: new Date(),
          })
          .returning('*');
        
        log.debug('Preference updated in database', { userId, category, key });
        
        return transformRowToCamelCase<UserPreference>({
          ...updatedPreference,
          value: JSON.parse(updatedPreference.value),
        });
      } else {
        // Create new preference
        const id = uuidv4();
        const preferenceRow = {
          id,
          user_id: userId,
          category,
          key,
          value: JSON.stringify(value),
          created_at: new Date(),
          updated_at: new Date(),
        };
        
        const [createdPreference] = await dbInstance(this.tableName)
          .insert(preferenceRow)
          .returning('*');
        
        log.debug('Preference created in database', { userId, category, key });
        
        return transformRowToCamelCase<UserPreference>({
          ...createdPreference,
          value: JSON.parse(createdPreference.value),
        });
      }
    } catch (error) {
      log.error('Failed to upsert preference', error, { userId, preferenceData });
      throw error;
    }
  }
  
  // Get a specific preference
  async findByUserCategoryKey(
    userId: string,
    category: string,
    key: string,
    trx?: Knex.Transaction
  ): Promise<UserPreference | null> {
    try {
      const dbInstance = trx || db;
      
      const preference = await dbInstance(this.tableName)
        .where({ user_id: userId, category, key })
        .first();
      
      if (!preference) {
        return null;
      }
      
      return transformRowToCamelCase<UserPreference>({
        ...preference,
        value: JSON.parse(preference.value),
      });
    } catch (error) {
      log.error('Failed to find preference', error, { userId, category, key });
      throw error;
    }
  }
  
  // Get all preferences for a user
  async findByUserId(userId: string, trx?: Knex.Transaction): Promise<UserPreference[]> {
    try {
      const dbInstance = trx || db;
      
      const preferences = await dbInstance(this.tableName)
        .where({ user_id: userId })
        .orderBy(['category', 'key']);
      
      return preferences.map(preference => 
        transformRowToCamelCase<UserPreference>({
          ...preference,
          value: JSON.parse(preference.value),
        })
      );
    } catch (error) {
      log.error('Failed to find preferences by user ID', error, { userId });
      throw error;
    }
  }
  
  // Get preferences by category for a user
  async findByUserCategory(userId: string, category: string, trx?: Knex.Transaction): Promise<UserPreference[]> {
    try {
      const dbInstance = trx || db;
      
      const preferences = await dbInstance(this.tableName)
        .where({ user_id: userId, category })
        .orderBy('key');
      
      return preferences.map(preference => 
        transformRowToCamelCase<UserPreference>({
          ...preference,
          value: JSON.parse(preference.value),
        })
      );
    } catch (error) {
      log.error('Failed to find preferences by user and category', error, { userId, category });
      throw error;
    }
  }
  
  // Get preferences as a structured object
  async getPreferencesObject(userId: string, trx?: Knex.Transaction): Promise<Record<string, Record<string, any>>> {
    try {
      const preferences = await this.findByUserId(userId, trx);
      
      const preferencesObject: Record<string, Record<string, any>> = {};
      
      for (const preference of preferences) {
        if (!preferencesObject[preference.category]) {
          preferencesObject[preference.category] = {};
        }
        preferencesObject[preference.category][preference.key] = preference.value;
      }
      
      return preferencesObject;
    } catch (error) {
      log.error('Failed to get preferences object', error, { userId });
      throw error;
    }
  }
  
  // Get category preferences as an object
  async getCategoryPreferencesObject(
    userId: string,
    category: string,
    trx?: Knex.Transaction
  ): Promise<Record<string, any>> {
    try {
      const preferences = await this.findByUserCategory(userId, category, trx);
      
      const categoryPreferences: Record<string, any> = {};
      
      for (const preference of preferences) {
        categoryPreferences[preference.key] = preference.value;
      }
      
      return categoryPreferences;
    } catch (error) {
      log.error('Failed to get category preferences object', error, { userId, category });
      throw error;
    }
  }
  
  // Bulk upsert preferences
  async bulkUpsert(
    userId: string,
    preferences: UpsertPreference[],
    trx?: Knex.Transaction
  ): Promise<UserPreference[]> {
    try {
      const dbInstance = trx || db;
      const results: UserPreference[] = [];
      
      // Use transaction if not provided
      const transaction = trx || await db.transaction();
      
      try {
        for (const preference of preferences) {
          const result = await this.upsert(userId, preference, transaction);
          results.push(result);
        }
        
        // Commit transaction if we created it
        if (!trx) {
          await transaction.commit();
        }
        
        log.debug('Bulk preference upsert completed', { userId, count: preferences.length });
        
        return results;
      } catch (error) {
        // Rollback transaction if we created it
        if (!trx) {
          await transaction.rollback();
        }
        throw error;
      }
    } catch (error) {
      log.error('Failed to bulk upsert preferences', error, { userId, preferences });
      throw error;
    }
  }
  
  // Update preferences by category
  async updateCategoryPreferences(
    userId: string,
    category: string,
    preferences: Record<string, any>,
    trx?: Knex.Transaction
  ): Promise<UserPreference[]> {
    try {
      const preferenceArray: UpsertPreference[] = Object.entries(preferences).map(([key, value]) => ({
        category,
        key,
        value,
      }));
      
      return await this.bulkUpsert(userId, preferenceArray, trx);
    } catch (error) {
      log.error('Failed to update category preferences', error, { userId, category, preferences });
      throw error;
    }
  }
  
  // Delete a specific preference
  async delete(userId: string, category: string, key: string, trx?: Knex.Transaction): Promise<boolean> {
    try {
      const dbInstance = trx || db;
      
      const result = await dbInstance(this.tableName)
        .where({ user_id: userId, category, key })
        .del();
      
      const deleted = result > 0;
      
      if (deleted) {
        log.debug('Preference deleted', { userId, category, key });
      }
      
      return deleted;
    } catch (error) {
      log.error('Failed to delete preference', error, { userId, category, key });
      throw error;
    }
  }
  
  // Delete all preferences in a category for a user
  async deleteCategory(userId: string, category: string, trx?: Knex.Transaction): Promise<number> {
    try {
      const dbInstance = trx || db;
      
      const result = await dbInstance(this.tableName)
        .where({ user_id: userId, category })
        .del();
      
      log.debug('Category preferences deleted', { userId, category, deletedCount: result });
      
      return result;
    } catch (error) {
      log.error('Failed to delete category preferences', error, { userId, category });
      throw error;
    }
  }
  
  // Delete all preferences for a user
  async deleteAllUserPreferences(userId: string, trx?: Knex.Transaction): Promise<number> {
    try {
      const dbInstance = trx || db;
      
      const result = await dbInstance(this.tableName)
        .where({ user_id: userId })
        .del();
      
      log.debug('All user preferences deleted', { userId, deletedCount: result });
      
      return result;
    } catch (error) {
      log.error('Failed to delete all user preferences', error, { userId });
      throw error;
    }
  }
  
  // Get preference categories for a user
  async getUserCategories(userId: string, trx?: Knex.Transaction): Promise<string[]> {
    try {
      const dbInstance = trx || db;
      
      const categories = await dbInstance(this.tableName)
        .where({ user_id: userId })
        .distinct('category')
        .orderBy('category');
      
      return categories.map(row => row.category);
    } catch (error) {
      log.error('Failed to get user preference categories', error, { userId });
      throw error;
    }
  }
  
  // Get preference keys for a user category
  async getCategoryKeys(userId: string, category: string, trx?: Knex.Transaction): Promise<string[]> {
    try {
      const dbInstance = trx || db;
      
      const keys = await dbInstance(this.tableName)
        .where({ user_id: userId, category })
        .distinct('key')
        .orderBy('key');
      
      return keys.map(row => row.key);
    } catch (error) {
      log.error('Failed to get category preference keys', error, { userId, category });
      throw error;
    }
  }
  
  // Get preference statistics
  async getStats(trx?: Knex.Transaction): Promise<any> {
    try {
      const dbInstance = trx || db;
      
      const [stats] = await dbInstance(this.tableName)
        .select([
          dbInstance.raw('COUNT(*) as total'),
          dbInstance.raw('COUNT(DISTINCT user_id) as unique_users'),
          dbInstance.raw('COUNT(DISTINCT category) as unique_categories'),
          dbInstance.raw('COUNT(DISTINCT CONCAT(category, \'.\', key)) as unique_keys'),
        ]);
      
      const categories = await dbInstance(this.tableName)
        .select('category')
        .count('* as count')
        .groupBy('category')
        .orderBy('count', 'desc');
      
      return {
        total: parseInt(stats.total, 10),
        uniqueUsers: parseInt(stats.unique_users, 10),
        uniqueCategories: parseInt(stats.unique_categories, 10),
        uniqueKeys: parseInt(stats.unique_keys, 10),
        topCategories: categories.map(cat => ({
          category: cat.category,
          count: parseInt(cat.count as string, 10),
        })),
      };
    } catch (error) {
      log.error('Failed to get preference statistics', error);
      throw error;
    }
  }
  
  // Set default preferences for a user
  async setDefaultPreferences(userId: string, trx?: Knex.Transaction): Promise<UserPreference[]> {
    try {
      const defaultPreferences: UpsertPreference[] = [
        // Notification preferences
        { category: 'notifications', key: 'email_enabled', value: true },
        { category: 'notifications', key: 'push_enabled', value: true },
        { category: 'notifications', key: 'course_updates', value: true },
        { category: 'notifications', key: 'assignment_reminders', value: true },
        { category: 'notifications', key: 'marketing_emails', value: false },
        
        // UI preferences
        { category: 'ui', key: 'theme', value: 'light' },
        { category: 'ui', key: 'language', value: 'en' },
        { category: 'ui', key: 'timezone', value: 'UTC' },
        { category: 'ui', key: 'items_per_page', value: 20 },
        
        // Learning preferences
        { category: 'learning', key: 'auto_play_videos', value: true },
        { category: 'learning', key: 'show_subtitles', value: false },
        { category: 'learning', key: 'playback_speed', value: 1.0 },
        { category: 'learning', key: 'reminder_frequency', value: 'daily' },
        
        // Privacy preferences
        { category: 'privacy', key: 'profile_visibility', value: 'public' },
        { category: 'privacy', key: 'show_progress', value: true },
        { category: 'privacy', key: 'allow_messages', value: true },
      ];
      
      return await this.bulkUpsert(userId, defaultPreferences, trx);
    } catch (error) {
      log.error('Failed to set default preferences', error, { userId });
      throw error;
    }
  }
}

export const preferenceModel = new PreferenceModel();
