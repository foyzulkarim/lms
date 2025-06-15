import { getDatabase } from '../database';
import { Course, CreateCourse, UpdateCourse, CourseQuery, CourseStatus } from '../types/course';
import { v4 as uuidv4 } from 'uuid';
import slugify from 'slugify';

const TABLE_NAME = 'courses';

export class CourseModel {
  static async create(courseData: CreateCourse, instructorId: string, instructorName: string, instructorEmail: string): Promise<Course> {
    const db = getDatabase();
    
    const slug = await this.generateUniqueSlug(courseData.title);
    
    const [course] = await db(TABLE_NAME)
      .insert({
        id: uuidv4(),
        title: courseData.title,
        slug,
        description: courseData.description,
        shortDescription: courseData.shortDescription,
        status: 'draft',
        difficulty: courseData.difficulty,
        estimatedDuration: courseData.estimatedDuration,
        price: courseData.price,
        currency: courseData.currency || 'USD',
        language: courseData.language || 'en',
        tags: JSON.stringify(courseData.tags || []),
        categories: JSON.stringify(courseData.categories || []),
        prerequisites: JSON.stringify(courseData.prerequisites || []),
        learningObjectives: JSON.stringify(courseData.learningObjectives || []),
        instructorId,
        instructorName,
        instructorEmail,
        enrollmentCount: 0,
        rating: 0,
        reviewCount: 0,
        isPublic: courseData.isPublic ?? true,
        allowEnrollment: courseData.allowEnrollment ?? true,
        certificateEnabled: courseData.certificateEnabled ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning('*');

    return this.formatCourse(course);
  }

  static async findById(id: string): Promise<Course | null> {
    const db = getDatabase();
    const course = await db(TABLE_NAME)
      .where({ id })
      .first();

    return course ? this.formatCourse(course) : null;
  }

  static async findBySlug(slug: string): Promise<Course | null> {
    const db = getDatabase();
    const course = await db(TABLE_NAME)
      .where({ slug })
      .first();

    return course ? this.formatCourse(course) : null;
  }

  static async findByInstructor(instructorId: string, query: Partial<CourseQuery> = {}): Promise<{ courses: Course[]; total: number }> {
    const db = getDatabase();
    const { page = 1, limit = 20, status, search } = query;
    const offset = (page - 1) * limit;

    let queryBuilder = db(TABLE_NAME)
      .where({ instructorId });

    if (status) {
      queryBuilder = queryBuilder.where({ status });
    }

    if (search) {
      queryBuilder = queryBuilder.where(function() {
        this.where('title', 'ilike', `%${search}%`)
          .orWhere('description', 'ilike', `%${search}%`);
      });
    }

    const [courses, [{ count }]] = await Promise.all([
      queryBuilder
        .clone()
        .orderBy('updatedAt', 'desc')
        .limit(limit)
        .offset(offset),
      queryBuilder.clone().count('* as count')
    ]);

    return {
      courses: courses.map(this.formatCourse),
      total: parseInt(count as string),
    };
  }

  static async findPublished(query: CourseQuery): Promise<{ courses: Course[]; total: number }> {
    const db = getDatabase();
    const { 
      page = 1, 
      limit = 20, 
      search, 
      category, 
      difficulty, 
      tags, 
      minPrice, 
      maxPrice,
      sortBy = 'updatedAt',
      sortOrder = 'desc'
    } = query;
    const offset = (page - 1) * limit;

    let queryBuilder = db(TABLE_NAME)
      .where({ status: 'published', isPublic: true });

    if (search) {
      queryBuilder = queryBuilder.where(function() {
        this.where('title', 'ilike', `%${search}%`)
          .orWhere('description', 'ilike', `%${search}%`)
          .orWhere('shortDescription', 'ilike', `%${search}%`);
      });
    }

    if (category) {
      queryBuilder = queryBuilder.whereRaw('categories::text ILIKE ?', [`%"${category}"%`]);
    }

    if (difficulty) {
      queryBuilder = queryBuilder.where({ difficulty });
    }

    if (tags) {
      const tagList = tags.split(',').map(tag => tag.trim());
      for (const tag of tagList) {
        queryBuilder = queryBuilder.whereRaw('tags::text ILIKE ?', [`%"${tag}"%`]);
      }
    }

    if (minPrice !== undefined) {
      queryBuilder = queryBuilder.where('price', '>=', minPrice);
    }

    if (maxPrice !== undefined) {
      queryBuilder = queryBuilder.where('price', '<=', maxPrice);
    }

    const [courses, [{ count }]] = await Promise.all([
      queryBuilder
        .clone()
        .orderBy(sortBy, sortOrder)
        .limit(limit)
        .offset(offset),
      queryBuilder.clone().count('* as count')
    ]);

    return {
      courses: courses.map(this.formatCourse),
      total: parseInt(count as string),
    };
  }

  static async update(id: string, courseData: UpdateCourse): Promise<Course | null> {
    const db = getDatabase();
    
    const updateData: any = {
      ...courseData,
      updatedAt: new Date(),
    };

    // Generate new slug if title is being updated
    if (courseData.title) {
      updateData.slug = await this.generateUniqueSlug(courseData.title, id);
    }

    // Convert arrays to JSON strings
    if (courseData.tags) {
      updateData.tags = JSON.stringify(courseData.tags);
    }
    if (courseData.categories) {
      updateData.categories = JSON.stringify(courseData.categories);
    }
    if (courseData.prerequisites) {
      updateData.prerequisites = JSON.stringify(courseData.prerequisites);
    }
    if (courseData.learningObjectives) {
      updateData.learningObjectives = JSON.stringify(courseData.learningObjectives);
    }

    const [course] = await db(TABLE_NAME)
      .where({ id })
      .update(updateData)
      .returning('*');

    return course ? this.formatCourse(course) : null;
  }

  static async updateStatus(id: string, status: CourseStatus): Promise<Course | null> {
    const db = getDatabase();
    
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'published') {
      updateData.publishedAt = new Date();
    }

    const [course] = await db(TABLE_NAME)
      .where({ id })
      .update(updateData)
      .returning('*');

    return course ? this.formatCourse(course) : null;
  }

  static async updateEnrollmentCount(id: string, increment: number = 1): Promise<boolean> {
    const db = getDatabase();
    
    const result = await db(TABLE_NAME)
      .where({ id })
      .increment('enrollmentCount', increment)
      .update({ updatedAt: new Date() });

    return result > 0;
  }

  static async updateRating(id: string, rating: number, reviewCount: number): Promise<boolean> {
    const db = getDatabase();
    
    const result = await db(TABLE_NAME)
      .where({ id })
      .update({
        rating,
        reviewCount,
        updatedAt: new Date(),
      });

    return result > 0;
  }

  static async delete(id: string): Promise<boolean> {
    const db = getDatabase();
    const result = await db(TABLE_NAME)
      .where({ id })
      .del();

    return result > 0;
  }

  static async exists(id: string): Promise<boolean> {
    const db = getDatabase();
    const course = await db(TABLE_NAME)
      .where({ id })
      .first();

    return !!course;
  }

  static async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const db = getDatabase();
    let query = db(TABLE_NAME).where({ slug });
    
    if (excludeId) {
      query = query.whereNot({ id: excludeId });
    }
    
    const course = await query.first();
    return !!course;
  }

  private static async generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
    let baseSlug = slugify(title, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 1;

    while (await this.slugExists(slug, excludeId)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  private static formatCourse(course: any): Course {
    return {
      ...course,
      tags: typeof course.tags === 'string' ? JSON.parse(course.tags) : course.tags || [],
      categories: typeof course.categories === 'string' ? JSON.parse(course.categories) : course.categories || [],
      prerequisites: typeof course.prerequisites === 'string' ? JSON.parse(course.prerequisites) : course.prerequisites || [],
      learningObjectives: typeof course.learningObjectives === 'string' ? JSON.parse(course.learningObjectives) : course.learningObjectives || [],
      createdAt: course.createdAt.toISOString(),
      updatedAt: course.updatedAt.toISOString(),
      publishedAt: course.publishedAt ? course.publishedAt.toISOString() : undefined,
    };
  }
}
