# Notification Service Technical Specification

## 🎯 **Service Overview**

The Notification Service is a critical microservice responsible for delivering multi-channel notifications to users across the LMS platform. It provides reliable, scalable, and personalized communication through email and web push notifications.

### **Core Responsibilities**
- Multi-channel notification delivery (email, web push)
- Event-driven notification processing
- Notification templates and personalization
- User preference management
- Delivery tracking and retry logic
- Bulk messaging and campaigns
- Rate limiting and throttling
- External service integration (EMAIL-Dispatcher)
- Delivery analytics and reporting

### **Service Characteristics**
- **Technology Stack:** Node.js + Fastify + TypeScript
- **Queue System:** BullMQ with Redis for job processing
- **Database:** PostgreSQL for metadata and tracking
- **External Integration:** EMAIL-Dispatcher API for email delivery
- **Push Notifications:** Web Push API with VAPID keys
- **Event Processing:** Kafka consumer for real-time notifications

---

## 🏗️ **Architecture Design**

### **High-Level Architecture**
```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│   Event Bus     │────│ Notification Service │────│ EMAIL-Dispatcher│
│   (Kafka)       │    │                      │    │                 │
└─────────────────┘    └──────────────────────┘    └─────────────────┘
                              │                              │
                    ┌─────────┼─────────────┐                │
                    │         │             │                │
            ┌───────▼───┐ ┌──▼──▼────┐ ┌────▼─────────┐ ┌───▼────┐
            │Processing │ │Templates │ │   Database   │ │Web Push│
            │  Queue    │ │& Prefs   │ │  (Metadata)  │ │Service │
            └───────────┘ └──────────┘ └──────────────┘ └────────┘
```

### **Processing Pipeline**
```
Event Received → Template Selection → Personalization → Channel Routing → 
Delivery Attempt → Status Tracking → Retry Logic → Analytics Recording
```

---

## 📊 **Data Models**

### **Notification Models**
```typescript
interface NotificationRequest {
  id: string;                          // UUID
  type: NotificationType;
  channels: NotificationChannel[];
  recipients: NotificationRecipient[];
  
  // Content
  subject?: string;                    // For email
  title: string;                      // For push notifications
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

interface NotificationRecipient {
  userId: string;
  email?: string;
  pushSubscription?: PushSubscription;
  preferences?: UserNotificationPreferences;
  metadata?: Record<string, any>;
}

interface NotificationDelivery {
  id: string;                          // UUID
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

enum NotificationType {
  WELCOME = 'welcome',
  COURSE_ENROLLED = 'course_enrolled',
  ASSIGNMENT_DUE = 'assignment_due',
  ASSIGNMENT_GRADED = 'assignment_graded',
  COURSE_COMPLETED = 'course_completed',
  DISCUSSION_REPLY = 'discussion_reply',
  SYSTEM_ANNOUNCEMENT = 'system_announcement',
  PASSWORD_RESET = 'password_reset',
  LOGIN_ALERT = 'login_alert',
  BULK_MESSAGE = 'bulk_message'
}

enum NotificationChannel {
  EMAIL = 'email',
  WEB_PUSH = 'web_push'
}

enum NotificationPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  URGENT = 4
}

enum DeliveryStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}

interface NotificationOptions {
  requireDeliveryConfirmation?: boolean;
  trackOpens?: boolean;
  trackClicks?: boolean;
  allowUnsubscribe?: boolean;
  respectQuietHours?: boolean;
  batchable?: boolean;
}

interface EmailDeliveryData {
  messageId?: string;                  // From EMAIL-Dispatcher
  dispatcherJobId?: string;
  fromAddress?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

interface PushDeliveryData {
  endpoint: string;
  vapidPublicKey: string;
  payload: WebPushPayload;
  ttl?: number;
}

interface WebPushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  actions?: PushAction[];
  data?: Record<string, any>;
  requireInteraction?: boolean;
}

interface PushAction {
  action: string;
  title: string;
  icon?: string;
}
```

