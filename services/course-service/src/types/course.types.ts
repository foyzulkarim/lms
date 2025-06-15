// Course-related type definitions

// Enums
export type CourseLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type CourseStatus = 'draft' | 'review' | 'published' | 'archived' | 'deleted';
export type CourseVisibility = 'public' | 'private' | 'unlisted';
export type LessonType = 'text' | 'video' | 'audio' | 'quiz' | 'assignment' | 'live_session';
export type ResourceType = 'document' | 'video' | 'audio' | 'image' | 'archive' | 'link' | 'other';
export type ProgressStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';

// Base interfaces
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// Course Category
export interface CourseCategory extends BaseEntity {
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  iconUrl?: string;
  color?: string;
  sortOrder: number;
  isActive: boolean;
  children?: CourseCategory[];
  parent?: CourseCategory;
}

export interface CreateCourseCategoryData {
  name: string;
  description?: string;
  parentId?: string;
  iconUrl?: string;
  color?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateCourseCategoryData {
  name?: string;
  description?: string;
  parentId?: string;
  iconUrl?: string;
  color?: string;
  sortOrder?: number;
  isActive?: boolean;
}

// Course
export interface Course extends BaseEntity {
  title: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  thumbnailUrl?: string;
  bannerUrl?: string;
  instructorId: string;
  categoryId?: string;
  level: CourseLevel;
  status: CourseStatus;
  visibility: CourseVisibility;
  language: string;
  durationHours: number;
  price: number;
  currency: string;
  isFree: boolean;
  enrollmentLimit?: number;
  enrollmentCount: number;
  rating: number;
  ratingCount: number;
  tags: string[];
  prerequisites: string[];
  learningObjectives: string[];
  targetAudience?: string;
  requirements: string[];
  whatYouWillLearn: string[];
  publishedAt?: Date;
  version: number;
  
  // Relations
  category?: CourseCategory;
  modules?: CourseModule[];
  reviews?: CourseReview[];
  resources?: CourseResource[];
}

export interface CreateCourseData {
  title: string;
  description?: string;
  shortDescription?: string;
  thumbnailUrl?: string;
  bannerUrl?: string;
  categoryId?: string;
  level?: CourseLevel;
  visibility?: CourseVisibility;
  language?: string;
  price?: number;
  currency?: string;
  isFree?: boolean;
  enrollmentLimit?: number;
  tags?: string[];
  prerequisites?: string[];
  learningObjectives?: string[];
  targetAudience?: string;
  requirements?: string[];
  whatYouWillLearn?: string[];
}

export interface UpdateCourseData {
  title?: string;
  description?: string;
  shortDescription?: string;
  thumbnailUrl?: string;
  bannerUrl?: string;
  categoryId?: string;
  level?: CourseLevel;
  visibility?: CourseVisibility;
  language?: string;
  durationHours?: number;
  price?: number;
  currency?: string;
  isFree?: boolean;
  enrollmentLimit?: number;
  tags?: string[];
  prerequisites?: string[];
  learningObjectives?: string[];
  targetAudience?: string;
  requirements?: string[];
  whatYouWillLearn?: string[];
}

// Course Module
export interface CourseModule extends BaseEntity {
  courseId: string;
  title: string;
  description?: string;
  sortOrder: number;
  durationMinutes: number;
  isPublished: boolean;
  
  // Relations
  course?: Course;
  lessons?: CourseLesson[];
}

export interface CreateCourseModuleData {
  title: string;
  description?: string;
  sortOrder?: number;
  isPublished?: boolean;
}

export interface UpdateCourseModuleData {
  title?: string;
  description?: string;
  sortOrder?: number;
  isPublished?: boolean;
}

// Course Lesson
export interface CourseLesson extends BaseEntity {
  moduleId: string;
  courseId: string;
  title: string;
  slug: string;
  description?: string;
  content?: string;
  contentHtml?: string;
  lessonType: LessonType;
  sortOrder: number;
  durationMinutes: number;
  videoUrl?: string;
  videoDuration?: number;
  attachments: Attachment[];
  isPreview: boolean;
  isPublished: boolean;
  
  // Relations
  module?: CourseModule;
  course?: Course;
  progress?: CourseProgress[];
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
}

export interface CreateCourseLessonData {
  title: string;
  description?: string;
  content?: string;
  lessonType?: LessonType;
  sortOrder?: number;
  durationMinutes?: number;
  videoUrl?: string;
  videoDuration?: number;
  attachments?: Attachment[];
  isPreview?: boolean;
  isPublished?: boolean;
}

export interface UpdateCourseLessonData {
  title?: string;
  description?: string;
  content?: string;
  lessonType?: LessonType;
  sortOrder?: number;
  durationMinutes?: number;
  videoUrl?: string;
  videoDuration?: number;
  attachments?: Attachment[];
  isPreview?: boolean;
  isPublished?: boolean;
}

// Course Resource
export interface CourseResource extends BaseEntity {
  courseId: string;
  lessonId?: string;
  title: string;
  description?: string;
  resourceType: ResourceType;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  downloadCount: number;
  isDownloadable: boolean;
  
