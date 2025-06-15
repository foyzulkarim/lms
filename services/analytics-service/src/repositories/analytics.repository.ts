import { Knex } from 'knex';
import { db } from '@/utils/database';
import { logger, structuredLog } from '@/utils/logger';
import { 
  UserAnalytics, 
  CourseAnalytics, 
  AssessmentAnalytics, 
  LearningProgress,
  DashboardMetrics,
  ReportJob,
  MetricType,
  ProgressStatus,
  ReportStatus,
  Timeframe,
  Filters,
  DatabaseError,
  NotFoundError
} from '@/types/analytics.types';
import { recordDatabaseQuery } from '@/utils/metrics';

export class AnalyticsRepository {
  private get connection(): Knex {
    return db.getConnection();
  }

  // ============================================================================
  // User Analytics Methods
  // ============================================================================

  async getUserAnalytics(userId: string): Promise<UserAnalytics | null> {
    const startTime = Date.now();
    
    try {
      const result = await this.connection('user_analytics')
        .where('user_id', userId)
        .first();

      recordDatabaseQuery('select', 'user_analytics', Date.now() - startTime, true);
      
      if (!result) {
        return null;
      }

      return this.mapUserAnalytics(result);
    } catch (error) {
      recordDatabaseQuery('select', 'user_analytics', Date.now() - startTime, false);
      structuredLog.db.logError('getUserAnalytics', error as Error);
      throw new DatabaseError('Failed to get user analytics', error);
    }
  }

