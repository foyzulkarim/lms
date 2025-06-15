import { preferenceModel } from '@/models/preference.model';
import { userCache } from '@/redis/client';
import { log } from '@/utils/logger';
import { 
  UserPreference, 
  UpsertPreference,
} from '@/types/user.types';
import { 
  NotFoundError, 
  ValidationError,
} from '@/types/api.types';

export class PreferenceService {
  // Get or create a preference
  async upsertPreference(userId: string, preferenceData: UpsertPreference): Promise<UserPreference> {
    try {
      log.debug('Upserting user preference', { 
        userId, 
        category: preferenceData.category, 
        key: preferenceData.key,
      });
      
      // Validate preference data
      this.validatePreferenceData(preferenceData);
      
      // Upsert preference
      const preference = await preferenceModel.upsert(userId, preferenceData);
      
      // Invalidate user preferences cache
      await userCache.deleteUserPreferences(userId);
      
      log.debug('User preference upserted successfully', { 
        userId, 
        category: preferenceData.category, 
        key: preferenceData.key,
      });
      
      return preference;
    } catch (error) {
      log.error('Failed to upsert user preference', error, { userId, preferenceData });
      throw error;
    }
  }
  
  // Get a specific preference
  async getPreference(userId: string, category: string, key: string): Promise<UserPreference | null> {
    try {
      const preference = await preferenceModel.findByUserCategoryKey(userId, category, key);
      
      log.debug('User preference retrieved', { userId, category, key, found: !!preference });
      
      return preference;
    } catch (error) {
      log.error('Failed to get user preference', error, { userId, category, key });
      throw error;
    }
  }
  
  // Get all preferences for a user
  async getUserPreferences(userId: string): Promise<UserPreference[]> {
    try {
      // Try to get from cache first
      const cachedPreferences = await userCache.getUserPreferences(userId);
      if (cachedPreferences) {
        log.debug('User preferences retrieved from cache', { userId });
        return cachedPreferences;
      }
      
      // Get from database
      const preferences = await preferenceModel.findByUserId(userId);
      
      // Cache the preferences
      await userCache.setUserPreferences(userId, preferences);
      
      log.debug('User preferences retrieved from database', { userId, count: preferences.length });
      
      return preferences;
    } catch (error) {
      log.error('Failed to get user preferences', error, { userId });
      throw error;
    }
  }
  
  // Get preferences by category
  async getCategoryPreferences(userId: string, category: string): Promise<UserPreference[]> {
    try {
      const preferences = await preferenceModel.findByUserCategory(userId, category);
      
      log.debug('User category preferences retrieved', { userId, category, count: preferences.length });
      
      return preferences;
    } catch (error) {
      log.error('Failed to get user category preferences', error, { userId, category });
      throw error;
    }
  }
  
  // Get preferences as a structured object
  async getPreferencesObject(userId: string): Promise<Record<string, Record<string, any>>> {
    try {
      const preferencesObject = await preferenceModel.getPreferencesObject(userId);
      
      log.debug('User preferences object retrieved', { 
        userId, 
        categories: Object.keys(preferencesObject).length,
      });
      
      return preferencesObject;
    } catch (error) {
      log.error('Failed to get user preferences object', error, { userId });
      throw error;
    }
  }
  
  // Get category preferences as an object
  async getCategoryPreferencesObject(userId: string, category: string): Promise<Record<string, any>> {
    try {
      const categoryPreferences = await preferenceModel.getCategoryPreferencesObject(userId, category);
      
      log.debug('User category preferences object retrieved', { 
        userId, 
        category, 
        keys: Object.keys(categoryPreferences).length,
      });
      
      return categoryPreferences;
    } catch (error) {
      log.error('Failed to get user category preferences object', error, { userId, category });
      throw error;
    }
  }
  
  // Bulk update preferences
  async bulkUpdatePreferences(userId: string, preferences: UpsertPreference[]): Promise<UserPreference[]> {
    try {
      log.info('Bulk updating user preferences', { userId, count: preferences.length });
      
      // Validate all preferences
      for (const preference of preferences) {
        this.validatePreferenceData(preference);
      }
      
      // Bulk upsert preferences
      const updatedPreferences = await preferenceModel.bulkUpsert(userId, preferences);
      
      // Invalidate user preferences cache
      await userCache.deleteUserPreferences(userId);
      
      log.info('User preferences bulk updated successfully', { userId, count: updatedPreferences.length });
      
      return updatedPreferences;
    } catch (error) {
      log.error('Failed to bulk update user preferences', error, { userId, preferences });
      throw error;
    }
  }
  
