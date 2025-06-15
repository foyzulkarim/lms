import { z } from 'zod';

// ============================================================================
// Core Analytics Types
// ============================================================================

export enum MetricType {
  TOTAL_USERS = 'total_users',
  ACTIVE_USERS = 'active_users',
  TOTAL_COURSES = 'total_courses',
  TOTAL_ENROLLMENTS = 'total_enrollments',
  COMPLETION_RATE = 'completion_rate',
  AVERAGE_SCORE = 'average_score',
  LEARNING_HOURS = 'learning_hours',
  ENGAGEMENT_RATE = 'engagement_rate',
  RETENTION_RATE = 'retention_rate',
  COURSE_POPULARITY = 'course_popularity'
}

export enum ProgressStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  DROPPED = 'dropped'
}

export enum ReportType {
  USER_PROGRESS = 'user_progress',
  COURSE_ANALYTICS = 'course_analytics',
  ENGAGEMENT_REPORT = 'engagement_report',
  COMPLETION_REPORT = 'completion_report',
  PERFORMANCE_REPORT = 'performance_report',
  CUSTOM_REPORT = 'custom_report'
}

export enum ReportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

// ============================================================================
// User Analytics
// ============================================================================

export const UserAnalyticsSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  totalCoursesEnrolled: z.number().int().min(0),
  totalCoursesCompleted: z.number().int().min(0),
  totalLearningHours: z.number().min(0),
  averageScore: z.number().min(0).max(100),
  lastActiveDate: z.date().nullable(),
  streakDays: z.number().int().min(0),
  learningPath: z.array(z.string()),
  skillsAcquired: z.array(z.string()),
  engagementScore: z.number().min(0).max(100),
  completionRate: z.number().min(0).max(100),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type UserAnalytics = z.infer<typeof UserAnalyticsSchema>;

// ============================================================================
// Course Analytics
// ============================================================================

export const ModuleAnalyticsSchema = z.object({
  moduleId: z.string().uuid(),
  moduleName: z.string(),
  totalViews: z.number().int().min(0),
  averageTimeSpent: z.number().min(0),
  completionRate: z.number().min(0).max(100),
  dropoffRate: z.number().min(0).max(100),
});

export const DropoffPointSchema = z.object({
  moduleId: z.string().uuid(),
  position: z.number().min(0).max(100),
  dropoffCount: z.number().int().min(0),
  dropoffRate: z.number().min(0).max(100),
});

export const TrendDataSchema = z.object({
  date: z.date(),
  value: z.number(),
  change: z.number().optional(),
});

export const CourseAnalyticsSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  totalEnrollments: z.number().int().min(0),
  totalCompletions: z.number().int().min(0),
  completionRate: z.number().min(0).max(100),
  averageScore: z.number().min(0).max(100),
  averageTimeToComplete: z.number().min(0),
  enrollmentTrend: z.array(TrendDataSchema),
  moduleAnalytics: z.array(ModuleAnalyticsSchema),
  dropoffPoints: z.array(DropoffPointSchema),
  popularityScore: z.number().min(0).max(100),
  difficultyRating: z.number().min(1).max(5),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CourseAnalytics = z.infer<typeof CourseAnalyticsSchema>;
export type ModuleAnalytics = z.infer<typeof ModuleAnalyticsSchema>;
export type DropoffPoint = z.infer<typeof DropoffPointSchema>;
export type TrendData = z.infer<typeof TrendDataSchema>;

// ============================================================================
// Assessment Analytics
// ============================================================================

export const QuestionAnalyticsSchema = z.object({
  questionId: z.string().uuid(),
  questionText: z.string(),
  correctAnswers: z.number().int().min(0),
  totalAttempts: z.number().int().min(0),
  successRate: z.number().min(0).max(100),
  averageTimeSpent: z.number().min(0),
  difficultyLevel: z.number().min(1).max(5),
});

export const AssessmentAnalyticsSchema = z.object({
  id: z.string().uuid(),
  assessmentId: z.string().uuid(),
  courseId: z.string().uuid(),
  totalAttempts: z.number().int().min(0),
  averageScore: z.number().min(0).max(100),
  passRate: z.number().min(0).max(100),
  averageTimeSpent: z.number().min(0),
  questionAnalytics: z.array(QuestionAnalyticsSchema),
  difficultyRating: z.number().min(1).max(5),
  retakeRate: z.number().min(0).max(100),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type AssessmentAnalytics = z.infer<typeof AssessmentAnalyticsSchema>;
export type QuestionAnalytics = z.infer<typeof QuestionAnalyticsSchema>;

// ============================================================================
// Dashboard Metrics
// ============================================================================

export const DashboardMetricsSchema = z.object({
  id: z.string().uuid(),
  metricType: z.nativeEnum(MetricType),
  value: z.number(),
  previousValue: z.number(),
  changePercentage: z.number(),
  timeframe: z.string(),
  filters: z.record(z.any()),
  calculatedAt: z.date(),
});

export type DashboardMetrics = z.infer<typeof DashboardMetricsSchema>;

// ============================================================================
// Learning Progress
// ============================================================================

export const MilestoneSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  achievedAt: z.date(),
  points: z.number().int().min(0),
});