  // Relations
  course?: Course;
  lesson?: CourseLesson;
}

export interface CreateCourseResourceData {
  lessonId?: string;
  title: string;
  description?: string;
  resourceType: ResourceType;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  isDownloadable?: boolean;
}

export interface UpdateCourseResourceData {
  title?: string;
  description?: string;
  resourceType?: ResourceType;
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  isDownloadable?: boolean;
}

// Course Review
export interface CourseReview extends BaseEntity {
  courseId: string;
  userId: string;
  rating: number;
  title?: string;
  comment?: string;
  isPublished: boolean;
  helpfulCount: number;
  
  // Relations
  course?: Course;
}

export interface CreateCourseReviewData {
  rating: number;
  title?: string;
  comment?: string;
}

export interface UpdateCourseReviewData {
  rating?: number;
  title?: string;
  comment?: string;
}

// Course Progress
export interface CourseProgress extends BaseEntity {
  courseId: string;
  userId: string;
  lessonId: string;
  status: ProgressStatus;
  progressPercentage: number;
  timeSpent: number; // in seconds
  lastPosition: number; // for video/audio lessons
  completedAt?: Date;
  
  // Relations
  course?: Course;
  lesson?: CourseLesson;
}

export interface UpdateCourseProgressData {
  status?: ProgressStatus;
  progressPercentage?: number;
  timeSpent?: number;
  lastPosition?: number;
}

// Search and filtering
export interface CourseSearchCriteria {
  query?: string;
  categoryId?: string;
  level?: CourseLevel;
  language?: string;
  isFree?: boolean;
  minRating?: number;
  tags?: string[];
  instructorId?: string;
  status?: CourseStatus;
  visibility?: CourseVisibility;
}

export interface CourseSortOptions {
  sortBy?: 'title' | 'createdAt' | 'publishedAt' | 'rating' | 'enrollmentCount' | 'price';
  sortOrder?: 'asc' | 'desc';
}

// Analytics and statistics
export interface CourseStatistics {
  totalCourses: number;
  publishedCourses: number;
  draftCourses: number;
  totalEnrollments: number;
  averageRating: number;
  totalRevenue: number;
  completionRate: number;
}

export interface CourseAnalytics {
  courseId: string;
  enrollmentCount: number;
  completionCount: number;
  completionRate: number;
  averageRating: number;
  totalRatings: number;
  totalRevenue: number;
  viewCount: number;
  engagementMetrics: {
    averageTimeSpent: number;
    dropoffRate: number;
    mostPopularLessons: string[];
    leastPopularLessons: string[];
  };
}

export interface InstructorAnalytics {
  instructorId: string;
  totalCourses: number;
  publishedCourses: number;
  totalEnrollments: number;
  totalRevenue: number;
  averageRating: number;
  totalRatings: number;
  topCourses: Array<{
    courseId: string;
    title: string;
    enrollmentCount: number;
    rating: number;
  }>;
}

// Progress tracking
export interface CourseProgressSummary {
  courseId: string;
  userId: string;
  totalLessons: number;
  completedLessons: number;
  progressPercentage: number;
  totalTimeSpent: number;
  lastAccessedAt: Date;
  estimatedTimeToComplete: number;
  currentLesson?: {
    lessonId: string;
    title: string;
    moduleTitle: string;
  };
}

export interface ProgressAnalytics {
  courseId: string;
  totalEnrolled: number;
  activeStudents: number;
  completedStudents: number;
  averageProgress: number;
  averageTimeToComplete: number;
  dropoffPoints: Array<{
    lessonId: string;
    lessonTitle: string;
    dropoffRate: number;
  }>;
}

// Content validation
export interface ContentValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    wordCount: number;
    readingTime: number;
    complexity: 'low' | 'medium' | 'high';
  };
}

// Publishing workflow
export interface PublishingWorkflow {
  courseId: string;
  status: CourseStatus;
  canPublish: boolean;
  requirements: Array<{
    requirement: string;
    satisfied: boolean;
    description: string;
  }>;
  warnings: string[];
}

// Bulk operations
export interface BulkOperationResult {
  successful: number;
  failed: number;
  errors: Array<{
    id: string;
    error: string;
  }>;
}

export interface BulkUpdateCourseData {
  courseIds: string[];
  updates: UpdateCourseData;
}

// Export/Import
export interface CourseExportData {
  course: Course;
  modules: CourseModule[];
  lessons: CourseLesson[];
  resources: CourseResource[];
  metadata: {
    exportedAt: Date;
    version: string;
    format: string;
  };
}

export interface CourseImportData {
  course: CreateCourseData;
  modules: CreateCourseModuleData[];
  lessons: CreateCourseLessonData[];
  resources: CreateCourseResourceData[];
}

export interface ImportResult {
  success: boolean;
  courseId?: string;
  errors: string[];
  warnings: string[];
  statistics: {
    coursesImported: number;
    modulesImported: number;
    lessonsImported: number;
    resourcesImported: number;
  };
}
