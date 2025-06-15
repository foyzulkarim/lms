import { enrollmentModel } from '@/models/enrollment.model';
import { userCache } from '@/redis/client';
import { eventPublisher } from '@/rabbitmq/connection';
import { log } from '@/utils/logger';
import { 
  UserEnrollment, 
  CreateEnrollment, 
  UpdateEnrollment, 
  PaginatedEnrollments,
  EnrollmentStats,
  EnrollmentStatusType,
} from '@/types/user.types';
import { 
  NotFoundError, 
  ConflictError, 
  ValidationError,
} from '@/types/api.types';
import { v4 as uuidv4 } from 'uuid';

export class EnrollmentService {
  // Enroll user in a course
  async enrollUser(userId: string, enrollmentData: CreateEnrollment): Promise<UserEnrollment> {
    try {
      log.info('Enrolling user in course', { userId, courseId: enrollmentData.courseId });
      
      // Check if user is already enrolled
      const existingEnrollment = await enrollmentModel.findByUserAndCourse(userId, enrollmentData.courseId);
      if (existingEnrollment) {
        throw new ConflictError('User is already enrolled in this course');
      }
      
      // Create enrollment
      const enrollment = await enrollmentModel.create(userId, enrollmentData);
      
      // Invalidate user enrollments cache
      await userCache.deleteUserEnrollments(userId);
      
      // Publish enrollment event
      await eventPublisher.publishEnrollmentEvent({
        type: 'user.enrolled',
        data: {
          userId,
          courseId: enrollmentData.courseId,
          enrollmentId: enrollment.id,
          enrolledAt: enrollment.enrolledAt,
        },
        correlationId: uuidv4(),
      });
      
      log.info('User enrolled successfully', { 
        userId, 
        courseId: enrollmentData.courseId,
        enrollmentId: enrollment.id,
      });
      
      return enrollment;
    } catch (error) {
      log.error('Failed to enroll user', error, { userId, enrollmentData });
      throw error;
    }
  }
  
  // Unenroll user from a course
  async unenrollUser(userId: string, courseId: string): Promise<boolean> {
    try {
      log.info('Unenrolling user from course', { userId, courseId });
      
      // Find enrollment
      const enrollment = await enrollmentModel.findByUserAndCourse(userId, courseId);
      if (!enrollment) {
        throw new NotFoundError('Enrollment not found');
      }
      
      // Delete enrollment
      const deleted = await enrollmentModel.delete(enrollment.id);
      
      // Invalidate user enrollments cache
      await userCache.deleteUserEnrollments(userId);
      
      // Publish unenrollment event
      await eventPublisher.publishEnrollmentEvent({
        type: 'user.unenrolled',
        data: {
          userId,
          courseId,
          enrollmentId: enrollment.id,
        },
        correlationId: uuidv4(),
      });
      
      log.info('User unenrolled successfully', { userId, courseId });
      
      return deleted;
    } catch (error) {
      log.error('Failed to unenroll user', error, { userId, courseId });
      throw error;
    }
  }
  
  // Get user enrollments
  async getUserEnrollments(
    userId: string,
    page: number = 1,
    limit: number = 20,
    status?: EnrollmentStatusType
  ): Promise<PaginatedEnrollments> {
    try {
      // Try to get from cache first (only for first page without filters)
      if (page === 1 && limit === 20 && !status) {
        const cachedEnrollments = await userCache.getUserEnrollments(userId);
        if (cachedEnrollments) {
          log.debug('User enrollments retrieved from cache', { userId });
          return cachedEnrollments;
        }
      }
      
      // Get from database
      const result = await enrollmentModel.findByUserId(userId, page, limit, status);
      
      // Cache the result (only for first page without filters)
      if (page === 1 && limit === 20 && !status) {
        await userCache.setUserEnrollments(userId, result);
      }
      
      log.debug('User enrollments retrieved', { 
        userId, 
        resultCount: result.enrollments.length,
        total: result.pagination.total,
      });
      
      return result;
    } catch (error) {
      log.error('Failed to get user enrollments', error, { userId });
      throw error;
    }
  }
  