export const LearningProgressSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  courseId: z.string().uuid(),
  moduleId: z.string().uuid().nullable(),
  progressPercentage: z.number().min(0).max(100),
  timeSpent: z.number().int().min(0),
  lastAccessDate: z.date().nullable(),
  completionDate: z.date().nullable(),
  score: z.number().min(0).max(100).nullable(),
  status: z.nativeEnum(ProgressStatus),
  milestones: z.array(MilestoneSchema),
  engagementLevel: z.enum(['low', 'medium', 'high']),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type LearningProgress = z.infer<typeof LearningProgressSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;

// ============================================================================
// Report Types
// ============================================================================

export const ReportDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.nativeEnum(ReportType),
  parameters: z.array(z.object({
    name: z.string(),
    type: z.enum(['string', 'number', 'date', 'boolean', 'array']),
    required: z.boolean(),
    description: z.string(),
    defaultValue: z.any().optional(),
  })),
  outputFormats: z.array(z.enum(['csv', 'xlsx', 'json', 'pdf'])),
  estimatedTime: z.number().int().min(1),
  maxRecords: z.number().int().min(1),
});

export const ReportRequestSchema = z.object({
  reportId: z.string(),
  parameters: z.record(z.any()),
  outputFormat: z.enum(['csv', 'xlsx', 'json', 'pdf']),
  filters: z.record(z.any()).optional(),
  dateRange: z.object({
    startDate: z.date(),
    endDate: z.date(),
  }).optional(),
});

export const ReportJobSchema = z.object({
  id: z.string().uuid(),
  reportId: z.string(),
  reportType: z.nativeEnum(ReportType),
  requestedBy: z.string().uuid(),
  parameters: z.record(z.any()),
  status: z.nativeEnum(ReportStatus),
  filePath: z.string().nullable(),
  fileSize: z.number().int().min(0).nullable(),
  recordCount: z.number().int().min(0).nullable(),
  errorMessage: z.string().nullable(),
  progress: z.number().min(0).max(100),
  estimatedCompletion: z.date().nullable(),
  createdAt: z.date(),
  completedAt: z.date().nullable(),
});

export type ReportDefinition = z.infer<typeof ReportDefinitionSchema>;
export type ReportRequest = z.infer<typeof ReportRequestSchema>;
export type ReportJob = z.infer<typeof ReportJobSchema>;

// ============================================================================
// Chart Data Types
// ============================================================================

export const ChartDataPointSchema = z.object({
  x: z.union([z.string(), z.number(), z.date()]),
  y: z.number(),
  label: z.string().optional(),
  color: z.string().optional(),
});

export const ChartDataSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['line', 'bar', 'pie', 'area', 'scatter', 'heatmap']),
  data: z.array(ChartDataPointSchema),
  xAxisLabel: z.string().optional(),
  yAxisLabel: z.string().optional(),
  colors: z.array(z.string()).optional(),
  options: z.record(z.any()).optional(),
});

export type ChartDataPoint = z.infer<typeof ChartDataPointSchema>;
export type ChartData = z.infer<typeof ChartDataSchema>;

// ============================================================================
// Dashboard Response Types
// ============================================================================

export const DashboardSummarySchema = z.object({
  totalUsers: z.number().int().min(0),
  activeUsers: z.number().int().min(0),
  totalCourses: z.number().int().min(0),
  totalEnrollments: z.number().int().min(0),
  overallCompletionRate: z.number().min(0).max(100),
  averageEngagementScore: z.number().min(0).max(100),
  topPerformingCourses: z.array(z.object({
    courseId: z.string().uuid(),
    courseName: z.string(),
    completionRate: z.number().min(0).max(100),
    enrollmentCount: z.number().int().min(0),
  })),
  recentActivity: z.array(z.object({
    type: z.string(),
    description: z.string(),
    timestamp: z.date(),
    userId: z.string().uuid().optional(),
    courseId: z.string().uuid().optional(),
  })),
});

export const DashboardResponseSchema = z.object({
  metrics: z.array(DashboardMetricsSchema),
  charts: z.array(ChartDataSchema),
  summary: DashboardSummarySchema,
  lastUpdated: z.date(),
  cacheExpiry: z.date(),
});

export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;

// ============================================================================
// API Request/Response Types
// ============================================================================