  // Update preferences by category
  async updateCategoryPreferences(
    userId: string, 
    category: string, 
    preferences: Record<string, any>
  ): Promise<UserPreference[]> {
    try {
      log.info('Updating user category preferences', { 
        userId, 
        category, 
        keys: Object.keys(preferences).length,
      });
      
      // Validate category
      this.validateCategory(category);
      
      // Update category preferences
      const updatedPreferences = await preferenceModel.updateCategoryPreferences(userId, category, preferences);
      
      // Invalidate user preferences cache
      await userCache.deleteUserPreferences(userId);
      
      log.info('User category preferences updated successfully', { 
        userId, 
        category, 
        count: updatedPreferences.length,
      });
      
      return updatedPreferences;
    } catch (error) {
      log.error('Failed to update user category preferences', error, { userId, category, preferences });
      throw error;
    }
  }
  
  // Delete a specific preference
  async deletePreference(userId: string, category: string, key: string): Promise<boolean> {
    try {
      log.info('Deleting user preference', { userId, category, key });
      
      const deleted = await preferenceModel.delete(userId, category, key);
      
      if (deleted) {
        // Invalidate user preferences cache
        await userCache.deleteUserPreferences(userId);
        
        log.info('User preference deleted successfully', { userId, category, key });
      } else {
        log.warn('User preference not found for deletion', { userId, category, key });
      }
      
      return deleted;
    } catch (error) {
      log.error('Failed to delete user preference', error, { userId, category, key });
      throw error;
    }
  }
  
  // Delete all preferences in a category
  async deleteCategoryPreferences(userId: string, category: string): Promise<number> {
    try {
      log.info('Deleting user category preferences', { userId, category });
      
      const deletedCount = await preferenceModel.deleteCategory(userId, category);
      
      if (deletedCount > 0) {
        // Invalidate user preferences cache
        await userCache.deleteUserPreferences(userId);
        
        log.info('User category preferences deleted successfully', { userId, category, deletedCount });
      } else {
        log.warn('No preferences found in category for deletion', { userId, category });
      }
      
      return deletedCount;
    } catch (error) {
      log.error('Failed to delete user category preferences', error, { userId, category });
      throw error;
    }
  }
  
  // Delete all preferences for a user
  async deleteAllUserPreferences(userId: string): Promise<number> {
    try {
      log.info('Deleting all user preferences', { userId });
      
      const deletedCount = await preferenceModel.deleteAllUserPreferences(userId);
      
      if (deletedCount > 0) {
        // Invalidate user preferences cache
        await userCache.deleteUserPreferences(userId);
        
        log.info('All user preferences deleted successfully', { userId, deletedCount });
      } else {
        log.warn('No preferences found for user deletion', { userId });
      }
      
      return deletedCount;
    } catch (error) {
      log.error('Failed to delete all user preferences', error, { userId });
      throw error;
    }
  }
  
  // Get preference categories for a user
  async getUserCategories(userId: string): Promise<string[]> {
    try {
      const categories = await preferenceModel.getUserCategories(userId);
      
      log.debug('User preference categories retrieved', { userId, categories });
      
      return categories;
    } catch (error) {
      log.error('Failed to get user preference categories', error, { userId });
      throw error;
    }
  }
  
  // Get preference keys for a category
  async getCategoryKeys(userId: string, category: string): Promise<string[]> {
    try {
      const keys = await preferenceModel.getCategoryKeys(userId, category);
      
      log.debug('User category preference keys retrieved', { userId, category, keys });
      
      return keys;
    } catch (error) {
      log.error('Failed to get user category preference keys', error, { userId, category });
      throw error;
    }
  }
  
  // Set default preferences for a user
  async setDefaultPreferences(userId: string): Promise<UserPreference[]> {
    try {
      log.info('Setting default preferences for user', { userId });
      
      const preferences = await preferenceModel.setDefaultPreferences(userId);
      
      // Invalidate user preferences cache
      await userCache.deleteUserPreferences(userId);
      
      log.info('Default preferences set successfully', { userId, count: preferences.length });
      
      return preferences;
    } catch (error) {
      log.error('Failed to set default preferences', error, { userId });
      throw error;
    }
  }
  