### **Template Models**
```typescript
interface NotificationTemplate {
  id: string;                          // UUID
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

interface EmailTemplate {
  subject: string;
  htmlBody: string;
  textBody: string;
  fromName?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

interface PushTemplate {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  actions?: PushAction[];
  requireInteraction?: boolean;
  ttl?: number;
}

interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  required: boolean;
  defaultValue?: any;
  description?: string;
}

interface EmailAttachment {
  filename: string;
  content: string;                     // Base64 encoded
  contentType: string;
  disposition?: 'attachment' | 'inline';
}
```

### **User Preferences Models**
```typescript
interface UserNotificationPreferences {
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

interface NotificationTypePreference {
  enabled: boolean;
  channels: NotificationChannel[];
  frequency?: 'immediate' | 'hourly' | 'daily' | 'weekly';
}

interface QuietHours {
  enabled: boolean;
  startTime: string;                   // HH:mm format
  endTime: string;                     // HH:mm format
  timezone: string;
}

interface PushSubscription {
  id: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  isActive: boolean;
  subscribedAt: Date;
}

interface EmailSubscription {
  id: string;
  email: string;
  verified: boolean;
  isDefault: boolean;
  subscribedAt: Date;
}
```

### **Database Schema**
```sql
-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,
    channels VARCHAR(20)[] NOT NULL,
    subject VARCHAR(500),
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    template_id UUID,
    template_data JSONB,
    
    -- Scheduling
    schedule_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Priority and options
    priority INTEGER NOT NULL DEFAULT 2,
    options JSONB,
    
    -- Context
    source_service VARCHAR(100) NOT NULL,
    source_id VARCHAR(100),
    course_id UUID,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notification deliveries table
CREATE TABLE notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    channel VARCHAR(20) NOT NULL,
    
    -- Delivery status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    
    -- Channel-specific data
    email_data JSONB,
    push_data JSONB,
    
    -- Tracking
    delivered_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    
    -- Retry scheduling
    next_retry_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notification templates table
CREATE TABLE notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL UNIQUE,
    type VARCHAR(50) NOT NULL,
    channels VARCHAR(20)[] NOT NULL,
    
    -- Template content
    email_template JSONB,
    push_template JSONB,
    
    -- Metadata
    description TEXT,
    tags TEXT[],
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    
    -- Variables
    variables JSONB,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL
);

-- User notification preferences table
CREATE TABLE user_notification_preferences (
    user_id UUID PRIMARY KEY,
    
    -- Global settings
    email_enabled BOOLEAN DEFAULT true,
    push_enabled BOOLEAN DEFAULT true,
    quiet_hours JSONB,
    timezone VARCHAR(50),
    
    -- Type-specific preferences
    type_preferences JSONB,
    
    -- Subscriptions
    push_subscriptions JSONB,
    email_subscriptions JSONB,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_notifications_type ON notifications(type, created_at);
CREATE INDEX idx_notifications_schedule ON notifications(schedule_at) WHERE schedule_at IS NOT NULL;
CREATE INDEX idx_deliveries_user ON notification_deliveries(user_id, created_at);
CREATE INDEX idx_deliveries_status ON notification_deliveries(status, next_retry_at);
CREATE INDEX idx_deliveries_notification ON notification_deliveries(notification_id);
CREATE INDEX idx_templates_type ON notification_templates(type, is_active);
```

---

## 🔌 **API Specification**

### **Notification Endpoints**

