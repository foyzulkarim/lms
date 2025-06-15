# Analytics Service Technical Specification

## 📋 Overview

**Service Name:** Analytics Service  
**Purpose:** Real-time learning analytics, reporting, and business intelligence  
**Architecture Pattern:** CQRS (Command Query Responsibility Segregation) + Event Sourcing  
**Technology Stack:** Node.js + Fastify + TypeScript + PostgreSQL + Redis  
**Port:** 3007  
**Health Check:** `/health`

## 🎯 Core Responsibilities

### Primary Functions
1. **Real-time Dashboard Data** - Aggregate and serve live metrics
2. **Learning Progress Tracking** - Track user learning journeys and outcomes
3. **Performance Metrics & KPIs** - Calculate and maintain key performance indicators
4. **Custom Report Generation** - Generate reports based on filters and date ranges
5. **Data Aggregation** - Create materialized views for fast query performance
6. **Event Processing** - Consume events from other services and update analytics data

### Business Value
- Enable data-driven decision making for educators and administrators
- Provide insights into learning effectiveness and user engagement
- Support compliance reporting and institutional requirements
- Identify at-risk learners and intervention opportunities

## 🏗️ Architecture Design

### High-Level Architecture
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   API Gateway   │────│ Analytics Service │────│   PostgreSQL    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                │                        │
                       ┌──────────────────┐    ┌─────────────────┐
                       │  Kafka Consumer  │    │      Redis      │
                       └──────────────────┘    └─────────────────┘
                                │
                       ┌──────────────────┐
                       │   Event Topics   │
                       │  - user.events   │
                       │  - course.events │
                       │  - assessment.events │
                       └──────────────────┘
