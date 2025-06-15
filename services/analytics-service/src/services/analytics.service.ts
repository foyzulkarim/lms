import { 
  UserAnalytics, 
  CourseAnalytics, 
  AssessmentAnalytics,
  LearningProgress,
  ProgressStatus,
  Filters,
  AnalyticsEvent,
  UserCreatedEvent,
  UserEnrolledEvent,
  UserCompletedCourseEvent,
  CourseCreatedEvent,
  ModuleCompletedEvent,
  AssessmentStartedEvent,
  AssessmentCompletedEvent,
  NotFoundError,
  ValidationError
} from '@/types/analytics.types';
import { analyticsRepository } from '@/repositories/analytics.repository';
import { cache, cacheKeys } from '@/utils/redis';
import { logger, structuredLog } from '@/utils/logger';
import { env } from '@/config/environment';
import { recordAnalyticsCalculation } from '@/utils/metrics';

export class AnalyticsService {
  
  // ============================================================================
  // User Analytics Methods
  // ============================================================================

  async getUserAnalytics(userId: string, useCache = true): Promise<UserAnalytics> {
    const startTime = Date.now();
    
    try {
      // Try cache first
      if (useCache) {
        const cached = await cache.get<UserAnalytics>(cacheKeys.userAnalytics(userId));
        if (cached) {
          structuredLog.cache.logHit(cacheKeys.userAnalytics(userId));
          return cached;
        }
        structuredLog.cache.logMiss(cacheKeys.userAnalytics(userId));
      }

      // Get from database
      let analytics = await analyticsRepository.getUserAnalytics(userId);
      
      // Create if doesn't exist
      if (!analytics) {
        analytics = await this.initializeUserAnalytics(userId);
      }

      // Cache the result
      if (useCache) {
        await cache.set(
          cacheKeys.userAnalytics(userId), 
          analytics, 
          env.CACHE_TTL_SECONDS
        );
      }

      recordAnalyticsCalculation('user_analytics', Date.now() - startTime, 1, true);
      return analytics;
    } catch (error) {
      recordAnalyticsCalculation('user_analytics', Date.now() - startTime, 0, false);
      structuredLog.analytics.logMetricsCalculation('user_analytics', 0, Date.now() - startTime);
      throw error;
    }
  }

  async updateUserAnalytics(userId: string, updates: Partial<UserAnalytics>): Promise<UserAnalytics> {
    const startTime = Date.now();
    
    try {
      const analytics = await analyticsRepository.updateUserAnalytics(userId, updates);
      
      // Invalidate cache
      await cache.del(cacheKeys.userAnalytics(userId));
      
      // Recalculate derived metrics
      await this.recalculateUserMetrics(userId);
      
      recordAnalyticsCalculation('user_analytics_update', Date.now() - startTime, 1, true);
      return analytics;
    } catch (error) {
      recordAnalyticsCalculation('user_analytics_update', Date.now() - startTime, 0, false);
      throw error;
    }
  }

  private async initializeUserAnalytics(userId: string): Promise<UserAnalytics> {
    const analytics = await analyticsRepository.createUserAnalytics({
      userId,
      totalCoursesEnrolled: 0,
      totalCoursesCompleted: 0,
      totalLearningHours: 0,
      averageScore: 0,
      lastActiveDate: null,
      streakDays: 0,
      learningPath: [],
      skillsAcquired: [],
      engagementScore: 0,
      completionRate: 0,
    });

    logger.info('Initialized user analytics', { userId });
    return analytics;
  }