  // Get course enrollments
  async getCourseEnrollments(
    courseId: string,
    page: number = 1,
    limit: number = 20,
    status?: EnrollmentStatusType
  ): Promise<PaginatedEnrollments> {
    try {
      const result = await enrollmentModel.findByCourseId(courseId, page, limit, status);
      
      log.debug('Course enrollments retrieved', { 
        courseId, 
        resultCount: result.enrollments.length,
        total: result.pagination.total,
      });
      
      return result;
    } catch (error) {
      log.error('Failed to get course enrollments', error, { courseId });
      throw error;
    }
  }
  
  // Update enrollment
  async updateEnrollment(enrollmentId: string, updates: UpdateEnrollment): Promise<UserEnrollment> {
    try {
      log.info('Updating enrollment', { enrollmentId, updates });
      
      // Get current enrollment
      const currentEnrollment = await enrollmentModel.findById(enrollmentId);
      if (!currentEnrollment) {
        throw new NotFoundError('Enrollment', enrollmentId);
      }
      
      // Update enrollment
      const updatedEnrollment = await enrollmentModel.update(enrollmentId, updates);
      if (!updatedEnrollment) {
        throw new NotFoundError('Enrollment', enrollmentId);
      }
      
      // Invalidate user enrollments cache
      await userCache.deleteUserEnrollments(updatedEnrollment.userId);
      
      // Publish appropriate events based on status change
      if (updates.enrollmentStatus && updates.enrollmentStatus !== currentEnrollment.enrollmentStatus) {
        if (updates.enrollmentStatus === 'completed') {
          await eventPublisher.publishEnrollmentEvent({
            type: 'user.course_completed',
            data: {
              userId: updatedEnrollment.userId,
              courseId: updatedEnrollment.courseId,
              enrollmentId: updatedEnrollment.id,
              completedAt: updatedEnrollment.completedAt,
              progress: updatedEnrollment.progress,
            },
            correlationId: uuidv4(),
          });
        }
      }
      
      log.info('Enrollment updated successfully', { enrollmentId });
      
      return updatedEnrollment;
    } catch (error) {
      log.error('Failed to update enrollment', error, { enrollmentId, updates });
      throw error;
    }
  }
  
  // Update enrollment progress
  async updateProgress(enrollmentId: string, progress: number): Promise<UserEnrollment> {
    try {
      log.info('Updating enrollment progress', { enrollmentId, progress });
      
      // Validate progress
      if (progress < 0 || progress > 100) {
        throw new ValidationError('Progress must be between 0 and 100');
      }
      
      // Get current enrollment
      const currentEnrollment = await enrollmentModel.findById(enrollmentId);
      if (!currentEnrollment) {
        throw new NotFoundError('Enrollment', enrollmentId);
      }
      
      // Update progress
      const updatedEnrollment = await enrollmentModel.updateProgress(enrollmentId, progress);
      if (!updatedEnrollment) {
        throw new NotFoundError('Enrollment', enrollmentId);
      }
      
      // Invalidate user enrollments cache
      await userCache.deleteUserEnrollments(updatedEnrollment.userId);
      
      // Publish progress update event
      await eventPublisher.publishEnrollmentEvent({
        type: 'user.progress_updated',
        data: {
          userId: updatedEnrollment.userId,
          courseId: updatedEnrollment.courseId,
          enrollmentId: updatedEnrollment.id,
          progress: updatedEnrollment.progress,
          previousProgress: currentEnrollment.progress,
        },
        correlationId: uuidv4(),
      });
      
      // If course was completed, publish completion event
      if (progress >= 100 && currentEnrollment.progress < 100) {
        await eventPublisher.publishEnrollmentEvent({
          type: 'user.course_completed',
          data: {
            userId: updatedEnrollment.userId,
            courseId: updatedEnrollment.courseId,
            enrollmentId: updatedEnrollment.id,
            completedAt: updatedEnrollment.completedAt,
            progress: updatedEnrollment.progress,
          },
          correlationId: uuidv4(),
        });
      }
      
      log.info('Enrollment progress updated successfully', { enrollmentId, progress });
      
      return updatedEnrollment;
    } catch (error) {
      log.error('Failed to update enrollment progress', error, { enrollmentId, progress });
      throw error;
    }
  }
  
  // Update last accessed timestamp
  async updateLastAccessed(enrollmentId: string): Promise<void> {
    try {
      await enrollmentModel.updateLastAccessed(enrollmentId);
      
      log.debug('Enrollment last accessed updated', { enrollmentId });
    } catch (error) {
      log.error('Failed to update enrollment last accessed', error, { enrollmentId });
      throw error;
    }
  }
  
