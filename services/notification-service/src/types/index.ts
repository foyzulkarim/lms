// Core notification types
export interface NotificationRequest {
  id: string;
  type: NotificationType;
  channels: NotificationChannel[];
  recipients: NotificationRecipient[];
  
  // Content
  subject?: string;
  title: string;
  message: string;
  templateId?: string;
  templateData?: Record<string, any>;
  
  // Scheduling
  scheduleAt?: Date;
  expiresAt?: Date;
  
  // Priority and Options
  priority: NotificationPriority;
  options: NotificationOptions;
  
  // Context
  sourceService: string;
  sourceId?: string;
  courseId?: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationRecipient {
  userId: string;
  email?: string;
  pushSubscription?: PushSubscription;
  preferences?: UserNotificationPreferences;
  metadata?: Record<string, any>;
}

export interface NotificationDelivery {
  id: string;
  notificationId: string;
  userId: string;
  channel: NotificationChannel;
  
  // Delivery Details
  status: DeliveryStatus;
  attempts: number;
  maxAttempts: number;
  
  // Channel-specific data
  emailData?: EmailDeliveryData;
  pushData?: PushDeliveryData;
  
  // Tracking
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  errorMessage?: string;
  
  // Retry scheduling
  nextRetryAt?: Date;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// Enums
export enum NotificationType {
  WELCOME = 'welcome',
  COURSE_ENROLLED = 'course_enrolled',
  ASSIGNMENT_DUE = 'assignment_due',
  ASSIGNMENT_GRADED = 'assignment_graded',
  COURSE_COMPLETED = 'course_completed',
  DISCUSSION_REPLY = 'discussion_reply',
  SYSTEM_ANNOUNCEMENT = 'system_announcement',
  PASSWORD_RESET = 'password_reset',
  LOGIN_ALERT = 'login_alert',
  BULK_MESSAGE = 'bulk_message',
  CERTIFICATE_ISSUED = 'certificate_issued',
  PAYMENT_CONFIRMATION = 'payment_confirmation',
  SUBSCRIPTION_EXPIRING = 'subscription_expiring'
}

export enum NotificationChannel {
  EMAIL = 'email',
  WEB_PUSH = 'web_push'
}

export enum NotificationPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  URGENT = 4
}

export enum DeliveryStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}

export interface NotificationOptions {
  requireDeliveryConfirmation?: boolean;
  trackOpens?: boolean;
  trackClicks?: boolean;
  allowUnsubscribe?: boolean;
  respectQuietHours?: boolean;
  batchable?: boolean;
  customHeaders?: Record<string, string>;
  tags?: string[];
}

// Channel-specific data types
export interface EmailDeliveryData {
  messageId?: string;
  dispatcherJobId?: string;
  fromAddress?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  openTrackingId?: string;
  clickTrackingId?: string;
}

export interface PushDeliveryData {
  endpoint: string;
  vapidPublicKey: string;
  payload: WebPushPayload;
  ttl?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
}

export interface WebPushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  actions?: PushAction[];
  data?: Record<string, any>;
  requireInteraction?: boolean;
  silent?: boolean;
  tag?: string;
  timestamp?: number;
  vibrate?: number[];
}

export interface PushAction {
  action: string;
  title: string;
  icon?: string;
}

// Template types
export interface NotificationTemplate {
  id: string;
  name: string;
  type: NotificationType;
  channels: NotificationChannel[];
  
  // Template Content
  emailTemplate?: EmailTemplate;
  pushTemplate?: PushTemplate;
  
  // Metadata
  description?: string;
  tags: string[];
  isActive: boolean;
  version: number;
  
  // Personalization
  variables: TemplateVariable[];
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface EmailTemplate {
  subject: string;
  htmlBody: string;
  textBody: string;
  fromName?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  preheader?: string;
  customHeaders?: Record<string, string>;
}

export interface PushTemplate {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  actions?: PushAction[];
  requireInteraction?: boolean;
  silent?: boolean;
  tag?: string;
  ttl?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  data?: Record<string, any>;
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  required: boolean;
  defaultValue?: any;
  description?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
}

export interface EmailAttachment {
  filename: string;
  content: string; // Base64 encoded
  contentType: string;
  disposition?: 'attachment' | 'inline';
  contentId?: string;
}

// User preferences types
export interface UserNotificationPreferences {
  userId: string;
  
  // Global settings
  emailEnabled: boolean;
  pushEnabled: boolean;
  quietHours?: QuietHours;
  timezone?: string;
  
  // Type-specific preferences
  typePreferences: Record<NotificationType, NotificationTypePreference>;
  
