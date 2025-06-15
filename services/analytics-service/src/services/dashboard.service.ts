import { 
  DashboardResponse,
  DashboardMetrics,
  DashboardSummary,
  ChartData,
  ChartDataPoint,
  MetricType,
  Timeframe,
  Filters,
  TrendData
} from '@/types/analytics.types';
import { analyticsRepository } from '@/repositories/analytics.repository';
import { cache, cacheKeys } from '@/utils/redis';
import { logger, structuredLog } from '@/utils/logger';
import { env } from '@/config/environment';
import { recordAnalyticsCalculation, updateBusinessMetrics } from '@/utils/metrics';
import { subDays, format, startOfDay, endOfDay } from 'date-fns';

export class DashboardService {

  // ============================================================================
  // Main Dashboard Methods
  // ============================================================================

  async getDashboard(timeframe: Timeframe = '30d', filters?: Filters): Promise<DashboardResponse> {
    const startTime = Date.now();
    
    try {
      const cacheKey = cacheKeys.dashboard(timeframe, filters ? JSON.stringify(filters) : undefined);
      
      // Try cache first
      const cached = await cache.get<DashboardResponse>(cacheKey);
      if (cached) {
        structuredLog.cache.logHit(cacheKey);
        return cached;
      }
      structuredLog.cache.logMiss(cacheKey);

      // Calculate dashboard data
      const [metrics, charts, summary] = await Promise.all([
        this.calculateDashboardMetrics(timeframe, filters),
        this.generateChartData(timeframe, filters),
        this.calculateDashboardSummary(timeframe, filters),
      ]);

      const dashboard: DashboardResponse = {
        metrics,
        charts,
        summary,
        lastUpdated: new Date(),
        cacheExpiry: new Date(Date.now() + env.DASHBOARD_CACHE_TTL_SECONDS * 1000),
      };

      // Cache the result
      await cache.set(cacheKey, dashboard, env.DASHBOARD_CACHE_TTL_SECONDS);

      // Update Prometheus metrics
      updateBusinessMetrics({
        totalUsers: summary.totalUsers,
        activeUsers: [{ timeframe, count: summary.activeUsers }],
        totalCourses: summary.totalCourses,
        totalEnrollments: summary.totalEnrollments,
        completionRate: summary.overallCompletionRate,
      });

      recordAnalyticsCalculation('dashboard', Date.now() - startTime, metrics.length, true);
      return dashboard;
    } catch (error) {
      recordAnalyticsCalculation('dashboard', Date.now() - startTime, 0, false);
      structuredLog.analytics.logMetricsCalculation('dashboard', 0, Date.now() - startTime);
      throw error;
    }
  }

  // ============================================================================
  // Metrics Calculation
  // ============================================================================

  private async calculateDashboardMetrics(timeframe: Timeframe, filters?: Filters): Promise<DashboardMetrics[]> {
    const startTime = Date.now();
    
    try {
      const dateRange = this.getDateRange(timeframe);
      const previousDateRange = this.getPreviousDateRange(timeframe);

      // Calculate current period metrics
      const currentMetrics = await this.calculatePeriodMetrics(dateRange, filters);
      
      // Calculate previous period metrics for comparison
      const previousMetrics = await this.calculatePeriodMetrics(previousDateRange, filters);

      // Create dashboard metrics with comparisons
      const metrics: DashboardMetrics[] = [];

      for (const [metricType, currentValue] of Object.entries(currentMetrics)) {
        const previousValue = previousMetrics[metricType] || 0;
        const changePercentage = previousValue > 0 
          ? ((currentValue - previousValue) / previousValue) * 100 
          : currentValue > 0 ? 100 : 0;

        metrics.push({
          id: `${metricType}_${timeframe}`,
          metricType: metricType as MetricType,
          value: currentValue,
          previousValue,
          changePercentage: Math.round(changePercentage * 100) / 100,
          timeframe,
          filters: filters || {},
          calculatedAt: new Date(),
        });

        // Store in database for historical tracking
        await analyticsRepository.upsertDashboardMetric({
          metricType: metricType as MetricType,
          value: currentValue,
          previousValue,
          changePercentage: Math.round(changePercentage * 100) / 100,
          timeframe,
          filters: filters || {},
        });
      }

      recordAnalyticsCalculation('dashboard_metrics', Date.now() - startTime, metrics.length, true);
      return metrics;
    } catch (error) {
      recordAnalyticsCalculation('dashboard_metrics', Date.now() - startTime, 0, false);
      throw error;
    }
  }