  private async recalculateUserMetrics(userId: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Get user's learning progress
      const { data: progressData } = await analyticsRepository.getLearningProgress({ 
        userId, 
        limit: 1000 
      });

      // Calculate metrics
      const totalEnrolled = progressData.length;
      const totalCompleted = progressData.filter(p => p.status === ProgressStatus.COMPLETED).length;
      const totalHours = progressData.reduce((sum, p) => sum + (p.timeSpent / 60), 0);
      const completedWithScores = progressData.filter(p => p.score !== null);
      const averageScore = completedWithScores.length > 0 
        ? completedWithScores.reduce((sum, p) => sum + (p.score || 0), 0) / completedWithScores.length
        : 0;
      const completionRate = totalEnrolled > 0 ? (totalCompleted / totalEnrolled) * 100 : 0;
      
      // Calculate engagement score
      const engagementScore = this.calculateEngagementScore(progressData);
      
      // Calculate streak days
      const streakDays = this.calculateStreakDays(progressData);
      
      // Get last active date
      const lastActiveDate = progressData.reduce((latest, p) => {
        if (!p.lastAccessDate) return latest;
        return !latest || p.lastAccessDate > latest ? p.lastAccessDate : latest;
      }, null as Date | null);

      // Update analytics
      await analyticsRepository.updateUserAnalytics(userId, {
        totalCoursesEnrolled: totalEnrolled,
        totalCoursesCompleted: totalCompleted,
        totalLearningHours: Math.round(totalHours * 100) / 100,
        averageScore: Math.round(averageScore * 100) / 100,
        completionRate: Math.round(completionRate * 100) / 100,
        engagementScore: Math.round(engagementScore * 100) / 100,
        streakDays,
        lastActiveDate,
      });

      recordAnalyticsCalculation('user_metrics_recalc', Date.now() - startTime, progressData.length, true);
    } catch (error) {
      recordAnalyticsCalculation('user_metrics_recalc', Date.now() - startTime, 0, false);
      logger.error('Failed to recalculate user metrics', { userId, error });
      throw error;
    }
  }

  private calculateEngagementScore(progressData: LearningProgress[]): number {
    if (progressData.length === 0) return 0;

    let score = 0;
    const weights = {
      completion: 0.4,
      consistency: 0.3,
      performance: 0.2,
      recency: 0.1,
    };

    // Completion factor
    const completionRate = progressData.filter(p => p.status === ProgressStatus.COMPLETED).length / progressData.length;
    score += completionRate * weights.completion * 100;

    // Consistency factor (based on regular access)
    const accessDates = progressData
      .filter(p => p.lastAccessDate)
      .map(p => p.lastAccessDate!)
      .sort((a, b) => b.getTime() - a.getTime());
    
    if (accessDates.length > 1) {
      const daysBetweenAccess = accessDates.slice(0, -1).map((date, i) => {
        const nextDate = accessDates[i + 1];
        return Math.abs(date.getTime() - nextDate.getTime()) / (1000 * 60 * 60 * 24);
      });
      const avgDaysBetween = daysBetweenAccess.reduce((sum, days) => sum + days, 0) / daysBetweenAccess.length;
      const consistencyScore = Math.max(0, 100 - avgDaysBetween * 5); // Lower is better
      score += (consistencyScore / 100) * weights.consistency * 100;
    }

    // Performance factor
    const scoresWithValues = progressData.filter(p => p.score !== null);
    if (scoresWithValues.length > 0) {
      const avgScore = scoresWithValues.reduce((sum, p) => sum + (p.score || 0), 0) / scoresWithValues.length;
      score += (avgScore / 100) * weights.performance * 100;
    }

    // Recency factor
    if (accessDates.length > 0) {
      const daysSinceLastAccess = (Date.now() - accessDates[0].getTime()) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 100 - daysSinceLastAccess * 2);
      score += (recencyScore / 100) * weights.recency * 100;
    }

    return Math.min(100, Math.max(0, score));
  }

  private calculateStreakDays(progressData: LearningProgress[]): number {
    const accessDates = progressData
      .filter(p => p.lastAccessDate)
      .map(p => new Date(p.lastAccessDate!.toDateString()))
      .sort((a, b) => b.getTime() - a.getTime());

    if (accessDates.length === 0) return 0;

    const uniqueDates = Array.from(new Set(accessDates.map(d => d.getTime())))
      .map(t => new Date(t))
      .sort((a, b) => b.getTime() - a.getTime());

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < uniqueDates.length; i++) {
      const expectedDate = new Date(today);
      expectedDate.setDate(today.getDate() - i);
      
      if (uniqueDates[i].getTime() === expectedDate.getTime()) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  // ============================================================================
  // Course Analytics Methods
  // ============================================================================

  async getCourseAnalytics(courseId: string, useCache = true): Promise<CourseAnalytics> {
    const startTime = Date.now();
    
    try {
      // Try cache first
      if (useCache) {
        const cached = await cache.get<CourseAnalytics>(cacheKeys.courseAnalytics(courseId));
        if (cached) {
          structuredLog.cache.logHit(cacheKeys.courseAnalytics(courseId));
          return cached;
        }
        structuredLog.cache.logMiss(cacheKeys.courseAnalytics(courseId));
      }

      // Get from database
      let analytics = await analyticsRepository.getCourseAnalytics(courseId);
      
      // Create if doesn't exist
      if (!analytics) {
        analytics = await this.initializeCourseAnalytics(courseId);
      }

      // Cache the result
      if (useCache) {
        await cache.set(
          cacheKeys.courseAnalytics(courseId), 
          analytics, 
          env.CACHE_TTL_SECONDS
        );
      }

      recordAnalyticsCalculation('course_analytics', Date.now() - startTime, 1, true);
      return analytics;
    } catch (error) {
      recordAnalyticsCalculation('course_analytics', Date.now() - startTime, 0, false);
      throw error;
    }
  }

  private async initializeCourseAnalytics(courseId: string): Promise<CourseAnalytics> {
    const analytics = await analyticsRepository.createCourseAnalytics({
      courseId,
      totalEnrollments: 0,
      totalCompletions: 0,
      completionRate: 0,
      averageScore: 0,
      averageTimeToComplete: 0,
      enrollmentTrend: [],
      moduleAnalytics: [],
      dropoffPoints: [],
      popularityScore: 0,
      difficultyRating: 3,
    });

    logger.info('Initialized course analytics', { courseId });
    return analytics;
  }

  async recalculateCourseMetrics(courseId: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Get course progress data
      const { data: progressData } = await analyticsRepository.getLearningProgress({ 
        courseId, 
        limit: 10000 
      });

      // Calculate metrics
      const totalEnrollments = progressData.length;
      const totalCompletions = progressData.filter(p => p.status === ProgressStatus.COMPLETED).length;
      const completionRate = totalEnrollments > 0 ? (totalCompletions / totalEnrollments) * 100 : 0;
      
      const completedWithScores = progressData.filter(p => p.score !== null);
      const averageScore = completedWithScores.length > 0 
        ? completedWithScores.reduce((sum, p) => sum + (p.score || 0), 0) / completedWithScores.length
        : 0;

      const completedWithTime = progressData.filter(p => p.completionDate && p.timeSpent > 0);
      const averageTimeToComplete = completedWithTime.length > 0
        ? completedWithTime.reduce((sum, p) => sum + (p.timeSpent / 60), 0) / completedWithTime.length
        : 0;

      // Calculate popularity score
      const popularityScore = this.calculatePopularityScore(totalEnrollments, completionRate, averageScore);
      
      // Calculate difficulty rating
      const difficultyRating = this.calculateDifficultyRating(averageScore, completionRate, averageTimeToComplete);

      // Update analytics
      await analyticsRepository.updateCourseAnalytics(courseId, {
        totalEnrollments,
        totalCompletions,
        completionRate: Math.round(completionRate * 100) / 100,
        averageScore: Math.round(averageScore * 100) / 100,
        averageTimeToComplete: Math.round(averageTimeToComplete * 100) / 100,
        popularityScore: Math.round(popularityScore * 100) / 100,
        difficultyRating: Math.round(difficultyRating * 100) / 100,
      });

      // Invalidate cache
      await cache.del(cacheKeys.courseAnalytics(courseId));

      recordAnalyticsCalculation('course_metrics_recalc', Date.now() - startTime, progressData.length, true);
    } catch (error) {
      recordAnalyticsCalculation('course_metrics_recalc', Date.now() - startTime, 0, false);
      logger.error('Failed to recalculate course metrics', { courseId, error });
      throw error;
    }
  }

  private calculatePopularityScore(enrollments: number, completionRate: number, averageScore: number): number {
    // Normalize enrollment count (assuming max 1000 enrollments for scoring)
    const enrollmentScore = Math.min(enrollments / 1000, 1) * 40;
    
    // Completion rate score (0-100 -> 0-30)
    const completionScore = (completionRate / 100) * 30;
    
    // Average score contribution (0-100 -> 0-30)
    const scoreContribution = (averageScore / 100) * 30;
    
    return Math.min(100, enrollmentScore + completionScore + scoreContribution);
  }

  private calculateDifficultyRating(averageScore: number, completionRate: number, avgTimeHours: number): number {
    let difficulty = 3; // Start with medium difficulty
    
    // Lower scores indicate higher difficulty
    if (averageScore < 60) difficulty += 1.5;
    else if (averageScore < 70) difficulty += 1;
    else if (averageScore < 80) difficulty += 0.5;
    else if (averageScore > 90) difficulty -= 0.5;
    
    // Lower completion rates indicate higher difficulty
    if (completionRate < 50) difficulty += 1;
    else if (completionRate < 70) difficulty += 0.5;
    else if (completionRate > 90) difficulty -= 0.5;
    
    // Longer time indicates higher difficulty
    if (avgTimeHours > 20) difficulty += 0.5;
    else if (avgTimeHours > 40) difficulty += 1;
    else if (avgTimeHours < 5) difficulty -= 0.5;
    
    return Math.min(5, Math.max(1, difficulty));
  }

  // ============================================================================
  // Learning Progress Methods
  // ============================================================================

  async updateLearningProgress(progress: Omit<LearningProgress, 'id' | 'createdAt' | 'updatedAt'>): Promise<LearningProgress> {
    const startTime = Date.now();
    
    try {
      const updatedProgress = await analyticsRepository.upsertLearningProgress(progress);
      
      // Trigger recalculation of related analytics
      await Promise.all([
        this.recalculateUserMetrics(progress.userId),
        this.recalculateCourseMetrics(progress.courseId),
      ]);

      // Invalidate related caches
      await Promise.all([
        cache.del(cacheKeys.userAnalytics(progress.userId)),
        cache.del(cacheKeys.courseAnalytics(progress.courseId)),
        cache.del(cacheKeys.learningProgress(progress.userId, progress.courseId)),
      ]);

      recordAnalyticsCalculation('learning_progress_update', Date.now() - startTime, 1, true);
      return updatedProgress;
    } catch (error) {
      recordAnalyticsCalculation('learning_progress_update', Date.now() - startTime, 0, false);
      throw error;
    }
  }

  async getLearningProgress(filters: {
    userId?: string;
    courseId?: string;
    status?: ProgressStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ data: LearningProgress[]; total: number }> {
    const startTime = Date.now();
    
    try {
      const result = await analyticsRepository.getLearningProgress(filters);
      
      recordAnalyticsCalculation('learning_progress_query', Date.now() - startTime, result.data.length, true);
      return result;
    } catch (error) {
      recordAnalyticsCalculation('learning_progress_query', Date.now() - startTime, 0, false);
      throw error;
    }
  }

  // ============================================================================
  // Event Processing Methods
  // ============================================================================

  async processEvent(event: AnalyticsEvent): Promise<void> {
    const startTime = Date.now();
    
    try {
      structuredLog.event.logReceived(event.eventType, event.eventId);
      
      switch (event.eventType) {
        case 'UserCreated':
          await this.handleUserCreatedEvent(event as UserCreatedEvent);
          break;
        case 'UserEnrolled':
          await this.handleUserEnrolledEvent(event as UserEnrolledEvent);
          break;
        case 'UserCompletedCourse':
          await this.handleUserCompletedCourseEvent(event as UserCompletedCourseEvent);
          break;
        case 'CourseCreated':
          await this.handleCourseCreatedEvent(event as CourseCreatedEvent);
          break;
        case 'ModuleCompleted':
          await this.handleModuleCompletedEvent(event as ModuleCompletedEvent);
          break;
        case 'AssessmentStarted':
          await this.handleAssessmentStartedEvent(event as AssessmentStartedEvent);
          break;
        case 'AssessmentCompleted':
          await this.handleAssessmentCompletedEvent(event as AssessmentCompletedEvent);
          break;
        default:
          logger.warn('Unknown event type', { eventType: event.eventType, eventId: event.eventId });
      }
      
      structuredLog.event.logProcessed(event.eventType, event.eventId, Date.now() - startTime);
    } catch (error) {
      structuredLog.event.logFailed(event.eventType, event.eventId, error as Error);
      throw error;
    }
  }

  private async handleUserCreatedEvent(event: UserCreatedEvent): Promise<void> {
    await this.initializeUserAnalytics(event.userId);
  }

  private async handleUserEnrolledEvent(event: UserEnrolledEvent): Promise<void> {
    await this.updateLearningProgress({
      userId: event.userId,
      courseId: event.courseId,
      moduleId: null,
      progressPercentage: 0,
      timeSpent: 0,
      lastAccessDate: event.enrolledAt,
      completionDate: null,
      score: null,
      status: ProgressStatus.NOT_STARTED,
      milestones: [],
      engagementLevel: 'medium',
    });
  }

  private async handleUserCompletedCourseEvent(event: UserCompletedCourseEvent): Promise<void> {
    await this.updateLearningProgress({
      userId: event.userId,
      courseId: event.courseId,
      moduleId: null,
      progressPercentage: 100,
      timeSpent: event.timeSpent,
      lastAccessDate: event.completedAt,
      completionDate: event.completedAt,
      score: event.finalScore,
      status: ProgressStatus.COMPLETED,
      milestones: [],
      engagementLevel: 'high',
    });
  }

  private async handleCourseCreatedEvent(event: CourseCreatedEvent): Promise<void> {
    await this.initializeCourseAnalytics(event.courseId);
  }

  private async handleModuleCompletedEvent(event: ModuleCompletedEvent): Promise<void> {
    await this.updateLearningProgress({
      userId: event.userId,
      courseId: event.courseId,
      moduleId: event.moduleId,
      progressPercentage: 100,
      timeSpent: event.timeSpent,
      lastAccessDate: event.completedAt,
      completionDate: event.completedAt,
      score: null,
      status: ProgressStatus.COMPLETED,
      milestones: [],
      engagementLevel: 'medium',
    });
  }

  private async handleAssessmentStartedEvent(event: AssessmentStartedEvent): Promise<void> {
    // Initialize assessment analytics if needed
    const existing = await analyticsRepository.getAssessmentAnalytics(event.assessmentId);
    if (!existing) {
      await analyticsRepository.createAssessmentAnalytics({
        assessmentId: event.assessmentId,
        courseId: event.courseId,
        totalAttempts: 0,
        averageScore: 0,
        passRate: 0,
        averageTimeSpent: 0,
        questionAnalytics: [],
        difficultyRating: 3,
        retakeRate: 0,
      });
    }
  }

  private async handleAssessmentCompletedEvent(event: AssessmentCompletedEvent): Promise<void> {
    // This would typically trigger assessment analytics recalculation
    // For now, we'll just log it
    logger.info('Assessment completed', {
      userId: event.userId,
      assessmentId: event.assessmentId,
      score: event.score,
    });
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  async getTopPerformers(limit = 10): Promise<UserAnalytics[]> {
    const startTime = Date.now();
    
    try {
      // This would typically use a more sophisticated query
      // For now, we'll use a simple approach
      const results = await analyticsRepository.getAggregatedData(`
        SELECT * FROM user_analytics 
        ORDER BY engagement_score DESC, completion_rate DESC 
        LIMIT $1
      `, [limit]);

      recordAnalyticsCalculation('top_performers', Date.now() - startTime, results.length, true);
      return results.map(row => ({
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
      }));
    } catch (error) {
      recordAnalyticsCalculation('top_performers', Date.now() - startTime, 0, false);
      throw error;
    }
  }

  async getPopularCourses(limit = 10): Promise<CourseAnalytics[]> {
    return analyticsRepository.getTopCourses(limit);
  }
}

export const analyticsService = new AnalyticsService();