  // Get preference statistics
  async getPreferenceStats(): Promise<any> {
    try {
      const stats = await preferenceModel.getStats();
      
      log.debug('Preference statistics retrieved', { stats });
      
      return stats;
    } catch (error) {
      log.error('Failed to get preference statistics', error);
      throw error;
    }
  }
  
  // Validate preference data
  private validatePreferenceData(preferenceData: UpsertPreference): void {
    const { category, key, value } = preferenceData;
    
    // Validate category
    this.validateCategory(category);
    
    // Validate key
    if (!key || key.trim().length === 0) {
      throw new ValidationError('Preference key is required');
    }
    
    if (key.length > 100) {
      throw new ValidationError('Preference key must be 100 characters or less');
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      throw new ValidationError('Preference key can only contain letters, numbers, underscores, and hyphens');
    }
    
    // Validate value
    if (value === undefined || value === null) {
      throw new ValidationError('Preference value is required');
    }
    
    // Validate specific preference types
    this.validateSpecificPreference(category, key, value);
  }
  
  // Validate category
  private validateCategory(category: string): void {
    if (!category || category.trim().length === 0) {
      throw new ValidationError('Preference category is required');
    }
    
    if (category.length > 50) {
      throw new ValidationError('Preference category must be 50 characters or less');
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(category)) {
      throw new ValidationError('Preference category can only contain letters, numbers, underscores, and hyphens');
    }
    
    // Validate allowed categories
    const allowedCategories = [
      'notifications',
      'ui',
      'learning',
      'privacy',
      'accessibility',
      'security',
    ];
    
    if (!allowedCategories.includes(category)) {
      throw new ValidationError(`Invalid preference category. Allowed categories: ${allowedCategories.join(', ')}`);
    }
  }
  
  // Validate specific preference types
  private validateSpecificPreference(category: string, key: string, value: any): void {
    switch (category) {
      case 'notifications':
        this.validateNotificationPreference(key, value);
        break;
      case 'ui':
        this.validateUIPreference(key, value);
        break;
      case 'learning':
        this.validateLearningPreference(key, value);
        break;
      case 'privacy':
        this.validatePrivacyPreference(key, value);
        break;
      default:
        // Generic validation for other categories
        break;
    }
  }
  
  // Validate notification preferences
  private validateNotificationPreference(key: string, value: any): void {
    const booleanKeys = ['email_enabled', 'push_enabled', 'course_updates', 'assignment_reminders', 'marketing_emails'];
    
    if (booleanKeys.includes(key) && typeof value !== 'boolean') {
      throw new ValidationError(`Notification preference '${key}' must be a boolean`);
    }
  }
  
  // Validate UI preferences
  private validateUIPreference(key: string, value: any): void {
    switch (key) {
      case 'theme':
        if (!['light', 'dark', 'auto'].includes(value)) {
          throw new ValidationError("UI theme must be 'light', 'dark', or 'auto'");
        }
        break;
      case 'language':
        if (typeof value !== 'string' || value.length !== 2) {
          throw new ValidationError('UI language must be a 2-character language code');
        }
        break;
      case 'items_per_page':
        if (typeof value !== 'number' || value < 5 || value > 100) {
          throw new ValidationError('Items per page must be a number between 5 and 100');
        }
        break;
    }
  }
  
  // Validate learning preferences
  private validateLearningPreference(key: string, value: any): void {
    switch (key) {
      case 'auto_play_videos':
      case 'show_subtitles':
        if (typeof value !== 'boolean') {
          throw new ValidationError(`Learning preference '${key}' must be a boolean`);
        }
        break;
      case 'playback_speed':
        if (typeof value !== 'number' || value < 0.5 || value > 2.0) {
          throw new ValidationError('Playback speed must be a number between 0.5 and 2.0');
        }
        break;
      case 'reminder_frequency':
        if (!['never', 'daily', 'weekly', 'monthly'].includes(value)) {
          throw new ValidationError("Reminder frequency must be 'never', 'daily', 'weekly', or 'monthly'");
        }
        break;
    }
  }
  
  // Validate privacy preferences
  private validatePrivacyPreference(key: string, value: any): void {
    switch (key) {
      case 'profile_visibility':
        if (!['public', 'private', 'friends'].includes(value)) {
          throw new ValidationError("Profile visibility must be 'public', 'private', or 'friends'");
        }
        break;
      case 'show_progress':
      case 'allow_messages':
        if (typeof value !== 'boolean') {
          throw new ValidationError(`Privacy preference '${key}' must be a boolean`);
        }
        break;
    }
  }
}

export const preferenceService = new PreferenceService();