#### **Send Notification**
```http
POST /api/v1/notifications/send
Authorization: Bearer <service-token>

Request Body:
{
  "type": "course_enrolled",
  "channels": ["email", "web_push"],
  "recipients": [
    {
      "userId": "user-uuid",
      "email": "user@example.com"
    }
  ],
  "title": "Welcome to the Course!",
  "message": "You have been enrolled in Machine Learning Fundamentals",
  "templateId": "course-enrollment-template",
  "templateData": {
    "userName": "John Doe",
    "courseName": "Machine Learning Fundamentals",
    "instructorName": "Dr. Smith",
    "courseUrl": "https://lms.example.com/courses/ml-fundamentals"
  },
  "priority": 2,
  "options": {
    "trackOpens": true,
    "trackClicks": true,
    "allowUnsubscribe": true
  },
  "sourceService": "course-service",
  "courseId": "course-uuid"
}

Response: 202 Accepted
{
  "notificationId": "notification-uuid",
  "deliveries": [
    {
      "deliveryId": "delivery-uuid",
      "userId": "user-uuid",
      "channel": "email",
      "status": "pending"
    },
    {
      "deliveryId": "delivery-uuid-2",
      "userId": "user-uuid",
      "channel": "web_push",
      "status": "pending"
    }
  ],
  "message": "Notification queued for delivery"
}
```

#### **Send Bulk Notification**
```http
POST /api/v1/notifications/send/bulk
Authorization: Bearer <service-token>

Request Body:
{
  "type": "system_announcement",
  "channels": ["email"],
  "title": "System Maintenance Notice",
  "message": "The system will be down for maintenance on Sunday...",
  "templateId": "system-announcement-template",
  "recipients": [
    {"userId": "user1", "email": "user1@example.com"},
    {"userId": "user2", "email": "user2@example.com"}
  ],
  "batchSize": 100,
  "throttleMs": 1000,
  "sourceService": "admin-service"
}

Response: 202 Accepted
{
  "batchId": "batch-uuid",
  "totalRecipients": 2,
  "estimatedDeliveryTime": "2024-01-01T00:10:00Z"
}
```

#### **Schedule Notification**
```http
POST /api/v1/notifications/schedule
Authorization: Bearer <service-token>

Request Body:
{
  "type": "assignment_due",
  "scheduleAt": "2024-01-01T09:00:00Z",
  "channels": ["email", "web_push"],
  "recipients": [{"userId": "user-uuid"}],
  "title": "Assignment Due Reminder",
  "message": "Your assignment is due in 24 hours",
  "templateId": "assignment-due-template",
  "templateData": {
    "assignmentName": "ML Project",
    "dueDate": "2024-01-02T23:59:00Z"
  }
}

Response: 201 Created
{
  "notificationId": "notification-uuid",
  "scheduledAt": "2024-01-01T09:00:00Z",
  "status": "scheduled"
}
```

### **Delivery Status Endpoints**

#### **Get Delivery Status**
```http
GET /api/v1/notifications/{notificationId}/deliveries
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "notificationId": "notification-uuid",
  "deliveries": [
    {
      "id": "delivery-uuid",
      "userId": "user-uuid",
      "channel": "email",
      "status": "delivered",
      "attempts": 1,
      "deliveredAt": "2024-01-01T00:05:00Z",
      "emailData": {
        "messageId": "email-message-id",
        "dispatcherJobId": "dispatcher-job-uuid"
      }
    },
    {
      "id": "delivery-uuid-2",
      "userId": "user-uuid",
      "channel": "web_push",
      "status": "delivered",
      "attempts": 1,
      "deliveredAt": "2024-01-01T00:05:15Z"
    }
  ]
}
```

#### **Get User Delivery History**
```http
GET /api/v1/notifications/deliveries/user/{userId}
Authorization: Bearer <jwt-token>

Query Parameters:
- page?: number (default: 1)
- limit?: number (default: 20)
- channel?: NotificationChannel
- status?: DeliveryStatus
- from?: ISO date
- to?: ISO date

Response: 200 OK
{
  "deliveries": [
    {
      "id": "delivery-uuid",
      "notificationId": "notification-uuid",
      "type": "course_enrolled",
      "channel": "email",
      "status": "delivered",
      "title": "Welcome to the Course!",
      "deliveredAt": "2024-01-01T00:05:00Z",
      "openedAt": "2024-01-01T08:15:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3
  }
}
```

### **Template Management Endpoints**