  private async calculatePeriodMetrics(dateRange: { start: Date; end: Date }, filters?: Filters): Promise<Record<string, number>> {
    const queries = [
      // Total users
      this.buildMetricQuery('total_users', `
        SELECT COUNT(DISTINCT user_id) as value
        FROM user_analytics
        WHERE created_at <= $2
      `, dateRange, filters),

      // Active users
      this.buildMetricQuery('active_users', `
        SELECT COUNT(DISTINCT user_id) as value
        FROM learning_progress
        WHERE last_access_date BETWEEN $1 AND $2
      `, dateRange, filters),

      // Total courses
      this.buildMetricQuery('total_courses', `
        SELECT COUNT(DISTINCT course_id) as value
        FROM course_analytics
        WHERE created_at <= $2
      `, dateRange, filters),

      // Total enrollments
      this.buildMetricQuery('total_enrollments', `
        SELECT COUNT(*) as value
        FROM learning_progress
        WHERE created_at BETWEEN $1 AND $2
      `, dateRange, filters),

      // Completion rate
      this.buildMetricQuery('completion_rate', `
        SELECT 
          CASE 
            WHEN COUNT(*) = 0 THEN 0
            ELSE (COUNT(CASE WHEN status = 'completed' THEN 1 END)::DECIMAL / COUNT(*)::DECIMAL) * 100
          END as value
        FROM learning_progress
        WHERE created_at BETWEEN $1 AND $2
      `, dateRange, filters),

      // Average score
      this.buildMetricQuery('average_score', `
        SELECT COALESCE(AVG(score), 0) as value
        FROM learning_progress
        WHERE score IS NOT NULL 
        AND completion_date BETWEEN $1 AND $2
      `, dateRange, filters),

      // Learning hours
      this.buildMetricQuery('learning_hours', `
        SELECT COALESCE(SUM(time_spent) / 60.0, 0) as value
        FROM learning_progress
        WHERE last_access_date BETWEEN $1 AND $2
      `, dateRange, filters),

      // Engagement rate
      this.buildMetricQuery('engagement_rate', `
        SELECT COALESCE(AVG(engagement_score), 0) as value
        FROM user_analytics
        WHERE updated_at BETWEEN $1 AND $2
      `, dateRange, filters),
    ];

    const results = await Promise.all(queries);
    
    return results.reduce((acc, { metricType, value }) => {
      acc[metricType] = value;
      return acc;
    }, {} as Record<string, number>);
  }

  private async buildMetricQuery(
    metricType: string, 
    baseQuery: string, 
    dateRange: { start: Date; end: Date }, 
    filters?: Filters
  ): Promise<{ metricType: string; value: number }> {
    let query = baseQuery;
    const params = [dateRange.start, dateRange.end];

    // Apply filters
    if (filters) {
      if (filters.courseIds && filters.courseIds.length > 0) {
        query = query.replace('WHERE', 'WHERE course_id = ANY($3) AND');
        params.push(filters.courseIds);
      }
      
      if (filters.userIds && filters.userIds.length > 0) {
        query = query.replace('WHERE', 'WHERE user_id = ANY($3) AND');
        params.push(filters.userIds);
      }
    }

    const results = await analyticsRepository.getAggregatedData(query, params);
    const value = results[0]?.value || 0;
    
    return { metricType, value: parseFloat(value.toString()) };
  }

  // ============================================================================
  // Chart Data Generation
  // ============================================================================

  private async generateChartData(timeframe: Timeframe, filters?: Filters): Promise<ChartData[]> {
    const charts: ChartData[] = [];

    // User activity trend
    charts.push(await this.generateUserActivityChart(timeframe, filters));
    
    // Enrollment trend
    charts.push(await this.generateEnrollmentTrendChart(timeframe, filters));
    
    // Completion rate trend
    charts.push(await this.generateCompletionRateChart(timeframe, filters));
    
    // Course popularity
    charts.push(await this.generateCoursePopularityChart(filters));
    
    // Score distribution
    charts.push(await this.generateScoreDistributionChart(timeframe, filters));

    return charts;
  }

