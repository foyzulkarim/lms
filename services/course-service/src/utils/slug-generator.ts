import slugify from 'slugify';
import { getDatabase } from '../database/connection';
import { logger } from './logger';

// Slug generation options
const SLUG_OPTIONS = {
  lower: true,
  strict: true,
  remove: /[*+~.()'"!:@]/g,
};

// Generate base slug from text
export const generateBaseSlug = (text: string): string => {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return slugify(text.trim(), SLUG_OPTIONS);
};

// Generate unique slug for courses
export const generateCourseSlug = async (title: string, excludeId?: string): Promise<string> => {
  try {
    const baseSlug = generateBaseSlug(title);
    
    if (!baseSlug) {
      throw new Error('Cannot generate slug from empty title');
    }

    const db = getDatabase();
    let slug = baseSlug;
    let counter = 0;

    // Check if slug exists and generate unique one
    while (true) {
      const query = db('courses').where('slug', slug);
      
      if (excludeId) {
        query.whereNot('id', excludeId);
      }

      const existing = await query.first();
      
      if (!existing) {
        break;
      }

      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    logger.debug('Generated course slug:', { title, slug });
    return slug;
  } catch (error) {
    logger.error('Error generating course slug:', error);
    throw new Error('Failed to generate unique course slug');
  }
};

// Generate unique slug for lessons within a course
export const generateLessonSlug = async (
  title: string,
  courseId: string,
  excludeId?: string
): Promise<string> => {
  try {
    const baseSlug = generateBaseSlug(title);
    
    if (!baseSlug) {
      throw new Error('Cannot generate slug from empty title');
    }

    const db = getDatabase();
    let slug = baseSlug;
    let counter = 0;

    // Check if slug exists within the course
    while (true) {
      const query = db('course_lessons')
        .where('course_id', courseId)
        .where('slug', slug);
      
      if (excludeId) {
        query.whereNot('id', excludeId);
      }

      const existing = await query.first();
      
      if (!existing) {
        break;
      }

      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    logger.debug('Generated lesson slug:', { title, courseId, slug });
    return slug;
  } catch (error) {
    logger.error('Error generating lesson slug:', error);
    throw new Error('Failed to generate unique lesson slug');
  }
};

// Generate unique slug for categories
export const generateCategorySlug = async (name: string, excludeId?: string): Promise<string> => {
  try {
    const baseSlug = generateBaseSlug(name);
    
    if (!baseSlug) {
      throw new Error('Cannot generate slug from empty name');
    }

    const db = getDatabase();
    let slug = baseSlug;
    let counter = 0;

    // Check if slug exists
    while (true) {
      const query = db('course_categories').where('slug', slug);
      
      if (excludeId) {
        query.whereNot('id', excludeId);
      }

      const existing = await query.first();
      
      if (!existing) {
        break;
      }

      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    logger.debug('Generated category slug:', { name, slug });
    return slug;
  } catch (error) {
    logger.error('Error generating category slug:', error);
    throw new Error('Failed to generate unique category slug');
  }
};

// Validate slug format
export const validateSlug = (slug: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!slug || typeof slug !== 'string') {
    errors.push('Slug must be a non-empty string');
    return { isValid: false, errors };
  }

  // Check length
  if (slug.length < 1) {
    errors.push('Slug cannot be empty');
  }

  if (slug.length > 100) {
    errors.push('Slug cannot exceed 100 characters');
  }

  // Check format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    errors.push('Slug can only contain lowercase letters, numbers, and hyphens');
  }

  // Check for consecutive hyphens
  if (slug.includes('--')) {
    errors.push('Slug cannot contain consecutive hyphens');
  }

  // Check start/end with hyphen
  if (slug.startsWith('-') || slug.endsWith('-')) {
    errors.push('Slug cannot start or end with a hyphen');
  }

  // Check reserved words
  const reservedWords = [
    'admin', 'api', 'www', 'mail', 'ftp', 'localhost',
    'create', 'edit', 'delete', 'update', 'new',
    'search', 'help', 'about', 'contact', 'terms',
    'privacy', 'login', 'logout', 'register', 'signup',
  ];

  if (reservedWords.includes(slug)) {
    errors.push('Slug cannot be a reserved word');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Sanitize slug input
export const sanitizeSlug = (input: string): string => {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-\s]/g, '') // Remove invalid characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
};

// Generate slug from multiple fields
export const generateSlugFromFields = (fields: string[], separator: string = '-'): string => {
  const validFields = fields
    .filter(field => field && typeof field === 'string')
    .map(field => generateBaseSlug(field))
    .filter(slug => slug.length > 0);

  return validFields.join(separator);
};

// Check if slug is available
export const isSlugAvailable = async (
  tableName: string,
  slug: string,
  excludeId?: string
): Promise<boolean> => {
  try {
    const db = getDatabase();
    const query = db(tableName).where('slug', slug);
    
    if (excludeId) {
      query.whereNot('id', excludeId);
    }

    const existing = await query.first();
    return !existing;
  } catch (error) {
    logger.error('Error checking slug availability:', error);
    return false;
  }
};

// Suggest alternative slugs
export const suggestAlternativeSlugs = async (
  tableName: string,
  baseSlug: string,
  count: number = 5
): Promise<string[]> => {
  try {
    const suggestions: string[] = [];
    const db = getDatabase();

    // Get existing slugs with similar pattern
    const existingSlugs = await db(tableName)
      .where('slug', 'like', `${baseSlug}%`)
      .pluck('slug');

    const existingSet = new Set(existingSlugs);

    // Generate numbered alternatives
    for (let i = 1; suggestions.length < count; i++) {
      const candidate = `${baseSlug}-${i}`;
      if (!existingSet.has(candidate)) {
        suggestions.push(candidate);
      }
    }

    return suggestions;
  } catch (error) {
    logger.error('Error suggesting alternative slugs:', error);
    return [];
  }
};

export default {
  generateBaseSlug,
  generateCourseSlug,
  generateLessonSlug,
  generateCategorySlug,
  validateSlug,
  sanitizeSlug,
  generateSlugFromFields,
  isSlugAvailable,
  suggestAlternativeSlugs,
};