#### **Create Template**
```http
POST /api/v1/notifications/templates
Authorization: Bearer <jwt-token>

Request Body:
{
  "name": "course-enrollment-template",
  "type": "course_enrolled",
  "channels": ["email", "web_push"],
  "description": "Template for course enrollment notifications",
  "emailTemplate": {
    "subject": "Welcome to {{courseName}}!",
    "htmlBody": "<h1>Hello {{userName}}</h1><p>You've been enrolled in {{courseName}}...</p>",
    "textBody": "Hello {{userName}}, You've been enrolled in {{courseName}}...",
    "fromName": "LMS Platform"
  },
  "pushTemplate": {
    "title": "Course Enrollment",
    "body": "You've been enrolled in {{courseName}}",
    "icon": "/icons/course-icon.png",
    "actions": [
      {"action": "view", "title": "View Course"},
      {"action": "dismiss", "title": "Dismiss"}
    ]
  },
  "variables": [
    {"name": "userName", "type": "string", "required": true},
    {"name": "courseName", "type": "string", "required": true},
    {"name": "instructorName", "type": "string", "required": false},
    {"name": "courseUrl", "type": "string", "required": true}
  ],
  "tags": ["course", "enrollment"]
}

Response: 201 Created
{
  "id": "template-uuid",
  "name": "course-enrollment-template",
  "version": 1,
  "isActive": true,
  "createdAt": "2024-01-01T00:00:00Z"
}
```

#### **List Templates**
```http
GET /api/v1/notifications/templates
Authorization: Bearer <jwt-token>

Query Parameters:
- type?: NotificationType
- channel?: NotificationChannel
- active?: boolean
- page?: number
- limit?: number

Response: 200 OK
{
  "templates": [
    {
      "id": "template-uuid",
      "name": "course-enrollment-template",
      "type": "course_enrolled",
      "channels": ["email", "web_push"],
      "description": "Template for course enrollment notifications",
      "isActive": true,
      "version": 1,
      "tags": ["course", "enrollment"],
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {...}
}
```

### **User Preferences Endpoints**

#### **Get User Preferences**
```http
GET /api/v1/notifications/preferences/{userId}
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "userId": "user-uuid",
  "emailEnabled": true,
  "pushEnabled": true,
  "quietHours": {
    "enabled": true,
    "startTime": "22:00",
    "endTime": "08:00",
    "timezone": "UTC"
  },
  "typePreferences": {
    "course_enrolled": {
      "enabled": true,
      "channels": ["email", "web_push"],
      "frequency": "immediate"
    },
    "assignment_due": {
      "enabled": true,
      "channels": ["web_push"],
      "frequency": "immediate"
    }
  },
  "pushSubscriptions": [
    {
      "id": "subscription-uuid",
      "endpoint": "https://fcm.googleapis.com/fcm/send/...",
      "userAgent": "Mozilla/5.0...",
      "isActive": true,
      "subscribedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### **Update User Preferences**
```http
PUT /api/v1/notifications/preferences/{userId}
Authorization: Bearer <jwt-token>

Request Body:
{
  "emailEnabled": true,
  "pushEnabled": true,
  "quietHours": {
    "enabled": true,
    "startTime": "23:00",
    "endTime": "07:00",
    "timezone": "America/New_York"
  },
  "typePreferences": {
    "assignment_due": {
      "enabled": false,
      "channels": [],
      "frequency": "immediate"
    }
  }
}