  async createUserAnalytics(analytics: Omit<UserAnalytics, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserAnalytics> {
    const startTime = Date.now();
    
    try {
      const [result] = await this.connection('user_analytics')
        .insert({
          user_id: analytics.userId,
          total_courses_enrolled: analytics.totalCoursesEnrolled,
          total_courses_completed: analytics.totalCoursesCompleted,
          total_learning_hours: analytics.totalLearningHours,
          average_score: analytics.averageScore,
          last_active_date: analytics.lastActiveDate,
          streak_days: analytics.streakDays,
          learning_path: JSON.stringify(analytics.learningPath),
          skills_acquired: JSON.stringify(analytics.skillsAcquired),
          engagement_score: analytics.engagementScore,
          completion_rate: analytics.completionRate,
        })
        .returning('*');

      recordDatabaseQuery('insert', 'user_analytics', Date.now() - startTime, true);
      return this.mapUserAnalytics(result);
    } catch (error) {
      recordDatabaseQuery('insert', 'user_analytics', Date.now() - startTime, false);
      structuredLog.db.logError('createUserAnalytics', error as Error);
      throw new DatabaseError('Failed to create user analytics', error);
    }
  }

  async updateUserAnalytics(userId: string, updates: Partial<UserAnalytics>): Promise<UserAnalytics> {
    const startTime = Date.now();
    
    try {
      const updateData: any = {};
      
      if (updates.totalCoursesEnrolled !== undefined) updateData.total_courses_enrolled = updates.totalCoursesEnrolled;
      if (updates.totalCoursesCompleted !== undefined) updateData.total_courses_completed = updates.totalCoursesCompleted;
      if (updates.totalLearningHours !== undefined) updateData.total_learning_hours = updates.totalLearningHours;
      if (updates.averageScore !== undefined) updateData.average_score = updates.averageScore;
      if (updates.lastActiveDate !== undefined) updateData.last_active_date = updates.lastActiveDate;
      if (updates.streakDays !== undefined) updateData.streak_days = updates.streakDays;
      if (updates.learningPath !== undefined) updateData.learning_path = JSON.stringify(updates.learningPath);
      if (updates.skillsAcquired !== undefined) updateData.skills_acquired = JSON.stringify(updates.skillsAcquired);
      if (updates.engagementScore !== undefined) updateData.engagement_score = updates.engagementScore;
      if (updates.completionRate !== undefined) updateData.completion_rate = updates.completionRate;

      const [result] = await this.connection('user_analytics')
        .where('user_id', userId)
        .update(updateData)
        .returning('*');

      if (!result) {
        throw new NotFoundError('User analytics', userId);
      }

      recordDatabaseQuery('update', 'user_analytics', Date.now() - startTime, true);
      return this.mapUserAnalytics(result);
    } catch (error) {
      recordDatabaseQuery('update', 'user_analytics', Date.now() - startTime, false);
      structuredLog.db.logError('updateUserAnalytics', error as Error);
      throw new DatabaseError('Failed to update user analytics', error);
    }
  }

  async getUserAnalyticsBatch(userIds: string[]): Promise<UserAnalytics[]> {
    const startTime = Date.now();
    
    try {
      const results = await this.connection('user_analytics')
        .whereIn('user_id', userIds);

      recordDatabaseQuery('select', 'user_analytics', Date.now() - startTime, true);
      return results.map(this.mapUserAnalytics);
    } catch (error) {
      recordDatabaseQuery('select', 'user_analytics', Date.now() - startTime, false);
      structuredLog.db.logError('getUserAnalyticsBatch', error as Error);
      throw new DatabaseError('Failed to get user analytics batch', error);
    }
  }

  // ============================================================================
  // Course Analytics Methods
  // ============================================================================

  async getCourseAnalytics(courseId: string): Promise<CourseAnalytics | null> {
    const startTime = Date.now();
    
    try {
      const result = await this.connection('course_analytics')
        .where('course_id', courseId)
        .first();

      recordDatabaseQuery('select', 'course_analytics', Date.now() - startTime, true);
      
      if (!result) {
        return null;
      }

      return this.mapCourseAnalytics(result);
    } catch (error) {
      recordDatabaseQuery('select', 'course_analytics', Date.now() - startTime, false);
      structuredLog.db.logError('getCourseAnalytics', error as Error);
      throw new DatabaseError('Failed to get course analytics', error);
    }
  }

  async createCourseAnalytics(analytics: Omit<CourseAnalytics, 'id' | 'createdAt' | 'updatedAt'>): Promise<CourseAnalytics> {
    const startTime = Date.now();
    
    try {
      const [result] = await this.connection('course_analytics')
        .insert({
          course_id: analytics.courseId,
          total_enrollments: analytics.totalEnrollments,
          total_completions: analytics.totalCompletions,
          completion_rate: analytics.completionRate,
          average_score: analytics.averageScore,
          average_time_to_complete: analytics.averageTimeToComplete,
          enrollment_trend: JSON.stringify(analytics.enrollmentTrend),
          module_analytics: JSON.stringify(analytics.moduleAnalytics),
          dropoff_points: JSON.stringify(analytics.dropoffPoints),
          popularity_score: analytics.popularityScore,
          difficulty_rating: analytics.difficultyRating,
        })
        .returning('*');

      recordDatabaseQuery('insert', 'course_analytics', Date.now() - startTime, true);
      return this.mapCourseAnalytics(result);
    } catch (error) {
      recordDatabaseQuery('insert', 'course_analytics', Date.now() - startTime, false);
      structuredLog.db.logError('createCourseAnalytics', error as Error);
      throw new DatabaseError('Failed to create course analytics', error);
    }
  }

  async updateCourseAnalytics(courseId: string, updates: Partial<CourseAnalytics>): Promise<CourseAnalytics> {
    const startTime = Date.now();
    
    try {
      const updateData: any = {};
      
      if (updates.totalEnrollments !== undefined) updateData.total_enrollments = updates.totalEnrollments;
      if (updates.totalCompletions !== undefined) updateData.total_completions = updates.totalCompletions;
      if (updates.completionRate !== undefined) updateData.completion_rate = updates.completionRate;
      if (updates.averageScore !== undefined) updateData.average_score = updates.averageScore;
      if (updates.averageTimeToComplete !== undefined) updateData.average_time_to_complete = updates.averageTimeToComplete;
      if (updates.enrollmentTrend !== undefined) updateData.enrollment_trend = JSON.stringify(updates.enrollmentTrend);
      if (updates.moduleAnalytics !== undefined) updateData.module_analytics = JSON.stringify(updates.moduleAnalytics);
      if (updates.dropoffPoints !== undefined) updateData.dropoff_points = JSON.stringify(updates.dropoffPoints);
      if (updates.popularityScore !== undefined) updateData.popularity_score = updates.popularityScore;
      if (updates.difficultyRating !== undefined) updateData.difficulty_rating = updates.difficultyRating;

      const [result] = await this.connection('course_analytics')
        .where('course_id', courseId)
        .update(updateData)
        .returning('*');

      if (!result) {
        throw new NotFoundError('Course analytics', courseId);
      }

      recordDatabaseQuery('update', 'course_analytics', Date.now() - startTime, true);
      return this.mapCourseAnalytics(result);
    } catch (error) {
      recordDatabaseQuery('update', 'course_analytics', Date.now() - startTime, false);
      structuredLog.db.logError('updateCourseAnalytics', error as Error);
      throw new DatabaseError('Failed to update course analytics', error);
    }
  }

  async getTopCourses(limit = 10): Promise<CourseAnalytics[]> {
    const startTime = Date.now();
    
    try {
      const results = await this.connection('course_analytics')
        .orderBy('popularity_score', 'desc')
        .limit(limit);

      recordDatabaseQuery('select', 'course_analytics', Date.now() - startTime, true);
      return results.map(this.mapCourseAnalytics);
    } catch (error) {
      recordDatabaseQuery('select', 'course_analytics', Date.now() - startTime, false);
      structuredLog.db.logError('getTopCourses', error as Error);
      throw new DatabaseError('Failed to get top courses', error);
    }
  }

  // ============================================================================
  // Assessment Analytics Methods
  // ============================================================================

  async getAssessmentAnalytics(assessmentId: string): Promise<AssessmentAnalytics | null> {
    const startTime = Date.now();
    
    try {
      const result = await this.connection('assessment_analytics')
        .where('assessment_id', assessmentId)
        .first();

      recordDatabaseQuery('select', 'assessment_analytics', Date.now() - startTime, true);
      
      if (!result) {
        return null;
      }

      return this.mapAssessmentAnalytics(result);
    } catch (error) {
      recordDatabaseQuery('select', 'assessment_analytics', Date.now() - startTime, false);
      structuredLog.db.logError('getAssessmentAnalytics', error as Error);
      throw new DatabaseError('Failed to get assessment analytics', error);
    }
  }

  async createAssessmentAnalytics(analytics: Omit<AssessmentAnalytics, 'id' | 'createdAt' | 'updatedAt'>): Promise<AssessmentAnalytics> {
    const startTime = Date.now();
    
    try {
      const [result] = await this.connection('assessment_analytics')
        .insert({
          assessment_id: analytics.assessmentId,
          course_id: analytics.courseId,
          total_attempts: analytics.totalAttempts,
          average_score: analytics.averageScore,
          pass_rate: analytics.passRate,
          average_time_spent: analytics.averageTimeSpent,
          question_analytics: JSON.stringify(analytics.questionAnalytics),
          difficulty_rating: analytics.difficultyRating,
          retake_rate: analytics.retakeRate,
        })
        .returning('*');

      recordDatabaseQuery('insert', 'assessment_analytics', Date.now() - startTime, true);
      return this.mapAssessmentAnalytics(result);
    } catch (error) {
      recordDatabaseQuery('insert', 'assessment_analytics', Date.now() - startTime, false);
      structuredLog.db.logError('createAssessmentAnalytics', error as Error);
      throw new DatabaseError('Failed to create assessment analytics', error);
    }
  }

  // ============================================================================
  // Learning Progress Methods
  // ============================================================================

  async getLearningProgress(filters: {
    userId?: string;
    courseId?: string;
    status?: ProgressStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ data: LearningProgress[]; total: number }> {
    const startTime = Date.now();
    
    try {
      let query = this.connection('learning_progress');
      let countQuery = this.connection('learning_progress');

      if (filters.userId) {
        query = query.where('user_id', filters.userId);
        countQuery = countQuery.where('user_id', filters.userId);
      }

      if (filters.courseId) {
        query = query.where('course_id', filters.courseId);
        countQuery = countQuery.where('course_id', filters.courseId);
      }

      if (filters.status) {
        query = query.where('status', filters.status);
        countQuery = countQuery.where('status', filters.status);
      }

      const [results, [{ count }]] = await Promise.all([
        query
          .orderBy('updated_at', 'desc')
          .limit(filters.limit || 50)
          .offset(filters.offset || 0),
        countQuery.count('* as count')
      ]);

      recordDatabaseQuery('select', 'learning_progress', Date.now() - startTime, true);
      
      return {
        data: results.map(this.mapLearningProgress),
        total: parseInt(count as string, 10)
      };
    } catch (error) {
      recordDatabaseQuery('select', 'learning_progress', Date.now() - startTime, false);
      structuredLog.db.logError('getLearningProgress', error as Error);
      throw new DatabaseError('Failed to get learning progress', error);
    }
  }

  async upsertLearningProgress(progress: Omit<LearningProgress, 'id' | 'createdAt' | 'updatedAt'>): Promise<LearningProgress> {
    const startTime = Date.now();
    
    try {
      const data = {
        user_id: progress.userId,
        course_id: progress.courseId,
        module_id: progress.moduleId,
        progress_percentage: progress.progressPercentage,
        time_spent: progress.timeSpent,
        last_access_date: progress.lastAccessDate,
        completion_date: progress.completionDate,
        score: progress.score,
        status: progress.status,
        milestones: JSON.stringify(progress.milestones),
        engagement_level: progress.engagementLevel,
      };

      const [result] = await this.connection('learning_progress')
        .insert(data)
        .onConflict(['user_id', 'course_id', 'module_id'])
        .merge()
        .returning('*');

      recordDatabaseQuery('upsert', 'learning_progress', Date.now() - startTime, true);
      return this.mapLearningProgress(result);
    } catch (error) {
      recordDatabaseQuery('upsert', 'learning_progress', Date.now() - startTime, false);
      structuredLog.db.logError('upsertLearningProgress', error as Error);
      throw new DatabaseError('Failed to upsert learning progress', error);
    }
  }

  // ============================================================================
  // Dashboard Metrics Methods
  // ============================================================================

  async getDashboardMetrics(timeframe: Timeframe, filters?: Filters): Promise<DashboardMetrics[]> {
    const startTime = Date.now();
    
    try {
      let query = this.connection('dashboard_metrics')
        .where('timeframe', timeframe);

      if (filters) {
        query = query.where('filters', JSON.stringify(filters));
      }

      const results = await query
        .orderBy('calculated_at', 'desc')
        .limit(50);

      recordDatabaseQuery('select', 'dashboard_metrics', Date.now() - startTime, true);
      return results.map(this.mapDashboardMetrics);
    } catch (error) {
      recordDatabaseQuery('select', 'dashboard_metrics', Date.now() - startTime, false);
      structuredLog.db.logError('getDashboardMetrics', error as Error);
      throw new DatabaseError('Failed to get dashboard metrics', error);
    }
  }

  async upsertDashboardMetric(metric: Omit<DashboardMetrics, 'id' | 'calculatedAt'>): Promise<DashboardMetrics> {
    const startTime = Date.now();
    
    try {
      const data = {
        metric_type: metric.metricType,
        value: metric.value,
        previous_value: metric.previousValue,
        change_percentage: metric.changePercentage,
        timeframe: metric.timeframe,
        filters: JSON.stringify(metric.filters),
      };

      const [result] = await this.connection('dashboard_metrics')
        .insert(data)
        .onConflict(['metric_type', 'timeframe'])
        .merge()
        .returning('*');

      recordDatabaseQuery('upsert', 'dashboard_metrics', Date.now() - startTime, true);
      return this.mapDashboardMetrics(result);
    } catch (error) {
      recordDatabaseQuery('upsert', 'dashboard_metrics', Date.now() - startTime, false);
      structuredLog.db.logError('upsertDashboardMetric', error as Error);
      throw new DatabaseError('Failed to upsert dashboard metric', error);
    }
  }

  // ============================================================================
  // Report Jobs Methods
  // ============================================================================

  async createReportJob(job: Omit<ReportJob, 'id' | 'createdAt' | 'completedAt'>): Promise<ReportJob> {
    const startTime = Date.now();
    
    try {
      const [result] = await this.connection('report_jobs')
        .insert({
          report_id: job.reportId,
          report_type: job.reportType,
          requested_by: job.requestedBy,
          parameters: JSON.stringify(job.parameters),
          status: job.status,
          file_path: job.filePath,
          file_size: job.fileSize,
          record_count: job.recordCount,
          error_message: job.errorMessage,
          progress: job.progress,
          estimated_completion: job.estimatedCompletion,
        })
        .returning('*');

      recordDatabaseQuery('insert', 'report_jobs', Date.now() - startTime, true);
      return this.mapReportJob(result);
    } catch (error) {
      recordDatabaseQuery('insert', 'report_jobs', Date.now() - startTime, false);
      structuredLog.db.logError('createReportJob', error as Error);
      throw new DatabaseError('Failed to create report job', error);
    }
  }

  async updateReportJob(jobId: string, updates: Partial<ReportJob>): Promise<ReportJob> {
    const startTime = Date.now();
    
    try {
      const updateData: any = {};
      
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.filePath !== undefined) updateData.file_path = updates.filePath;
      if (updates.fileSize !== undefined) updateData.file_size = updates.fileSize;
      if (updates.recordCount !== undefined) updateData.record_count = updates.recordCount;
      if (updates.errorMessage !== undefined) updateData.error_message = updates.errorMessage;
      if (updates.progress !== undefined) updateData.progress = updates.progress;
      if (updates.estimatedCompletion !== undefined) updateData.estimated_completion = updates.estimatedCompletion;
      if (updates.completedAt !== undefined) updateData.completed_at = updates.completedAt;

      const [result] = await this.connection('report_jobs')
        .where('id', jobId)
        .update(updateData)
        .returning('*');

      if (!result) {
        throw new NotFoundError('Report job', jobId);
      }

      recordDatabaseQuery('update', 'report_jobs', Date.now() - startTime, true);
      return this.mapReportJob(result);
    } catch (error) {
      recordDatabaseQuery('update', 'report_jobs', Date.now() - startTime, false);
      structuredLog.db.logError('updateReportJob', error as Error);
      throw new DatabaseError('Failed to update report job', error);
    }
  }

  async getReportJob(jobId: string): Promise<ReportJob | null> {
    const startTime = Date.now();
    
    try {
      const result = await this.connection('report_jobs')
        .where('id', jobId)
        .first();

      recordDatabaseQuery('select', 'report_jobs', Date.now() - startTime, true);
      
      if (!result) {
        return null;
      }

      return this.mapReportJob(result);
    } catch (error) {
      recordDatabaseQuery('select', 'report_jobs', Date.now() - startTime, false);
      structuredLog.db.logError('getReportJob', error as Error);
      throw new DatabaseError('Failed to get report job', error);
    }
  }

  // ============================================================================
  // Aggregation Methods
  // ============================================================================

  async getAggregatedData(query: string, params?: any[]): Promise<any[]> {
    const startTime = Date.now();
    
    try {
      const results = await this.connection.raw(query, params);
      
      recordDatabaseQuery('select', 'aggregated', Date.now() - startTime, true);
      return results.rows || results;
    } catch (error) {
      recordDatabaseQuery('select', 'aggregated', Date.now() - startTime, false);
      structuredLog.db.logError('getAggregatedData', error as Error, query);
      throw new DatabaseError('Failed to get aggregated data', error);
    }
  }

  async refreshMaterializedViews(): Promise<void> {
    const startTime = Date.now();
    
    try {
      await this.connection.raw('SELECT refresh_analytics_views()');
      
      recordDatabaseQuery('refresh', 'materialized_views', Date.now() - startTime, true);
      logger.info('Materialized views refreshed successfully');
    } catch (error) {
      recordDatabaseQuery('refresh', 'materialized_views', Date.now() - startTime, false);
      structuredLog.db.logError('refreshMaterializedViews', error as Error);
      throw new DatabaseError('Failed to refresh materialized views', error);
    }
  }

  // ============================================================================
  // Mapping Methods
  // ============================================================================

  private mapUserAnalytics(row: any): UserAnalytics {
    return {
      id: row.id,
      userId: row.user_id,
      totalCoursesEnrolled: row.total_courses_enrolled,
      totalCoursesCompleted: row.total_courses_completed,
      totalLearningHours: parseFloat(row.total_learning_hours),
      averageScore: parseFloat(row.average_score),
      lastActiveDate: row.last_active_date,
      streakDays: row.streak_days,
      learningPath: JSON.parse(row.learning_path || '[]'),
      skillsAcquired: JSON.parse(row.skills_acquired || '[]'),
      engagementScore: parseFloat(row.engagement_score),
      completionRate: parseFloat(row.completion_rate),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapCourseAnalytics(row: any): CourseAnalytics {
    return {
      id: row.id,
      courseId: row.course_id,
      totalEnrollments: row.total_enrollments,
      totalCompletions: row.total_completions,
      completionRate: parseFloat(row.completion_rate),
      averageScore: parseFloat(row.average_score),
      averageTimeToComplete: parseFloat(row.average_time_to_complete),
      enrollmentTrend: JSON.parse(row.enrollment_trend || '[]'),
      moduleAnalytics: JSON.parse(row.module_analytics || '[]'),
      dropoffPoints: JSON.parse(row.dropoff_points || '[]'),
      popularityScore: parseFloat(row.popularity_score),
      difficultyRating: parseFloat(row.difficulty_rating),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapAssessmentAnalytics(row: any): AssessmentAnalytics {
    return {
      id: row.id,
      assessmentId: row.assessment_id,
      courseId: row.course_id,
      totalAttempts: row.total_attempts,
      averageScore: parseFloat(row.average_score),
      passRate: parseFloat(row.pass_rate),
      averageTimeSpent: parseFloat(row.average_time_spent),
      questionAnalytics: JSON.parse(row.question_analytics || '[]'),
      difficultyRating: parseFloat(row.difficulty_rating),
      retakeRate: parseFloat(row.retake_rate),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapLearningProgress(row: any): LearningProgress {
    return {
      id: row.id,
      userId: row.user_id,
      courseId: row.course_id,
      moduleId: row.module_id,
      progressPercentage: parseFloat(row.progress_percentage),
      timeSpent: row.time_spent,
      lastAccessDate: row.last_access_date,
      completionDate: row.completion_date,
      score: row.score ? parseFloat(row.score) : null,
      status: row.status as ProgressStatus,
      milestones: JSON.parse(row.milestones || '[]'),
      engagementLevel: row.engagement_level as 'low' | 'medium' | 'high',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapDashboardMetrics(row: any): DashboardMetrics {
    return {
      id: row.id,
      metricType: row.metric_type as MetricType,
      value: parseFloat(row.value),
      previousValue: parseFloat(row.previous_value),
      changePercentage: parseFloat(row.change_percentage),
      timeframe: row.timeframe,
      filters: JSON.parse(row.filters || '{}'),
      calculatedAt: row.calculated_at,
    };
  }

  private mapReportJob(row: any): ReportJob {
    return {
      id: row.id,
      reportId: row.report_id,
      reportType: row.report_type,
      requestedBy: row.requested_by,
      parameters: JSON.parse(row.parameters || '{}'),
      status: row.status as ReportStatus,
      filePath: row.file_path,
      fileSize: row.file_size,
      recordCount: row.record_count,
      errorMessage: row.error_message,
      progress: row.progress,
      estimatedCompletion: row.estimated_completion,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }
}

export const analyticsRepository = new AnalyticsRepository();
