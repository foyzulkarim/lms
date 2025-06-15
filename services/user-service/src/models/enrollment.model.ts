import { Knex } from 'knex';
import { db, transformRowToCamelCase, transformObjectToSnakeCase, buildPaginationQuery, buildSortQuery } from '@/database/connection';
import { UserEnrollment, CreateEnrollment, UpdateEnrollment, Pagination, UserEnrollmentRow, EnrollmentStatusType } from '@/types/user.types';
import { log } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class EnrollmentModel {
  private tableName = 'user_enrollments';
  
  // Create a new enrollment
  async create(userId: string, enrollmentData: CreateEnrollment, trx?: Knex.Transaction): Promise<UserEnrollment> {
    try {
      const dbInstance = trx || db;
      const id = uuidv4();
      
      const enrollmentRow = transformObjectToSnakeCase({
        id,
        userId,
        ...enrollmentData,
        enrollmentStatus: 'active',
        progress: 0,
        enrolledAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      const [createdEnrollment] = await dbInstance(this.tableName)
        .insert(enrollmentRow)
        .returning('*');
      
      log.debug('Enrollment created in database', { enrollmentId: id, userId, courseId: enrollmentData.courseId });
      
      return transformRowToCamelCase<UserEnrollment>(createdEnrollment);
    } catch (error) {
      log.error('Failed to create enrollment in database', error, { userId, enrollmentData });
      throw error;
    }
  }
  
  // Find enrollment by ID
  async findById(id: string, trx?: Knex.Transaction): Promise<UserEnrollment | null> {
    try {
      const dbInstance = trx || db;
      
      const enrollment = await dbInstance(this.tableName)
        .where({ id })
        .first();
      
      if (!enrollment) {
        return null;
      }
      
      return transformRowToCamelCase<UserEnrollment>(enrollment);
    } catch (error) {
      log.error('Failed to find enrollment by ID', error, { enrollmentId: id });
      throw error;
    }
  }
  
  // Find enrollment by user and course
  async findByUserAndCourse(userId: string, courseId: string, trx?: Knex.Transaction): Promise<UserEnrollment | null> {
    try {
      const dbInstance = trx || db;
      
      const enrollment = await dbInstance(this.tableName)
        .where({ user_id: userId, course_id: courseId })
        .first();
      
      if (!enrollment) {
        return null;
      }
      
      return transformRowToCamelCase<UserEnrollment>(enrollment);
    } catch (error) {
      log.error('Failed to find enrollment by user and course', error, { userId, courseId });
      throw error;
    }
  }
  
  // Get user enrollments with pagination
  async findByUserId(
    userId: string,
    page: number = 1,
    limit: number = 20,
    status?: EnrollmentStatusType,
    trx?: Knex.Transaction
  ): Promise<{ enrollments: UserEnrollment[]; pagination: Pagination }> {
    try {
      const dbInstance = trx || db;
      
      // Build base query
      let query = dbInstance(this.tableName)
        .where({ user_id: userId });
      
      // Apply status filter
      if (status) {
        query = query.where({ enrollment_status: status });
      }
      
      // Get total count
      const totalQuery = query.clone();
      const [{ count }] = await totalQuery.count('* as count');
      const total = parseInt(count as string, 10);
      
      // Apply sorting and pagination
      query = query.orderBy('enrolled_at', 'desc');
      query = buildPaginationQuery(query, page, limit);
      
      // Execute query
      const enrollments = await query;
      
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
      
      log.debug('User enrollments retrieved', { userId, resultCount: enrollments.length, total });
      
      return {
        enrollments: enrollments.map(enrollment => transformRowToCamelCase<UserEnrollment>(enrollment)),
        pagination,
      };
    } catch (error) {
      log.error('Failed to find enrollments by user ID', error, { userId });
      throw error;
    }
  }
  
  // Get course enrollments
  async findByCourseId(
    courseId: string,
    page: number = 1,
    limit: number = 20,
    status?: EnrollmentStatusType,
    trx?: Knex.Transaction
  ): Promise<{ enrollments: UserEnrollment[]; pagination: Pagination }> {
    try {
      const dbInstance = trx || db;
      
      // Build base query
      let query = dbInstance(this.tableName)
        .where({ course_id: courseId });
      
      // Apply status filter
      if (status) {
        query = query.where({ enrollment_status: status });
      }
      
      // Get total count
      const totalQuery = query.clone();
      const [{ count }] = await totalQuery.count('* as count');
      const total = parseInt(count as string, 10);
      
      // Apply sorting and pagination
      query = query.orderBy('enrolled_at', 'desc');
      query = buildPaginationQuery(query, page, limit);
      
      // Execute query
      const enrollments = await query;
      
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
      
      log.debug('Course enrollments retrieved', { courseId, resultCount: enrollments.length, total });
      
      return {
        enrollments: enrollments.map(enrollment => transformRowToCamelCase<UserEnrollment>(enrollment)),
        pagination,
      };
    } catch (error) {
      log.error('Failed to find enrollments by course ID', error, { courseId });
      throw error;
    }
  }
  
  // Update enrollment
  async update(id: string, updates: UpdateEnrollment, trx?: Knex.Transaction): Promise<UserEnrollment | null> {
    try {
      const dbInstance = trx || db;
      
      const updateData = transformObjectToSnakeCase({
        ...updates,
        updatedAt: new Date(),
      });
      
      // If marking as completed, set completed_at timestamp
      if (updates.enrollmentStatus === 'completed') {
        updateData.completed_at = new Date();
      }
      
      const [updatedEnrollment] = await dbInstance(this.tableName)
        .where({ id })
        .update(updateData)
        .returning('*');
      
      if (!updatedEnrollment) {
        return null;
      }
      
      log.debug('Enrollment updated in database', { enrollmentId: id });
      
      return transformRowToCamelCase<UserEnrollment>(updatedEnrollment);
    } catch (error) {
      log.error('Failed to update enrollment', error, { enrollmentId: id, updates });
      throw error;
    }
  }
  
  // Update enrollment progress
  async updateProgress(id: string, progress: number, trx?: Knex.Transaction): Promise<UserEnrollment | null> {
    try {
      const dbInstance = trx || db;
      
      const updateData: any = {
        progress,
        last_accessed_at: new Date(),
        updated_at: new Date(),
      };
      
      // If progress is 100%, mark as completed
      if (progress >= 100) {
        updateData.enrollment_status = 'completed';
        updateData.completed_at = new Date();
      }
      
      const [updatedEnrollment] = await dbInstance(this.tableName)
        .where({ id })
        .update(updateData)
        .returning('*');
      
      if (!updatedEnrollment) {
        return null;
      }
      
      log.debug('Enrollment progress updated', { enrollmentId: id, progress });
      
      return transformRowToCamelCase<UserEnrollment>(updatedEnrollment);
    } catch (error) {
      log.error('Failed to update enrollment progress', error, { enrollmentId: id, progress });
      throw error;
    }
  }
  
  // Update last accessed timestamp
  async updateLastAccessed(id: string, trx?: Knex.Transaction): Promise<void> {
    try {
      const dbInstance = trx || db;
      
      await dbInstance(this.tableName)
        .where({ id })
        .update({
          last_accessed_at: new Date(),
          updated_at: new Date(),
        });
      
      log.debug('Enrollment last accessed updated', { enrollmentId: id });
    } catch (error) {
      log.error('Failed to update enrollment last accessed', error, { enrollmentId: id });
      throw error;
    }
  }
  
  // Delete enrollment
  async delete(id: string, trx?: Knex.Transaction): Promise<boolean> {
    try {
      const dbInstance = trx || db;
      
      const result = await dbInstance(this.tableName)
        .where({ id })
        .del();
      
      const deleted = result > 0;
      
      if (deleted) {
        log.debug('Enrollment deleted', { enrollmentId: id });
      }
      
      return deleted;
    } catch (error) {
      log.error('Failed to delete enrollment', error, { enrollmentId: id });
      throw error;
    }
  }
  
  // Get enrollment statistics for a user
  async getUserEnrollmentStats(userId: string, trx?: Knex.Transaction): Promise<any> {
    try {
      const dbInstance = trx || db;
      
      const [stats] = await dbInstance(this.tableName)
        .where({ user_id: userId })
        .select([
          dbInstance.raw('COUNT(*) as total'),
          dbInstance.raw("COUNT(*) FILTER (WHERE enrollment_status = 'active') as active"),
          dbInstance.raw("COUNT(*) FILTER (WHERE enrollment_status = 'completed') as completed"),
          dbInstance.raw("COUNT(*) FILTER (WHERE enrollment_status = 'dropped') as dropped"),
          dbInstance.raw("COUNT(*) FILTER (WHERE enrollment_status = 'suspended') as suspended"),
          dbInstance.raw('AVG(progress) as average_progress'),
          dbInstance.raw('SUM(progress) as total_progress'),
          dbInstance.raw('MAX(last_accessed_at) as last_accessed'),
        ]);
      
      return {
        total: parseInt(stats.total, 10),
        active: parseInt(stats.active, 10),
        completed: parseInt(stats.completed, 10),
        dropped: parseInt(stats.dropped, 10),
        suspended: parseInt(stats.suspended, 10),
        averageProgress: parseFloat(stats.average_progress) || 0,
        totalProgress: parseFloat(stats.total_progress) || 0,
        lastAccessed: stats.last_accessed,
      };
    } catch (error) {
      log.error('Failed to get user enrollment statistics', error, { userId });
      throw error;
    }
  }
  
  // Get enrollment statistics for a course
  async getCourseEnrollmentStats(courseId: string, trx?: Knex.Transaction): Promise<any> {
    try {
      const dbInstance = trx || db;
      
      const [stats] = await dbInstance(this.tableName)
        .where({ course_id: courseId })
        .select([
          dbInstance.raw('COUNT(*) as total'),
          dbInstance.raw("COUNT(*) FILTER (WHERE enrollment_status = 'active') as active"),
          dbInstance.raw("COUNT(*) FILTER (WHERE enrollment_status = 'completed') as completed"),
          dbInstance.raw("COUNT(*) FILTER (WHERE enrollment_status = 'dropped') as dropped"),
          dbInstance.raw("COUNT(*) FILTER (WHERE enrollment_status = 'suspended') as suspended"),
          dbInstance.raw('AVG(progress) as average_progress'),
          dbInstance.raw('COUNT(*) FILTER (WHERE progress = 100) as fully_completed'),
        ]);
      
      return {
        total: parseInt(stats.total, 10),
        active: parseInt(stats.active, 10),
        completed: parseInt(stats.completed, 10),
        dropped: parseInt(stats.dropped, 10),
        suspended: parseInt(stats.suspended, 10),
        averageProgress: parseFloat(stats.average_progress) || 0,
        fullyCompleted: parseInt(stats.fully_completed, 10),
      };
    } catch (error) {
      log.error('Failed to get course enrollment statistics', error, { courseId });
      throw error;
    }
  }
  
  // Get overall enrollment statistics
  async getOverallStats(trx?: Knex.Transaction): Promise<any> {
    try {
      const dbInstance = trx || db;
      
      const [stats] = await dbInstance(this.tableName)
        .select([
          dbInstance.raw('COUNT(*) as total'),
          dbInstance.raw("COUNT(*) FILTER (WHERE enrollment_status = 'active') as active"),
          dbInstance.raw("COUNT(*) FILTER (WHERE enrollment_status = 'completed') as completed"),
          dbInstance.raw("COUNT(*) FILTER (WHERE enrollment_status = 'dropped') as dropped"),
          dbInstance.raw("COUNT(*) FILTER (WHERE enrollment_status = 'suspended') as suspended"),
          dbInstance.raw('AVG(progress) as average_progress'),
          dbInstance.raw('COUNT(DISTINCT user_id) as unique_users'),
          dbInstance.raw('COUNT(DISTINCT course_id) as unique_courses'),
        ]);
      
      return {
        total: parseInt(stats.total, 10),
        active: parseInt(stats.active, 10),
        completed: parseInt(stats.completed, 10),
        dropped: parseInt(stats.dropped, 10),
        suspended: parseInt(stats.suspended, 10),
        averageProgress: parseFloat(stats.average_progress) || 0,
        uniqueUsers: parseInt(stats.unique_users, 10),
        uniqueCourses: parseInt(stats.unique_courses, 10),
      };
    } catch (error) {
      log.error('Failed to get overall enrollment statistics', error);
      throw error;
    }
  }
  
  // Check if user is enrolled in course
  async isUserEnrolled(userId: string, courseId: string, trx?: Knex.Transaction): Promise<boolean> {
    try {
      const dbInstance = trx || db;
      
      const enrollment = await dbInstance(this.tableName)
        .where({ user_id: userId, course_id: courseId })
        .first();
      
      return !!enrollment;
    } catch (error) {
      log.error('Failed to check user enrollment', error, { userId, courseId });
      throw error;
    }
  }
  
  // Get active enrollments for a user
  async getActiveEnrollments(userId: string, trx?: Knex.Transaction): Promise<UserEnrollment[]> {
    try {
      const dbInstance = trx || db;
      
      const enrollments = await dbInstance(this.tableName)
        .where({ user_id: userId, enrollment_status: 'active' })
        .orderBy('last_accessed_at', 'desc');
      
      return enrollments.map(enrollment => transformRowToCamelCase<UserEnrollment>(enrollment));
    } catch (error) {
      log.error('Failed to get active enrollments', error, { userId });
      throw error;
    }
  }
  
  // Get completed enrollments for a user
  async getCompletedEnrollments(userId: string, trx?: Knex.Transaction): Promise<UserEnrollment[]> {
    try {
      const dbInstance = trx || db;
      
      const enrollments = await dbInstance(this.tableName)
        .where({ user_id: userId, enrollment_status: 'completed' })
        .orderBy('completed_at', 'desc');
      
      return enrollments.map(enrollment => transformRowToCamelCase<UserEnrollment>(enrollment));
    } catch (error) {
      log.error('Failed to get completed enrollments', error, { userId });
      throw error;
    }
  }
}

export const enrollmentModel = new EnrollmentModel();