Response: 200 OK
{
  "message": "Preferences updated successfully",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

#### **Subscribe to Push Notifications**
```http
POST /api/v1/notifications/preferences/{userId}/push/subscribe
Authorization: Bearer <jwt-token>

Request Body:
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": {
      "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8YaidfHdKUM2qM6XIFObqvy4HJBFA",
      "auth": "tBHItJI5svbpez7KI4CCXg"
    }
  },
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

Response: 201 Created
{
  "subscriptionId": "subscription-uuid",
  "message": "Push subscription created successfully"
}
```

### **Analytics Endpoints**

#### **Delivery Analytics**
```http
GET /api/v1/notifications/analytics/deliveries
Authorization: Bearer <admin-token>

Query Parameters:
- from: ISO date
- to: ISO date
- type?: NotificationType
- channel?: NotificationChannel

Response: 200 OK
{
  "totalNotifications": 15000,
  "deliveryStats": {
    "email": {
      "sent": 8000,
      "delivered": 7600,
      "opened": 3800,
      "clicked": 1200,
      "failed": 400,
      "deliveryRate": 0.95,
      "openRate": 0.50,
      "clickRate": 0.15
    },
    "web_push": {
      "sent": 7000,
      "delivered": 6800,
      "clicked": 2100,
      "failed": 200,
      "deliveryRate": 0.97,
      "clickRate": 0.31
    }
  },
  "typeBreakdown": {
    "course_enrolled": {"sent": 2000, "delivered": 1950},
    "assignment_due": {"sent": 5000, "delivered": 4800}
  },
  "failureReasons": [
    {"reason": "Invalid email", "count": 250},
    {"reason": "Push subscription expired", "count": 150}
  ]
}
```

---

## 🔄 **Processing Pipeline**

### **Notification Processing Workers**

#### **Notification Processor**
```typescript
class NotificationProcessor {
  async processNotification(notificationId: string): Promise<void> {
    const notification = await this.notificationRepository.findById(notificationId);
    
    try {
      // 1. Load template if specified
      const template = notification.templateId 
        ? await this.templateRepository.findById(notification.templateId)
        : null;
      
      // 2. Process each recipient
      for (const recipient of notification.recipients) {
        await this.processRecipient(notification, recipient, template);
      }
      
    } catch (error) {
      await this.handleProcessingError(notificationId, error);
    }
  }
  
  private async processRecipient(
    notification: NotificationRequest,
    recipient: NotificationRecipient,
    template?: NotificationTemplate
  ): Promise<void> {
    // Get user preferences
    const preferences = await this.preferencesService.getUserPreferences(recipient.userId);
    
    // Filter channels based on preferences
    const enabledChannels = this.filterChannelsByPreferences(
      notification.channels,
      notification.type,
      preferences
    );
    
    // Check quiet hours
    if (this.isQuietHours(preferences.quietHours)) {
      await this.scheduleForLater(notification, recipient, enabledChannels);
      return;
    }
    
    // Create delivery records for each channel
    for (const channel of enabledChannels) {
      await this.createDelivery(notification, recipient, channel, template);
    }
  }
  
  private async createDelivery(
    notification: NotificationRequest,
    recipient: NotificationRecipient,
    channel: NotificationChannel,
    template?: NotificationTemplate
  ): Promise<void> {
    const delivery: NotificationDelivery = {
      id: uuidv4(),
      notificationId: notification.id,
      userId: recipient.userId,
      channel,
      status: DeliveryStatus.PENDING,
      attempts: 0,
      maxAttempts: this.getMaxAttempts(notification.priority),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await this.deliveryRepository.create(delivery);
    
    // Queue for delivery
    await this.queueDelivery(delivery, notification, recipient, template);
  }
}
```

#### **Email Delivery Worker**
```typescript
class EmailDeliveryWorker {
  async processEmailDelivery(deliveryId: string): Promise<void> {
    const delivery = await this.deliveryRepository.findById(deliveryId);
    const notification = await this.notificationRepository.findById(delivery.notificationId);
    
    try {
      delivery.status = DeliveryStatus.PROCESSING;
      delivery.attempts += 1;
      await this.deliveryRepository.update(delivery);
      
      // Prepare email content
      const emailContent = await this.prepareEmailContent(notification, delivery);
      
      // Call EMAIL-Dispatcher
      const dispatcherResponse = await this.emailDispatcher.sendEmail({
        to: emailContent.to,
        subject: emailContent.subject,
        htmlBody: emailContent.htmlBody,
        textBody: emailContent.textBody,
        fromName: emailContent.fromName,
        replyTo: emailContent.replyTo,
        attachments: emailContent.attachments,
        metadata: {
          notificationId: notification.id,
          deliveryId: delivery.id,
          userId: delivery.userId
        }
      });
      
      // Update delivery with success
      delivery.status = DeliveryStatus.DELIVERED;
      delivery.deliveredAt = new Date();
      delivery.emailData = {
        messageId: dispatcherResponse.messageId,
        dispatcherJobId: dispatcherResponse.jobId,
        fromAddress: emailContent.fromName
      };
      
      await this.deliveryRepository.update(delivery);
      await this.publishDeliveryEvent(delivery, 'delivered');
      
    } catch (error) {
      await this.handleDeliveryError(delivery, error);
    }
  }
  
  private async prepareEmailContent(
    notification: NotificationRequest,
    delivery: NotificationDelivery
  ): Promise<EmailContent> {
    const recipient = await this.userService.getUser(delivery.userId);
    
    // Get template if specified
    let emailTemplate: EmailTemplate | undefined;
    if (notification.templateId) {
      const template = await this.templateRepository.findById(notification.templateId);
      emailTemplate = template?.emailTemplate;
    }
    
    // Prepare template data
    const templateData = {
      ...notification.templateData,
      userName: recipient.name,
      userEmail: recipient.email,
      unsubscribeUrl: this.generateUnsubscribeUrl(delivery.userId, notification.type)
    };
    
    return {
      to: recipient.email,
      subject: emailTemplate?.subject 
        ? this.renderTemplate(emailTemplate.subject, templateData)
        : notification.subject || notification.title,
      htmlBody: emailTemplate?.htmlBody
        ? this.renderTemplate(emailTemplate.htmlBody, templateData)
        : this.generateDefaultHtmlBody(notification, templateData),
      textBody: emailTemplate?.textBody
        ? this.renderTemplate(emailTemplate.textBody, templateData)
        : notification.message,
      fromName: emailTemplate?.fromName || this.config.defaultFromName,
      replyTo: emailTemplate?.replyTo,
      attachments: emailTemplate?.attachments
    };
  }
}
```

#### **Web Push Delivery Worker**
```typescript
class WebPushDeliveryWorker {
  async processWebPushDelivery(deliveryId: string): Promise<void> {
    const delivery = await this.deliveryRepository.findById(deliveryId);
    const notification = await this.notificationRepository.findById(delivery.notificationId);
    
    try {
      delivery.status = DeliveryStatus.PROCESSING;
      delivery.attempts += 1;
      await this.deliveryRepository.update(delivery);
      
      // Get user's push subscriptions
      const preferences = await this.preferencesService.getUserPreferences(delivery.userId);
      const subscriptions = preferences.pushSubscriptions.filter(sub => sub.isActive);
      
      if (subscriptions.length === 0) {
        throw new Error('No active push subscriptions found');
      }
      
      // Prepare push payload
      const pushPayload = await this.preparePushPayload(notification, delivery);
      
      // Send to all active subscriptions
      const results = await Promise.allSettled(
        subscriptions.map(subscription => 
          this.sendPushNotification(subscription, pushPayload)
        )
      );
      
      // Check if at least one delivery succeeded
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      
      if (successCount > 0) {
        delivery.status = DeliveryStatus.DELIVERED;
        delivery.deliveredAt = new Date();
        delivery.pushData = {
          endpoint: subscriptions[0].endpoint,
          vapidPublicKey: this.config.vapidPublicKey,
          payload: pushPayload,
          ttl: pushPayload.ttl
        };
      } else {
        throw new Error('All push subscriptions failed');
      }
      
      await this.deliveryRepository.update(delivery);
      await this.publishDeliveryEvent(delivery, 'delivered');
      
    } catch (error) {
      await this.handleDeliveryError(delivery, error);
    }
  }
  
  private async preparePushPayload(
    notification: NotificationRequest,
    delivery: NotificationDelivery
  ): Promise<WebPushPayload> {
    const recipient = await this.userService.getUser(delivery.userId);
    
    // Get template if specified
    let pushTemplate: PushTemplate | undefined;
    if (notification.templateId) {
      const template = await this.templateRepository.findById(notification.templateId);
      pushTemplate = template?.pushTemplate;
    }
    
    // Prepare template data
    const templateData = {
      ...notification.templateData,
      userName: recipient.name
    };
    
    return {
      title: pushTemplate?.title
        ? this.renderTemplate(pushTemplate.title, templateData)
        : notification.title,
      body: pushTemplate?.body
        ? this.renderTemplate(pushTemplate.body, templateData)
        : notification.message,
      icon: pushTemplate?.icon || this.config.defaultIcon,
      badge: pushTemplate?.badge || this.config.defaultBadge,
      image: pushTemplate?.image,
      actions: pushTemplate?.actions || [],
      data: {
        notificationId: notification.id,
        type: notification.type,
        courseId: notification.courseId,
        sourceId: notification.sourceId,
        url: this.generateNotificationUrl(notification)
      },
      requireInteraction: pushTemplate?.requireInteraction || false,
      ttl: pushTemplate?.ttl || 86400 // 24 hours
    };
  }
  
  private async sendPushNotification(
    subscription: PushSubscription,
    payload: WebPushPayload
  ): Promise<void> {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys
      },
      JSON.stringify(payload),
      {
        vapidDetails: {
          subject: this.config.vapidSubject,
          publicKey: this.config.vapidPublicKey,
          privateKey: this.config.vapidPrivateKey
        },
        TTL: payload.ttl
      }
    );
  }
}
```

---

## 🔄 **Event Integration**

### **Published Events**
```typescript
enum NotificationEventType {
  NOTIFICATION_SENT = 'notification.sent',
  NOTIFICATION_DELIVERED = 'notification.delivered',
  NOTIFICATION_OPENED = 'notification.opened',
  NOTIFICATION_CLICKED = 'notification.clicked',
  NOTIFICATION_FAILED = 'notification.failed',
  TEMPLATE_CREATED = 'notification.template.created',
  PREFERENCES_UPDATED = 'notification.preferences.updated'
}

class NotificationEventPublisher {
  async publishNotificationDelivered(delivery: NotificationDelivery): Promise<void> {
    await this.eventBus.publish(NotificationEventType.NOTIFICATION_DELIVERED, {
      deliveryId: delivery.id,
      notificationId: delivery.notificationId,
      userId: delivery.userId,
      channel: delivery.channel,
      deliveredAt: delivery.deliveredAt,
      attempts: delivery.attempts,
      timestamp: new Date()
    });
  }
  
  async publishNotificationFailed(delivery: NotificationDelivery, error: string): Promise<void> {
    await this.eventBus.publish(NotificationEventType.NOTIFICATION_FAILED, {
      deliveryId: delivery.id,
      notificationId: delivery.notificationId,
      userId: delivery.userId,
      channel: delivery.channel,
      error,
      attempts: delivery.attempts,
      timestamp: new Date()
    });
  }
}
```

### **Consumed Events**
```typescript
// Handle user enrollment events
class UserEnrolledHandler {
  async handle(event: UserEnrolledEvent): Promise<void> {
    await this.notificationService.sendNotification({
      type: NotificationType.COURSE_ENROLLED,
      channels: [NotificationChannel.EMAIL, NotificationChannel.WEB_PUSH],
      recipients: [{
        userId: event.userId,
        email: event.userEmail
      }],
      title: 'Course Enrollment Confirmation',
      message: `You have been enrolled in ${event.courseName}`,
      templateId: 'course-enrollment-template',
      templateData: {
        userName: event.userName,
        courseName: event.courseName,
        instructorName: event.instructorName,
        courseUrl: event.courseUrl
      },
      priority: NotificationPriority.NORMAL,
      sourceService: 'course-service',
      courseId: event.courseId
    });
  }
}

// Handle assignment due events
class AssignmentDueHandler {
  async handle(event: AssignmentDueEvent): Promise<void> {
    await this.notificationService.sendNotification({
      type: NotificationType.ASSIGNMENT_DUE,
      channels: [NotificationChannel.WEB_PUSH],
      recipients: [{userId: event.userId}],
      title: 'Assignment Due Reminder',
      message: `${event.assignmentName} is due in 24 hours`,
      templateId: 'assignment-due-template',
      templateData: {
        assignmentName: event.assignmentName,
        dueDate: event.dueDate,
        courseUrl: event.courseUrl
      },
      priority: NotificationPriority.HIGH,
      sourceService: 'assignment-service',
      courseId: event.courseId
    });
  }
}
```

---

## ⚙️ **Configuration**

### **Environment Variables**
```bash
# Server Configuration
PORT=3006
NODE_ENV=production
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/lms_notifications
REDIS_URL=redis://redis:6379

# EMAIL-Dispatcher Integration
EMAIL_DISPATCHER_URL=http://email-dispatcher:3020
EMAIL_DISPATCHER_API_KEY=your-dispatcher-api-key
DEFAULT_FROM_NAME=LMS Platform
DEFAULT_FROM_EMAIL=noreply@lms.example.com

# Web Push Configuration
VAPID_SUBJECT=mailto:admin@lms.example.com
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
DEFAULT_PUSH_ICON=/icons/notification-icon.png
DEFAULT_PUSH_BADGE=/icons/badge-icon.png

# Queue Configuration
QUEUE_CONCURRENCY=10
MAX_RETRY_ATTEMPTS=3
RETRY_DELAY_MS=5000
BATCH_SIZE=100
BULK_THROTTLE_MS=1000

# Rate Limiting
EMAIL_RATE_LIMIT=1000  # per hour per user
PUSH_RATE_LIMIT=500    # per hour per user

# Template Configuration
TEMPLATE_CACHE_TTL=3600
ENABLE_TEMPLATE_VALIDATION=true

# Analytics
ENABLE_DELIVERY_TRACKING=true
ENABLE_OPEN_TRACKING=true
ENABLE_CLICK_TRACKING=true

# Event Bus
KAFKA_BROKERS=kafka:9092
KAFKA_CLIENT_ID=notification-service
KAFKA_GROUP_ID=notification-service-group
```

---

## 📊 **Monitoring & Observability**

### **Metrics**
```typescript
const metrics = {
  notificationsSent: new promClient.Counter({
    name: 'notifications_sent_total',
    help: 'Total notifications sent',
    labelNames: ['type', 'channel', 'status']
  }),
  
  deliveryDuration: new promClient.Histogram({
    name: 'notification_delivery_duration_seconds',
    help: 'Notification delivery time',
    labelNames: ['channel', 'status']
  }),
  
  templateRenderDuration: new promClient.Histogram({
    name: 'template_render_duration_seconds',
    help: 'Template rendering time',
    labelNames: ['template_id']
  }),
  
  queueSize: new promClient.Gauge({
    name: 'notification_queue_size',
    help: 'Current notification queue size',
    labelNames: ['queue_type']
  })
};
```

---

## 🎯 **Success Criteria**

### **Functional Requirements**
- ✅ Multi-channel notification delivery (email, web push)
- ✅ Template-based messaging with personalization
- ✅ User preference management and quiet hours
- ✅ Delivery tracking and analytics
- ✅ Bulk messaging capabilities
- ✅ Integration with external EMAIL-Dispatcher
- ✅ Event-driven notification processing

### **Non-Functional Requirements**
- ✅ 99.9% uptime availability
- ✅ < 5 seconds notification processing time
- ✅ Support for 100,000+ daily notifications
- ✅ 95%+ delivery success rate
- ✅ Comprehensive error handling and retry logic
- ✅ GDPR-compliant unsubscribe mechanisms

---

This specification provides a complete blueprint for building a production-grade Notification Service that integrates with your existing EMAIL-Dispatcher and provides comprehensive multi-channel communication capabilities for the LMS platform. 