```

### Service Components
- **REST API Layer** - HTTP endpoints for querying analytics data
- **Event Consumer Layer** - Kafka consumers for processing domain events
- **Data Aggregation Layer** - Real-time and batch data processing
- **Query Layer** - Optimized read models for dashboard queries
- **Caching Layer** - Redis for frequently accessed metrics

## 📊 Data Models

### Core Entities

#### User Analytics
```typescript
interface UserAnalytics {
  id: string;
  userId: string;
  totalCoursesEnrolled: number;
  totalCoursesCompleted: number;
  totalLearningHours: number;
  averageScore: number;
  lastActiveDate: Date;
  streakDays: number;
  learningPath: string[];
  skillsAcquired: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

#### Course Analytics
```typescript
interface CourseAnalytics {
  id: string;
  courseId: string;
  totalEnrollments: number;
  totalCompletions: number;
  completionRate: number;
  averageScore: number;
  averageTimeToComplete: number; // in hours
  enrollmentTrend: TrendData[];
  moduleAnalytics: ModuleAnalytics[];
  dropoffPoints: DropoffPoint[];
  createdAt: Date;
  updatedAt: Date;
}
```

#### Assessment Analytics
```typescript
interface AssessmentAnalytics {
  id: string;
  assessmentId: string;
  courseId: string;
  totalAttempts: number;
  averageScore: number;
  passRate: number;
  averageTimeSpent: number; // in minutes
  questionAnalytics: QuestionAnalytics[];
  difficultyRating: number;
  createdAt: Date;
  updatedAt: Date;
}
```

#### Dashboard Metrics
```typescript
interface DashboardMetrics {
  id: string;
  metricType: MetricType;
  value: number;
  previousValue: number;
  changePercentage: number;
  timeframe: string;
  filters: Record<string, any>;
  calculatedAt: Date;
}

enum MetricType {
  TOTAL_USERS = 'total_users',
  ACTIVE_USERS = 'active_users',
  TOTAL_COURSES = 'total_courses',
  TOTAL_ENROLLMENTS = 'total_enrollments',
  COMPLETION_RATE = 'completion_rate',
  AVERAGE_SCORE = 'average_score',
  LEARNING_HOURS = 'learning_hours'
}
```

#### Learning Progress
```typescript
interface LearningProgress {
  id: string;
  userId: string;
  courseId: string;
  moduleId?: string;
  progressPercentage: number;
  timeSpent: number; // in minutes
  lastAccessDate: Date;
  completionDate?: Date;
  score?: number;
  status: ProgressStatus;
  milestones: Milestone[];
  createdAt: Date;
  updatedAt: Date;
}

enum ProgressStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  DROPPED = 'dropped'
}
```

## 🔌 API Endpoints

### OpenAPI Specification

```yaml
openapi: 3.0.3
info:
  title: Analytics Service API
  version: 1.0.0
  description: Learning Management System Analytics Service

paths:
  /health:
    get:
      summary: Health check endpoint
      responses:
        '200':
          description: Service is healthy

  /api/v1/dashboard:
    get:
      summary: Get dashboard metrics
      parameters:
        - name: timeframe
          in: query
          schema:
            type: string
            enum: [7d, 30d, 90d, 1y]
            default: 30d
        - name: filters
          in: query
          schema:
            type: string
            description: JSON encoded filters
      responses:
        '200':
          description: Dashboard metrics
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DashboardResponse'

  /api/v1/users/{userId}/analytics:
    get:
      summary: Get user analytics
      parameters:
        - name: userId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: User analytics data
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserAnalytics'

  /api/v1/courses/{courseId}/analytics:
    get:
      summary: Get course analytics
      parameters:
        - name: courseId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Course analytics data
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CourseAnalytics'

  /api/v1/reports:
    get:
      summary: Get available reports
      responses:
        '200':
          description: List of available reports
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/ReportDefinition'

  /api/v1/reports/{reportId}/generate:
    post:
      summary: Generate a custom report
      parameters:
        - name: reportId
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ReportRequest'
      responses:
        '202':
          description: Report generation started
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ReportJob'

  /api/v1/reports/{reportId}/status/{jobId}:
    get:
      summary: Get report generation status
      parameters:
        - name: reportId
          in: path
          required: true
          schema:
            type: string
        - name: jobId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Report status
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ReportStatus'

  /api/v1/learning-progress:
    get:
      summary: Get learning progress data
      parameters:
        - name: userId
          in: query
          schema:
            type: string
        - name: courseId
          in: query
          schema:
            type: string
        - name: status
          in: query
          schema:
            type: string
            enum: [not_started, in_progress, completed, dropped]
      responses:
        '200':
          description: Learning progress data
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/LearningProgress'

components:
  schemas:
    DashboardResponse:
      type: object
      properties:
        metrics:
          type: array
          items:
            $ref: '#/components/schemas/DashboardMetrics'
        charts:
          type: array
          items:
            $ref: '#/components/schemas/ChartData'
        summary:
          $ref: '#/components/schemas/DashboardSummary'

    UserAnalytics:
      type: object
      properties:
        id:
          type: string
        userId:
          type: string
        totalCoursesEnrolled:
          type: integer
        totalCoursesCompleted:
          type: integer
        totalLearningHours:
          type: number
        averageScore:
          type: number
        lastActiveDate:
          type: string
          format: date-time
        streakDays:
          type: integer
        learningPath:
          type: array
          items:
            type: string
        skillsAcquired:
          type: array
          items:
            type: string

    CourseAnalytics:
      type: object
      properties:
        id:
          type: string
        courseId:
          type: string
        totalEnrollments:
          type: integer
        totalCompletions:
          type: integer
        completionRate:
          type: number
        averageScore:
          type: number
        averageTimeToComplete:
          type: number
        enrollmentTrend:
          type: array
          items:
            $ref: '#/components/schemas/TrendData'
```

## 🎯 Event Handling

### Consumed Events

#### User Events
```typescript
// Topic: user.events
interface UserCreatedEvent {
  eventType: 'UserCreated';
  userId: string;
  email: string;
  role: string;
  createdAt: Date;
}

interface UserEnrolledEvent {
  eventType: 'UserEnrolled';
  userId: string;
  courseId: string;
  enrolledAt: Date;
}

interface UserCompletedCourseEvent {
  eventType: 'UserCompletedCourse';
  userId: string;
  courseId: string;
  completedAt: Date;
  finalScore: number;
  timeSpent: number;
}
```

#### Course Events
```typescript
// Topic: course.events
interface CourseCreatedEvent {
  eventType: 'CourseCreated';
  courseId: string;
  title: string;
  instructorId: string;
  category: string;
  createdAt: Date;
}

interface CoursePublishedEvent {
  eventType: 'CoursePublished';
  courseId: string;
  publishedAt: Date;
}

interface ModuleCompletedEvent {
  eventType: 'ModuleCompleted';
  userId: string;
  courseId: string;
  moduleId: string;
  completedAt: Date;
  timeSpent: number;
}
```

#### Assessment Events
```typescript
// Topic: assessment.events
interface AssessmentStartedEvent {
  eventType: 'AssessmentStarted';
  userId: string;
  assessmentId: string;
  courseId: string;
  startedAt: Date;
}

interface AssessmentCompletedEvent {
  eventType: 'AssessmentCompleted';
  userId: string;
  assessmentId: string;
  courseId: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  timeSpent: number;
  completedAt: Date;
}
```

### Published Events

```typescript
// Topic: analytics.events
interface AnalyticsUpdatedEvent {
  eventType: 'AnalyticsUpdated';
  entityType: 'user' | 'course' | 'assessment';
  entityId: string;
  metrics: Record<string, any>;
  updatedAt: Date;
}

interface ReportGeneratedEvent {
  eventType: 'ReportGenerated';
  reportId: string;
  reportType: string;
  requestedBy: string;
  filePath: string;
  generatedAt: Date;
}
```

## 🗄️ Database Schema

### PostgreSQL Tables

```sql
-- User Analytics Table
CREATE TABLE user_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    total_courses_enrolled INTEGER DEFAULT 0,
    total_courses_completed INTEGER DEFAULT 0,
    total_learning_hours DECIMAL(10,2) DEFAULT 0,
    average_score DECIMAL(5,2) DEFAULT 0,
    last_active_date TIMESTAMP,
    streak_days INTEGER DEFAULT 0,
    learning_path JSONB DEFAULT '[]',
    skills_acquired JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Course Analytics Table
CREATE TABLE course_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL UNIQUE,
    total_enrollments INTEGER DEFAULT 0,
    total_completions INTEGER DEFAULT 0,
    completion_rate DECIMAL(5,2) DEFAULT 0,
    average_score DECIMAL(5,2) DEFAULT 0,
    average_time_to_complete DECIMAL(10,2) DEFAULT 0,
    enrollment_trend JSONB DEFAULT '[]',
    module_analytics JSONB DEFAULT '[]',
    dropoff_points JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Assessment Analytics Table
CREATE TABLE assessment_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL UNIQUE,
    course_id UUID NOT NULL,
    total_attempts INTEGER DEFAULT 0,
    average_score DECIMAL(5,2) DEFAULT 0,
    pass_rate DECIMAL(5,2) DEFAULT 0,
    average_time_spent DECIMAL(10,2) DEFAULT 0,
    question_analytics JSONB DEFAULT '[]',
    difficulty_rating DECIMAL(3,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Dashboard Metrics Table
CREATE TABLE dashboard_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_type VARCHAR(50) NOT NULL,
    value DECIMAL(15,2) NOT NULL,
    previous_value DECIMAL(15,2) DEFAULT 0,
    change_percentage DECIMAL(5,2) DEFAULT 0,
    timeframe VARCHAR(10) NOT NULL,
    filters JSONB DEFAULT '{}',
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_metric_type_timeframe (metric_type, timeframe)
);

-- Learning Progress Table
CREATE TABLE learning_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    course_id UUID NOT NULL,
    module_id UUID,
    progress_percentage DECIMAL(5,2) DEFAULT 0,
    time_spent INTEGER DEFAULT 0, -- in minutes
    last_access_date TIMESTAMP,
    completion_date TIMESTAMP,
    score DECIMAL(5,2),
    status VARCHAR(20) DEFAULT 'not_started',
    milestones JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, course_id, module_id)
);

-- Report Jobs Table
CREATE TABLE report_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id VARCHAR(100) NOT NULL,
    report_type VARCHAR(50) NOT NULL,
    requested_by UUID NOT NULL,
    parameters JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    file_path VARCHAR(500),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_user_analytics_user_id ON user_analytics(user_id);
CREATE INDEX idx_course_analytics_course_id ON course_analytics(course_id);
CREATE INDEX idx_assessment_analytics_course_id ON assessment_analytics(course_id);
CREATE INDEX idx_learning_progress_user_id ON learning_progress(user_id);
CREATE INDEX idx_learning_progress_course_id ON learning_progress(course_id);
CREATE INDEX idx_learning_progress_status ON learning_progress(status);
CREATE INDEX idx_report_jobs_status ON report_jobs(status);
```

## 🚀 Implementation Requirements

### Project Structure
```
services/analytics-service/
├── src/
│   ├── controllers/
│   │   ├── analytics.controller.ts
│   │   ├── dashboard.controller.ts
│   │   └── reports.controller.ts
│   ├── services/
│   │   ├── analytics.service.ts
│   │   ├── dashboard.service.ts
│   │   ├── reports.service.ts
│   │   └── aggregation.service.ts
│   ├── models/
│   │   ├── analytics.model.ts
│   │   ├── dashboard.model.ts
│   │   └── reports.model.ts
│   ├── events/
│   │   ├── handlers/
│   │   │   ├── user-event.handler.ts
│   │   │   ├── course-event.handler.ts
│   │   │   └── assessment-event.handler.ts
│   │   └── publishers/
│   │       └── analytics-event.publisher.ts
│   ├── repositories/
│   │   ├── analytics.repository.ts
│   │   └── dashboard.repository.ts
│   ├── jobs/
│   │   ├── aggregation.job.ts
│   │   └── report-generation.job.ts
│   ├── utils/
│   │   ├── calculations.ts
│   │   ├── validators.ts
│   │   └── formatters.ts
│   ├── config/
│   │   └── database.ts
│   └── main.ts
├── openapi/
│   └── analytics.yaml
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── Dockerfile
├── package.json
└── README.md
```

### Core Dependencies
```json
{
  "dependencies": {
    "fastify": "^4.24.0",
    "@fastify/cors": "^8.4.0",
    "@fastify/helmet": "^11.1.1",
    "@fastify/swagger": "^8.12.0",
    "@fastify/swagger-ui": "^2.0.0",
    "pg": "^8.11.0",
    "redis": "^4.6.0",
    "kafkajs": "^2.2.4",
    "bull": "^4.12.0",
    "zod": "^3.22.0",
    "winston": "^3.11.0",
    "prom-client": "^15.0.0",
    "csv-writer": "^1.6.0",
    "xlsx": "^0.18.5",
    "date-fns": "^2.30.0"
  },
  "devDependencies": {
    "@types/node": "^20.8.0",
    "@types/pg": "^8.10.0",
    "typescript": "^5.2.0",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "nodemon": "^3.0.0",
    "supertest": "^6.3.0"
  }
}
```

## 🔧 Configuration

### Environment Variables
```bash
# Server Configuration
PORT=3007
NODE_ENV=development
LOG_LEVEL=info

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=lms_analytics
DB_USER=analytics_user
DB_PASSWORD=analytics_password
DB_POOL_MIN=2
DB_POOL_MAX=20

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=2

# Kafka Configuration
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=analytics-service
KAFKA_GROUP_ID=analytics-group

# Authentication
JWT_SECRET=your-jwt-secret
SERVICE_API_KEY=your-service-api-key

# Report Generation
REPORTS_STORAGE_PATH=/tmp/reports
MAX_REPORT_SIZE_MB=50

# Caching
CACHE_TTL_SECONDS=300
DASHBOARD_CACHE_TTL_SECONDS=60
```

## 🧪 Testing Requirements

### Unit Tests (80%+ Coverage)
- Service layer logic
- Event handlers
- Calculation functions
- Data transformations

### Integration Tests
- Database operations
- Event processing
- API endpoints
- Report generation

### Performance Tests
- Dashboard load times
- Large dataset queries
- Concurrent user scenarios
- Memory usage patterns

### Test Data Setup
```typescript
// Test fixtures for consistent testing
const testUserAnalytics = {
  userId: 'test-user-1',
  totalCoursesEnrolled: 5,
  totalCoursesCompleted: 3,
  totalLearningHours: 45.5,
  averageScore: 85.2
};

const testCourseAnalytics = {
  courseId: 'test-course-1',
  totalEnrollments: 150,
  totalCompletions: 120,
  completionRate: 80.0,
  averageScore: 78.5
};
```

## 📈 Performance Requirements

### Response Time Targets
- Dashboard endpoints: < 500ms
- User analytics: < 200ms
- Course analytics: < 300ms
- Report generation: < 30 seconds (async)

### Throughput Requirements
- 1000 requests/minute peak load
- 10,000 events/minute processing
- 50 concurrent report generations

### Data Volume Expectations
- 10,000 users
- 1,000 courses
- 100,000 enrollments
- 1,000,000 learning progress records

## 🔒 Security Requirements

### Authentication & Authorization
- JWT token validation for all endpoints
- Role-based access control (admin, instructor, student)
- Service-to-service API key authentication

### Data Privacy
- No PII in logs
- Encrypted data at rest
- Audit trail for report access
- GDPR-compliant data handling

## 📊 Monitoring & Observability

### Metrics to Track
- API response times
- Event processing latency
- Database query performance
- Cache hit rates
- Report generation times
- Error rates by endpoint

### Health Checks
- Database connectivity
- Redis connectivity
- Kafka consumer status
- Memory usage
- CPU usage

### Logging Requirements
- Structured JSON logging
- Request/response logging
- Event processing logs
- Error tracking with stack traces
- Performance metrics logging

## 🚀 Deployment Instructions

### Docker Configuration
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3007

CMD ["npm", "start"]
```

### Docker Compose Integration
```yaml
analytics-service:
  build: ./services/analytics-service
  ports:
    - "3007:3007"
  environment:
    - NODE_ENV=production
    - DB_HOST=postgres
    - REDIS_HOST=redis
    - KAFKA_BROKERS=kafka:9092
  depends_on:
    - postgres
    - redis
    - kafka
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3007/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

### Migration Scripts
```sql
-- Initial migration
-- Run this to create all tables and indexes
-- Path: migrations/001_initial_schema.sql
```

## 📝 Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Set up Fastify server with TypeScript
- [ ] Configure PostgreSQL connection and migrations
- [ ] Set up Redis connection for caching
- [ ] Implement health check endpoint
- [ ] Add logging and monitoring

### Phase 2: Event Processing
- [ ] Set up Kafka consumers for user, course, and assessment events
- [ ] Implement event handlers for each event type
- [ ] Create data aggregation logic
- [ ] Add event publishing capabilities

### Phase 3: Analytics APIs
- [ ] Implement dashboard metrics endpoint
- [ ] Create user analytics endpoint
- [ ] Build course analytics endpoint
- [ ] Add learning progress tracking

### Phase 4: Reporting System
- [ ] Create report definition system
- [ ] Implement async report generation
- [ ] Add CSV/Excel export capabilities
- [ ] Build report status tracking

### Phase 5: Optimization & Testing
- [ ] Add comprehensive test suite
- [ ] Implement caching strategies
- [ ] Optimize database queries
- [ ] Add performance monitoring

### Phase 6: Production Readiness
- [ ] Security audit and hardening
- [ ] Load testing and optimization
- [ ] Documentation completion
- [ ] Deployment automation

## 🎯 Success Criteria

### Functional Requirements
- ✅ All API endpoints respond correctly
- ✅ Events are processed without data loss
- ✅ Reports generate successfully
- ✅ Dashboard loads within performance targets
- ✅ Data accuracy is maintained

### Non-Functional Requirements
- ✅ 99.9% uptime
- ✅ Response times meet SLA targets
- ✅ Zero data loss in event processing
- ✅ Scalable to 10x current load
- ✅ Security vulnerabilities addressed

This specification provides everything needed to build a production-ready Analytics Service that integrates seamlessly with the LMS ecosystem while maintaining high performance and reliability standards. 