  // Get enrollment statistics for a user
  async getUserEnrollmentStats(userId: string): Promise<EnrollmentStats> {
    try {
      const stats = await enrollmentModel.getUserEnrollmentStats(userId);
      
      const enrollmentStats: EnrollmentStats = {
        totalCourses: stats.total,
        activeCourses: stats.active,
        completedCourses: stats.completed,
        droppedCourses: stats.dropped,
        averageProgress: stats.averageProgress,
        totalTimeSpent: 0, // This would need to be tracked separately
        lastAccessedCourse: undefined, // This would need additional logic
        lastAccessedAt: stats.lastAccessed,
      };
      
      log.debug('User enrollment statistics calculated', { userId, stats: enrollmentStats });
      
      return enrollmentStats;
    } catch (error) {
      log.error('Failed to get user enrollment statistics', error, { userId });
      throw error;
    }
  }
  
  // Get enrollment statistics for a course
  async getCourseEnrollmentStats(courseId: string): Promise<any> {
    try {
      const stats = await enrollmentModel.getCourseEnrollmentStats(courseId);
      
      log.debug('Course enrollment statistics calculated', { courseId, stats });
      
      return stats;
    } catch (error) {
      log.error('Failed to get course enrollment statistics', error, { courseId });
      throw error;
    }
  }
  
  // Get overall enrollment statistics
  async getOverallEnrollmentStats(): Promise<any> {
    try {
      const stats = await enrollmentModel.getOverallStats();
      
      log.debug('Overall enrollment statistics calculated', { stats });
      
      return stats;
    } catch (error) {
      log.error('Failed to get overall enrollment statistics', error);
      throw error;
    }
  }
  
  // Check if user is enrolled in course
  async isUserEnrolled(userId: string, courseId: string): Promise<boolean> {
    try {
      const isEnrolled = await enrollmentModel.isUserEnrolled(userId, courseId);
      
      log.debug('User enrollment status checked', { userId, courseId, isEnrolled });
      
      return isEnrolled;
    } catch (error) {
      log.error('Failed to check user enrollment status', error, { userId, courseId });
      throw error;
    }
  }
  
  // Get active enrollments for a user
  async getActiveEnrollments(userId: string): Promise<UserEnrollment[]> {
    try {
      const enrollments = await enrollmentModel.getActiveEnrollments(userId);
      
      log.debug('Active enrollments retrieved', { userId, count: enrollments.length });
      
      return enrollments;
    } catch (error) {
      log.error('Failed to get active enrollments', error, { userId });
      throw error;
    }
  }
  
  // Get completed enrollments for a user
  async getCompletedEnrollments(userId: string): Promise<UserEnrollment[]> {
    try {
      const enrollments = await enrollmentModel.getCompletedEnrollments(userId);
      
      log.debug('Completed enrollments retrieved', { userId, count: enrollments.length });
      
      return enrollments;
    } catch (error) {
      log.error('Failed to get completed enrollments', error, { userId });
      throw error;
    }
  }
  
  // Get enrollment by ID
  async getEnrollmentById(enrollmentId: string): Promise<UserEnrollment> {
    try {
      const enrollment = await enrollmentModel.findById(enrollmentId);
      if (!enrollment) {
        throw new NotFoundError('Enrollment', enrollmentId);
      }
      
      log.debug('Enrollment retrieved by ID', { enrollmentId });
      
      return enrollment;
    } catch (error) {
      log.error('Failed to get enrollment by ID', error, { enrollmentId });
      throw error;
    }
  }
  
  // Get enrollment by user and course
  async getEnrollmentByUserAndCourse(userId: string, courseId: string): Promise<UserEnrollment> {
    try {
      const enrollment = await enrollmentModel.findByUserAndCourse(userId, courseId);
      if (!enrollment) {
        throw new NotFoundError('Enrollment not found for user and course');
      }
      
      log.debug('Enrollment retrieved by user and course', { userId, courseId });
      
      return enrollment;
    } catch (error) {
      log.error('Failed to get enrollment by user and course', error, { userId, courseId });
      throw error;
    }
  }
}

export const enrollmentService = new EnrollmentService();