export const TimeframeSchema = z.enum(['7d', '30d', '90d', '1y', 'all']);
export type Timeframe = z.infer<typeof TimeframeSchema>;

export const FiltersSchema = z.object({
  courseIds: z.array(z.string().uuid()).optional(),
  userIds: z.array(z.string().uuid()).optional(),
  instructorIds: z.array(z.string().uuid()).optional(),
  categories: z.array(z.string()).optional(),
  dateRange: z.object({
    startDate: z.date(),
    endDate: z.date(),
  }).optional(),
  status: z.array(z.nativeEnum(ProgressStatus)).optional(),
  minScore: z.number().min(0).max(100).optional(),
  maxScore: z.number().min(0).max(100).optional(),
});

export type Filters = z.infer<typeof FiltersSchema>;

// ============================================================================
// Event Types
// ============================================================================

export const BaseEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string(),
  timestamp: z.date(),
  userId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  metadata: z.record(z.any()).optional(),
});

// User Events
export const UserCreatedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('UserCreated'),
  userId: z.string().uuid(),
  email: z.string().email(),
  role: z.string(),
  createdAt: z.date(),
});

export const UserEnrolledEventSchema = BaseEventSchema.extend({
  eventType: z.literal('UserEnrolled'),
  userId: z.string().uuid(),
  courseId: z.string().uuid(),
  enrolledAt: z.date(),
});

export const UserCompletedCourseEventSchema = BaseEventSchema.extend({
  eventType: z.literal('UserCompletedCourse'),
  userId: z.string().uuid(),
  courseId: z.string().uuid(),
  completedAt: z.date(),
  finalScore: z.number().min(0).max(100),
  timeSpent: z.number().min(0),
});

// Course Events
export const CourseCreatedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('CourseCreated'),
  courseId: z.string().uuid(),
  title: z.string(),
  instructorId: z.string().uuid(),
  category: z.string(),
  createdAt: z.date(),
});

export const ModuleCompletedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('ModuleCompleted'),
  userId: z.string().uuid(),
  courseId: z.string().uuid(),
  moduleId: z.string().uuid(),
  completedAt: z.date(),
  timeSpent: z.number().min(0),
});

// Assessment Events
export const AssessmentStartedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('AssessmentStarted'),
  userId: z.string().uuid(),
  assessmentId: z.string().uuid(),
  courseId: z.string().uuid(),
  startedAt: z.date(),
});

export const AssessmentCompletedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('AssessmentCompleted'),
  userId: z.string().uuid(),
  assessmentId: z.string().uuid(),
  courseId: z.string().uuid(),
  score: z.number().min(0).max(100),
  totalQuestions: z.number().int().min(1),
  correctAnswers: z.number().int().min(0),
  timeSpent: z.number().min(0),
  completedAt: z.date(),
});

export type BaseEvent = z.infer<typeof BaseEventSchema>;
export type UserCreatedEvent = z.infer<typeof UserCreatedEventSchema>;
export type UserEnrolledEvent = z.infer<typeof UserEnrolledEventSchema>;
export type UserCompletedCourseEvent = z.infer<typeof UserCompletedCourseEventSchema>;
export type CourseCreatedEvent = z.infer<typeof CourseCreatedEventSchema>;
export type ModuleCompletedEvent = z.infer<typeof ModuleCompletedEventSchema>;
export type AssessmentStartedEvent = z.infer<typeof AssessmentStartedEventSchema>;
export type AssessmentCompletedEvent = z.infer<typeof AssessmentCompletedEventSchema>;

export type AnalyticsEvent = 
  | UserCreatedEvent
  | UserEnrolledEvent
  | UserCompletedCourseEvent
  | CourseCreatedEvent
  | ModuleCompletedEvent
  | AssessmentStartedEvent
  | AssessmentCompletedEvent;

// ============================================================================
// Error Types
// ============================================================================

export class AnalyticsError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'AnalyticsError';
  }
}

export class ValidationError extends AnalyticsError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AnalyticsError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class DatabaseError extends AnalyticsError {
  constructor(message: string, details?: any) {
    super(message, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
  }
}

export class CacheError extends AnalyticsError {
  constructor(message: string, details?: any) {
    super(message, 'CACHE_ERROR', 500, details);
    this.name = 'CacheError';
  }
}

export class EventProcessingError extends AnalyticsError {
  constructor(message: string, details?: any) {
    super(message, 'EVENT_PROCESSING_ERROR', 500, details);
    this.name = 'EventProcessingError';
  }
}

export class ReportGenerationError extends AnalyticsError {
  constructor(message: string, details?: any) {
    super(message, 'REPORT_GENERATION_ERROR', 500, details);
    this.name = 'ReportGenerationError';
  }
}