  // Subscription management
  pushSubscriptions: PushSubscription[];
  emailSubscriptions: EmailSubscription[];
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationTypePreference {
  enabled: boolean;
  channels: NotificationChannel[];
  frequency?: 'immediate' | 'hourly' | 'daily' | 'weekly';
  quietHoursOverride?: boolean;
}

export interface QuietHours {
  enabled: boolean;
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  timezone: string;
  daysOfWeek?: number[]; // 0-6, Sunday = 0
}

export interface PushSubscription {
  id: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  isActive: boolean;
  subscribedAt: Date;
  lastUsed?: Date;
}

export interface EmailSubscription {
  id: string;
  email: string;
  verified: boolean;
  isDefault: boolean;
  subscribedAt: Date;
  verifiedAt?: Date;
}

// API request/response types
export interface SendNotificationRequest {
  type: NotificationType;
  channels: NotificationChannel[];
  recipients: NotificationRecipient[];
  title: string;
  message: string;
  subject?: string;
  templateId?: string;
  templateData?: Record<string, any>;
  scheduleAt?: string;
  expiresAt?: string;
  priority?: NotificationPriority;
  options?: NotificationOptions;
  sourceService: string;
  sourceId?: string;
  courseId?: string;
}

export interface SendNotificationResponse {
  notificationId: string;
  deliveries: DeliveryResponse[];
  message: string;
  scheduledAt?: string;
}

export interface DeliveryResponse {
  deliveryId: string;
  userId: string;
  channel: NotificationChannel;
  status: DeliveryStatus;
  estimatedDeliveryTime?: string;
}

export interface BulkNotificationRequest {
  type: NotificationType;
  channels: NotificationChannel[];
  title: string;
  message: string;
  subject?: string;
  templateId?: string;
  templateData?: Record<string, any>;
  recipients: NotificationRecipient[];
  batchSize?: number;
  throttleMs?: number;
  priority?: NotificationPriority;
  options?: NotificationOptions;
  sourceService: string;
  sourceId?: string;
  courseId?: string;
}

export interface BulkNotificationResponse {
  batchId: string;
  totalRecipients: number;
  estimatedDeliveryTime: string;
  batchCount: number;
}

// Template management types
export interface CreateTemplateRequest {
  name: string;
  type: NotificationType;
  channels: NotificationChannel[];
  description?: string;
  emailTemplate?: EmailTemplate;
  pushTemplate?: PushTemplate;
  variables: TemplateVariable[];
  tags?: string[];
}

export interface UpdateTemplateRequest extends Partial<CreateTemplateRequest> {
  isActive?: boolean;
}

export interface TemplateResponse {
  id: string;
  name: string;
  type: NotificationType;
  channels: NotificationChannel[];
  description?: string;
  isActive: boolean;
  version: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// Analytics types
export interface DeliveryAnalytics {
  totalNotifications: number;
  deliveryStats: Record<NotificationChannel, ChannelStats>;
  typeBreakdown: Record<NotificationType, TypeStats>;
  failureReasons: FailureReason[];
  timeSeriesData?: TimeSeriesPoint[];
}

export interface ChannelStats {
  sent: number;
  delivered: number;
  opened?: number;
  clicked?: number;
  failed: number;
  deliveryRate: number;
  openRate?: number;
  clickRate?: number;
}

export interface TypeStats {
  sent: number;
  delivered: number;
  failed: number;
  deliveryRate: number;
}

export interface FailureReason {
  reason: string;
  count: number;
  percentage: number;
}

export interface TimeSeriesPoint {
  timestamp: string;
  sent: number;
  delivered: number;
  failed: number;
}

// Event types
export interface NotificationEvent {
  eventType: string;
  timestamp: Date;
  data: Record<string, any>;
  source: string;
  version: string;
}

export interface UserEnrolledEvent {
  userId: string;
  userName: string;
  userEmail: string;
  courseId: string;
  courseName: string;
  instructorName: string;
  courseUrl: string;
  enrolledAt: Date;
}

export interface AssignmentDueEvent {
  userId: string;
  assignmentId: string;
  assignmentName: string;
  courseId: string;
  courseName: string;
  dueDate: Date;
  courseUrl: string;
}

export interface CourseCompletedEvent {
  userId: string;
  userName: string;
  courseId: string;
  courseName: string;
  completedAt: Date;
  certificateUrl?: string;
  grade?: number;
}

// External service types
export interface EmailDispatcherRequest {
  to: string | string[];
  subject: string;
  htmlBody?: string;
  textBody?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  metadata?: Record<string, any>;
  trackOpens?: boolean;
  trackClicks?: boolean;
  tags?: string[];
}

export interface EmailDispatcherResponse {
  messageId: string;
  jobId: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  estimatedDeliveryTime?: string;
}

// Utility types
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

// Database entity types (for repositories)
export interface NotificationEntity {
  id: string;
  type: string;
  channels: string[];
  subject?: string;
  title: string;
  message: string;
  template_id?: string;
  template_data?: any;
  schedule_at?: Date;
  expires_at?: Date;
  priority: number;
  options: any;
  source_service: string;
  source_id?: string;
  course_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface DeliveryEntity {
  id: string;
  notification_id: string;
  user_id: string;
  channel: string;
  status: string;
  attempts: number;
  max_attempts: number;
  email_data?: any;
  push_data?: any;
  delivered_at?: Date;
  opened_at?: Date;
  clicked_at?: Date;
  error_message?: string;
  next_retry_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface TemplateEntity {
  id: string;
  name: string;
  type: string;
  channels: string[];
  email_template?: any;
  push_template?: any;
  description?: string;
  tags: string[];
  is_active: boolean;
  version: number;
  variables: any;
  created_at: Date;
  updated_at: Date;
  created_by: string;
}

export interface PreferencesEntity {
  user_id: string;
  email_enabled: boolean;
  push_enabled: boolean;
  quiet_hours?: any;
  timezone?: string;
  type_preferences: any;
  push_subscriptions: any;
  email_subscriptions: any;
  created_at: Date;
  updated_at: Date;
}

// Error types
export class NotificationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'NotificationError';
  }
}

export class TemplateError extends NotificationError {
  constructor(message: string, details?: any) {
    super(message, 'TEMPLATE_ERROR', 400, details);
    this.name = 'TemplateError';
  }
}

export class DeliveryError extends NotificationError {
  constructor(message: string, details?: any) {
    super(message, 'DELIVERY_ERROR', 500, details);
    this.name = 'DeliveryError';
  }
}

export class ValidationError extends NotificationError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends NotificationError {
  constructor(message: string, details?: any) {
    super(message, 'RATE_LIMIT_ERROR', 429, details);
    this.name = 'RateLimitError';
  }
}