  private async generateUserActivityChart(timeframe: Timeframe, filters?: Filters): Promise<ChartData> {
    const dateRange = this.getDateRange(timeframe);
    const days = this.getDaysBetween(dateRange.start, dateRange.end);
    
    const query = `
      SELECT 
        DATE(last_access_date) as date,
        COUNT(DISTINCT user_id) as active_users
      FROM learning_progress
      WHERE last_access_date BETWEEN $1 AND $2
      GROUP BY DATE(last_access_date)
      ORDER BY date
    `;

    const results = await analyticsRepository.getAggregatedData(query, [dateRange.start, dateRange.end]);
    
    const data: ChartDataPoint[] = days.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const result = results.find(r => format(new Date(r.date), 'yyyy-MM-dd') === dateStr);
      return {
        x: dateStr,
        y: result ? parseInt(result.active_users) : 0,
        label: format(date, 'MMM dd'),
      };
    });

    return {
      id: 'user_activity_trend',
      title: 'Daily Active Users',
      type: 'line',
      data,
      xAxisLabel: 'Date',
      yAxisLabel: 'Active Users',
    };
  }

  private async generateEnrollmentTrendChart(timeframe: Timeframe, filters?: Filters): Promise<ChartData> {
    const dateRange = this.getDateRange(timeframe);
    const days = this.getDaysBetween(dateRange.start, dateRange.end);
    
    const query = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as enrollments
      FROM learning_progress
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY DATE(created_at)
      ORDER BY date
    `;

    const results = await analyticsRepository.getAggregatedData(query, [dateRange.start, dateRange.end]);
    
    const data: ChartDataPoint[] = days.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const result = results.find(r => format(new Date(r.date), 'yyyy-MM-dd') === dateStr);
      return {
        x: dateStr,
        y: result ? parseInt(result.enrollments) : 0,
        label: format(date, 'MMM dd'),
      };
    });

    return {
      id: 'enrollment_trend',
      title: 'Daily Enrollments',
      type: 'bar',
      data,
      xAxisLabel: 'Date',
      yAxisLabel: 'Enrollments',
    };
  }

  private async generateCompletionRateChart(timeframe: Timeframe, filters?: Filters): Promise<ChartData> {
    const dateRange = this.getDateRange(timeframe);
    
    const query = `
      SELECT 
        DATE(completion_date) as date,
        COUNT(*) as completions,
        (SELECT COUNT(*) FROM learning_progress WHERE DATE(created_at) = DATE(completion_date)) as enrollments
      FROM learning_progress
      WHERE completion_date BETWEEN $1 AND $2
      AND status = 'completed'
      GROUP BY DATE(completion_date)
      ORDER BY date
    `;

    const results = await analyticsRepository.getAggregatedData(query, [dateRange.start, dateRange.end]);
    
    const data: ChartDataPoint[] = results.map(result => {
      const completionRate = result.enrollments > 0 
        ? (result.completions / result.enrollments) * 100 
        : 0;
      
      return {
        x: format(new Date(result.date), 'yyyy-MM-dd'),
        y: Math.round(completionRate * 100) / 100,
        label: format(new Date(result.date), 'MMM dd'),
      };
    });

    return {
      id: 'completion_rate_trend',
      title: 'Daily Completion Rate',
      type: 'line',
      data,
      xAxisLabel: 'Date',
      yAxisLabel: 'Completion Rate (%)',
    };
  }

  private async generateCoursePopularityChart(filters?: Filters): Promise<ChartData> {
    const query = `
      SELECT 
        course_id,
        total_enrollments,
        popularity_score
      FROM course_analytics
      ORDER BY popularity_score DESC
      LIMIT 10
    `;

    const results = await analyticsRepository.getAggregatedData(query);
    
    const data: ChartDataPoint[] = results.map((result, index) => ({
      x: `Course ${index + 1}`,
      y: result.total_enrollments,
      label: `Course ${result.course_id.substring(0, 8)}...`,
    }));

    return {
      id: 'course_popularity',
      title: 'Top 10 Courses by Enrollment',
      type: 'bar',
      data,
      xAxisLabel: 'Courses',
      yAxisLabel: 'Enrollments',
    };
  }

  private async generateScoreDistributionChart(timeframe: Timeframe, filters?: Filters): Promise<ChartData> {
    const dateRange = this.getDateRange(timeframe);
    
    const query = `
      SELECT 
        CASE 
          WHEN score >= 90 THEN '90-100'
          WHEN score >= 80 THEN '80-89'
          WHEN score >= 70 THEN '70-79'
          WHEN score >= 60 THEN '60-69'
          ELSE '0-59'
        END as score_range,
        COUNT(*) as count
      FROM learning_progress
      WHERE score IS NOT NULL
      AND completion_date BETWEEN $1 AND $2
      GROUP BY score_range
      ORDER BY score_range DESC
    `;

    const results = await analyticsRepository.getAggregatedData(query, [dateRange.start, dateRange.end]);
    
    const data: ChartDataPoint[] = results.map(result => ({
      x: result.score_range,
      y: parseInt(result.count),
      label: result.score_range,
    }));

    return {
      id: 'score_distribution',
      title: 'Score Distribution',
      type: 'pie',
      data,
      colors: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#6B7280'],
    };
  }

  // ============================================================================
  // Summary Calculation
  // ============================================================================

  private async calculateDashboardSummary(timeframe: Timeframe, filters?: Filters): Promise<DashboardSummary> {
    const dateRange = this.getDateRange(timeframe);

    const [
      totalUsersResult,
      activeUsersResult,
      totalCoursesResult,
      totalEnrollmentsResult,
      completionRateResult,
      engagementScoreResult,
      topCoursesResult,
      recentActivityResult,
    ] = await Promise.all([
      analyticsRepository.getAggregatedData('SELECT COUNT(DISTINCT user_id) as count FROM user_analytics'),
      analyticsRepository.getAggregatedData(
        'SELECT COUNT(DISTINCT user_id) as count FROM learning_progress WHERE last_access_date BETWEEN $1 AND $2',
        [dateRange.start, dateRange.end]
      ),
      analyticsRepository.getAggregatedData('SELECT COUNT(DISTINCT course_id) as count FROM course_analytics'),
      analyticsRepository.getAggregatedData('SELECT COUNT(*) as count FROM learning_progress'),
      analyticsRepository.getAggregatedData(`
        SELECT 
          CASE 
            WHEN COUNT(*) = 0 THEN 0
            ELSE (COUNT(CASE WHEN status = 'completed' THEN 1 END)::DECIMAL / COUNT(*)::DECIMAL) * 100
          END as rate
        FROM learning_progress
      `),
      analyticsRepository.getAggregatedData('SELECT AVG(engagement_score) as score FROM user_analytics'),
      analyticsRepository.getAggregatedData(`
        SELECT course_id, total_enrollments, completion_rate
        FROM course_analytics
        ORDER BY popularity_score DESC
        LIMIT 5
      `),
      analyticsRepository.getAggregatedData(`
        SELECT 
          'enrollment' as type,
          'User enrolled in course' as description,
          created_at as timestamp,
          user_id,
          course_id
        FROM learning_progress
        WHERE created_at BETWEEN $1 AND $2
        ORDER BY created_at DESC
        LIMIT 10
      `, [dateRange.start, dateRange.end]),
    ]);

    return {
      totalUsers: parseInt(totalUsersResult[0]?.count || '0'),
      activeUsers: parseInt(activeUsersResult[0]?.count || '0'),
      totalCourses: parseInt(totalCoursesResult[0]?.count || '0'),
      totalEnrollments: parseInt(totalEnrollmentsResult[0]?.count || '0'),
      overallCompletionRate: parseFloat(completionRateResult[0]?.rate || '0'),
      averageEngagementScore: parseFloat(engagementScoreResult[0]?.score || '0'),
      topPerformingCourses: topCoursesResult.map(course => ({
        courseId: course.course_id,
        courseName: `Course ${course.course_id.substring(0, 8)}...`,
        completionRate: parseFloat(course.completion_rate),
        enrollmentCount: course.total_enrollments,
      })),
      recentActivity: recentActivityResult.map(activity => ({
        type: activity.type,
        description: activity.description,
        timestamp: new Date(activity.timestamp),
        userId: activity.user_id,
        courseId: activity.course_id,
      })),
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private getDateRange(timeframe: Timeframe): { start: Date; end: Date } {
    const end = endOfDay(new Date());
    let start: Date;

    switch (timeframe) {
      case '7d':
        start = startOfDay(subDays(end, 7));
        break;
      case '30d':
        start = startOfDay(subDays(end, 30));
        break;
      case '90d':
        start = startOfDay(subDays(end, 90));
        break;
      case '1y':
        start = startOfDay(subDays(end, 365));
        break;
      case 'all':
        start = startOfDay(subDays(end, 3650)); // 10 years
        break;
      default:
        start = startOfDay(subDays(end, 30));
    }

    return { start, end };
  }

  private getPreviousDateRange(timeframe: Timeframe): { start: Date; end: Date } {
    const current = this.getDateRange(timeframe);
    const duration = current.end.getTime() - current.start.getTime();
    
    return {
      start: new Date(current.start.getTime() - duration),
      end: new Date(current.end.getTime() - duration),
    };
  }

  private getDaysBetween(start: Date, end: Date): Date[] {
    const days: Date[] = [];
    const current = new Date(start);
    
    while (current <= end) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    return days;
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  async invalidateDashboardCache(timeframes?: Timeframe[]): Promise<void> {
    const timeframesToClear = timeframes || ['7d', '30d', '90d', '1y'];
    
    const cacheKeys = timeframesToClear.map(tf => cacheKeys.dashboard(tf));
    await cache.del(cacheKeys);
    
    logger.info('Dashboard cache invalidated', { timeframes: timeframesToClear });
  }

  async warmupDashboardCache(): Promise<void> {
    const timeframes: Timeframe[] = ['7d', '30d', '90d'];
    
    await Promise.all(
      timeframes.map(timeframe => this.getDashboard(timeframe))
    );
    
    logger.info('Dashboard cache warmed up', { timeframes });
  }
}

export const dashboardService = new DashboardService();
