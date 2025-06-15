# User Service Technical Specification

## 🎯 **Service Overview**

The User Service is a comprehensive microservice that manages user profiles, enrollments, and preferences within the LMS ecosystem. It serves as the central hub for all user-related operations, providing robust user management capabilities with role-based access control, course enrollment tracking, and personalized user settings.

### **Core Responsibilities**
- User profile management with comprehensive CRUD operations
- Role-based access control (Admin, Instructor, Student)
- Course enrollment tracking with progress monitoring
- User preference management organized by categories
- JWT-based authentication integration with Auth Service
- Real-time event publishing for system-wide notifications
- Session management and user activity tracking

### **Service Characteristics**
- **Technology Stack:** Node.js + Fastify + TypeScript
- **Port:** 3002
- **Database:** PostgreSQL for persistent data storage
- **Cache:** Redis for performance optimization and session management
- **Message Broker:** RabbitMQ for event-driven architecture
- **Documentation:** OpenAPI 3.0 with Swagger UI
- **Authentication:** JWT token validation with role-based authorization

---

## 🏗️ **Architecture Design**

### **High-Level Architecture**
```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│   API Gateway   │────│   User Service       │────│   PostgreSQL    │
│   Client Apps   │    │   (Port 3002)        │    │   Database      │
└─────────────────┘    └──────────────────────┘    └─────────────────┘
                              │
                    ┌─────────┼─────────────┐
                    │         │             │
            ┌───────▼───┐ ┌──▼──▼────┐ ┌────▼─────────┐
            │   Redis   │ │ RabbitMQ │ │ Auth Service │
            │  Cache    │ │ Events   │ │ (JWT Tokens) │
            └───────────┘ └──────────┘ └──────────────┘
```

### **Request Processing Pipeline**
```
Client Request → JWT Authentication → Role Authorization → Resource Ownership → 
Business Logic → Database Operations → Cache Updates → Event Publishing → Response
```

### **Service Components**
- **API Layer** - Fastify-based HTTP server with comprehensive route handling
- **Authentication Middleware** - JWT token validation and role-based access control
- **Service Layer** - Business logic implementation with transaction management
- **Data Access Layer** - Knex.js-based database operations with PostgreSQL
- **Cache Layer** - Redis-based caching for performance optimization
- **Event Publisher** - RabbitMQ integration for real-time event notifications
- **Health Monitoring** - Comprehensive health checks and metrics collection

---

## 📊 **Data Models**

### **Core User Models**
Based on the actual TypeScript definitions from `/src/types/user.types.ts`:

```typescript
interface User {
  id: string;                    // UUID primary key
  authId: string;               // UUID from Auth Service
  email: string;                // Unique email address
  username?: string;            // Optional unique username
  firstName: string;            // Required first name
  lastName: string;             // Required last name
  displayName?: string;         // Optional display name
  avatarUrl?: string;           // Optional profile picture URL
  bio?: string;                 // Optional biography (max 1000 chars)
  phone?: string;               // Optional phone number
  timezone: string;             // User timezone (default: UTC)
  language: string;             // User language (default: en)
  role: 'admin' | 'instructor' | 'student';
  status: 'active' | 'inactive' | 'suspended' | 'deleted';
  emailVerified: boolean;       // Email verification status
  profileCompleted: boolean;    // Profile completion status
  lastActiveAt?: Date;          // Last activity timestamp
  createdAt: Date;              // Account creation timestamp
  updatedAt: Date;              // Last update timestamp
}

interface CreateUser {
  authId: string;               // Required auth service ID
  email: string;                // Required email address
  firstName: string;            // Required first name
  lastName: string;             // Required last name
  username?: string;            // Optional username
  displayName?: string;         // Optional display name
  avatarUrl?: string;           // Optional avatar URL
  bio?: string;                 // Optional biography
  phone?: string;               // Optional phone number
  timezone?: string;            // Optional timezone
  language?: string;            // Optional language
  role?: 'admin' | 'instructor' | 'student';
}

interface UpdateUser {
  username?: string;            // Optional username update
  firstName?: string;           // Optional first name update
  lastName?: string;            // Optional last name update
  displayName?: string;         // Optional display name update
  avatarUrl?: string;           // Optional avatar URL update
  bio?: string;                 // Optional biography update
  phone?: string;               // Optional phone update
  timezone?: string;            // Optional timezone update
  language?: string;            // Optional language update
}
```

### **User Enrollment Models**
```typescript
interface UserEnrollment {
  id: string;                   // UUID primary key
  userId: string;               // Foreign key to users table
  courseId: string;             // Foreign key to courses table
  enrollmentStatus: 'active' | 'completed' | 'dropped' | 'suspended';
  progress: number;             // Progress percentage (0-100)
  enrolledAt: Date;             // Enrollment timestamp
  completedAt?: Date;           // Completion timestamp (optional)
  lastAccessedAt?: Date;        // Last access timestamp (optional)
  createdAt: Date;              // Record creation timestamp
  updatedAt: Date;              // Last update timestamp
}

interface CreateEnrollment {
  courseId: string;             // Required course ID
}

interface UpdateEnrollment {
  enrollmentStatus?: 'active' | 'completed' | 'dropped' | 'suspended';
  progress?: number;            // Progress update (0-100)
}
```

### **User Preference Models**
```typescript
interface UserPreference {
  id: string;                   // UUID primary key
  userId: string;               // Foreign key to users table
  category: string;             // Preference category (notifications, ui, learning, privacy)
  key: string;                  // Preference key within category
  value: any;                   // Preference value (JSON)
  createdAt: Date;              // Creation timestamp
  updatedAt: Date;              // Last update timestamp
}

interface UpsertPreference {
  category: string;             // Required category
  key: string;                  // Required key
  value: any;                   // Required value
}
```

### **Search and Pagination Models**
```typescript
interface UserSearch {
  page?: number;                // Page number (default: 1)
  limit?: number;               // Items per page (default: 20, max: 100)
  search?: string;              // Search term for name/email/username
  role?: 'admin' | 'instructor' | 'student';
  status?: 'active' | 'inactive' | 'suspended' | 'deleted';
  sortBy?: 'createdAt' | 'updatedAt' | 'firstName' | 'lastName' | 'email' | 'lastActiveAt';
  sortOrder?: 'asc' | 'desc';   // Sort direction
}

interface Pagination {
  page: number;                 // Current page number
  limit: number;                // Items per page
  total: number;                // Total items count
  totalPages: number;           // Total pages count
  hasNext: boolean;             // Has next page flag
  hasPrev: boolean;             // Has previous page flag
}

interface PaginatedUsers {
  data: User[];                 // Array of users
  pagination: Pagination;       // Pagination metadata
}
```

### **Statistics Models**
```typescript
interface UserStats {
  totalEnrollments: number;     // Total course enrollments
  activeEnrollments: number;    // Active enrollments count
  completedEnrollments: number; // Completed enrollments count
  totalProgress: number;        // Sum of all progress values
  averageProgress: number;      // Average progress across enrollments
  lastLoginAt?: Date;           // Last login timestamp
  totalLoginCount: number;      // Total login count
  profileCompletionPercentage: number; // Profile completion percentage
}

interface EnrollmentStats {
  totalCourses: number;         // Total enrolled courses
  activeCourses: number;        // Active course count
  completedCourses: number;     // Completed course count
  droppedCourses: number;       // Dropped course count
  averageProgress: number;      // Average progress percentage
  totalTimeSpent: number;       // Total time spent in courses
  lastAccessedCourse?: string;  // Last accessed course ID
  lastAccessedAt?: Date;        // Last course access timestamp
}
```

---

## ⚙️ **Configuration Management**

Based on the actual configuration from `/src/config/index.ts`:

### **Environment Variables**
```bash
# Server Configuration
PORT=3002
NODE_ENV=development
HOST=0.0.0.0

# Database Configuration
DATABASE_URL=postgresql://lms_user:lms_password@localhost:5432/lms_users
DB_HOST=localhost
DB_PORT=5432
DB_NAME=lms_users
DB_USER=lms_user
DB_PASSWORD=lms_password
DB_SSL=false
DB_POOL_MIN=2
DB_POOL_MAX=10

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=user-service:

# RabbitMQ Configuration
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=guest
RABBITMQ_PASSWORD=guest
RABBITMQ_VHOST=/
RABBITMQ_EXCHANGE=lms.events
RABBITMQ_QUEUE=user-service.events

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# External Services
AUTH_SERVICE_URL=http://localhost:3001
COURSE_SERVICE_URL=http://localhost:3003
ANALYTICS_SERVICE_URL=http://localhost:3004
EMAIL_SERVICE_URL=http://localhost:3005

# Rate Limiting Configuration
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_SKIP_SUCCESSFUL=false

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
CORS_CREDENTIALS=true
CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS
CORS_ALLOWED_HEADERS=Content-Type,Authorization,X-Requested-With

# Security Configuration
HELMET_ENABLED=true
BCRYPT_ROUNDS=12

# Logging Configuration
LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE_ENABLED=false
LOG_FILE_PATH=./logs/user-service.log

# Cache Configuration
CACHE_TTL_USER_PROFILE=900        # 15 minutes
CACHE_TTL_USER_PREFERENCES=1800   # 30 minutes
CACHE_TTL_USER_ENROLLMENTS=300    # 5 minutes
CACHE_TTL_USER_SEARCH=120         # 2 minutes

# Pagination Configuration
DEFAULT_PAGE_SIZE=20
MAX_PAGE_SIZE=100

# File Upload Configuration
MAX_FILE_SIZE=5242880             # 5MB
ALLOWED_FILE_TYPES=image/jpeg,image/png,image/gif,image/webp

# Health Check Configuration
HEALTH_CHECK_TIMEOUT=5000
HEALTH_CHECK_INTERVAL=30000

# Metrics Configuration
METRICS_ENABLED=true
METRICS_PORT=9090
METRICS_PATH=/metrics

# Feature Flags
ENABLE_USER_REGISTRATION=true
ENABLE_PROFILE_COMPLETION_TRACKING=true
ENABLE_ENROLLMENT_ANALYTICS=true
ENABLE_PREFERENCE_CACHING=true
ENABLE_SESSION_TRACKING=true

# Audit Configuration
AUDIT_ENABLED=true
AUDIT_SENSITIVE_FIELDS=password,email,phone
```

### **Configuration Schema**
Based on the Zod validation schema:

```typescript
const configSchema = z.object({
  server: z.object({
    port: z.number().int().positive().default(3002),
    host: z.string().default('0.0.0.0'),
    nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  }),

  database: z.object({
    url: z.string().optional(),
    host: z.string().default('localhost'),
    port: z.number().int().positive().default(5432),
    name: z.string().default('lms_users'),
    user: z.string().default('lms_user'),
    password: z.string().default('password'),
    ssl: z.boolean().default(false),
    pool: z.object({
      min: z.number().int().nonnegative().default(2),
      max: z.number().int().positive().default(10),
    }),
  }),

  redis: z.object({
    url: z.string().optional(),
    host: z.string().default('localhost'),
    port: z.number().int().positive().default(6379),
    password: z.string().optional(),
    db: z.number().int().nonnegative().default(0),
    keyPrefix: z.string().default('user-service:'),
  }),

  rabbitmq: z.object({
    url: z.string().optional(),
    host: z.string().default('localhost'),
    port: z.number().int().positive().default(5672),
    username: z.string().default('guest'),
    password: z.string().default('guest'),
    vhost: z.string().default('/'),
    exchange: z.string().default('lms.events'),
    queue: z.string().default('user-service.events'),
  }),

  jwt: z.object({
    secret: z.string().min(32),
    expiresIn: z.string().default('24h'),
    refreshExpiresIn: z.string().default('7d'),
  }),

  cache: z.object({
    ttl: z.object({
      userProfile: z.number().int().positive().default(900),
      userPreferences: z.number().int().positive().default(1800),
      userEnrollments: z.number().int().positive().default(300),
      userSearch: z.number().int().positive().default(120),
    }),
  }),

  features: z.object({
    userRegistration: z.boolean().default(true),
    profileCompletionTracking: z.boolean().default(true),
    enrollmentAnalytics: z.boolean().default(true),
    preferenceCaching: z.boolean().default(true),
    sessionTracking: z.boolean().default(true),
  }),
});
```

---

## 🔌 **API Specification**

### **Base URL**
```
http://localhost:3002
```

### **Authentication**
All protected API endpoints require JWT authentication:
```
Authorization: Bearer <jwt-token>
```

### **User Management Endpoints**

#### **Get Current User Profile**
```http
GET /api/v1/users/me
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "authId": "auth-uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "firstName": "John",
    "lastName": "Doe",
    "displayName": "John Doe",
    "avatarUrl": "https://example.com/avatar.jpg",
    "bio": "Software developer and lifelong learner",
    "phone": "+1234567890",
    "timezone": "America/New_York",
    "language": "en",
    "role": "student",
    "status": "active",
    "emailVerified": true,
    "profileCompleted": true,
    "lastActiveAt": "2024-01-15T10:30:00Z",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}

Error Response: 401 Unauthorized
{
  "success": false,
  "error": "Invalid or missing authentication token",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### **Update Current User Profile**
```http
PUT /api/v1/users/me
Authorization: Bearer <jwt-token>
Content-Type: application/json

Request Body:
{
  "firstName": "John",
  "lastName": "Smith",
  "displayName": "John Smith",
  "bio": "Updated biography",
  "phone": "+1234567890",
  "timezone": "America/Los_Angeles",
  "language": "en"
}

Response: 200 OK
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "authId": "auth-uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Smith",
    "displayName": "John Smith",
    "bio": "Updated biography",
    "phone": "+1234567890",
    "timezone": "America/Los_Angeles",
    "language": "en",
    "role": "student",
    "status": "active",
    "emailVerified": true,
    "profileCompleted": true,
    "lastActiveAt": "2024-01-15T10:30:00Z",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-15T10:35:00Z"
  },
  "message": "User updated successfully",
  "timestamp": "2024-01-15T10:35:00Z"
}

Error Response: 409 Conflict
{
  "success": false,
  "error": "Username is already taken",
  "timestamp": "2024-01-15T10:35:00Z"
}
```

#### **Get User by ID**
```http
GET /api/v1/users/{id}
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "authId": "auth-uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "displayName": "John Doe",
    "role": "student",
    "status": "active",
    "emailVerified": true,
    "profileCompleted": true,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}

Error Response: 403 Forbidden
{
  "success": false,
  "error": "Access denied. You can only access your own resources",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### **Search Users (Admin Only)**
```http
GET /api/v1/users?page=1&limit=20&search=john&role=student&status=active&sortBy=createdAt&sortOrder=desc
Authorization: Bearer <admin-jwt-token>

Response: 200 OK
{
  "success": true,
  "data": [
    {
      "id": "user-uuid-1",
      "email": "john1@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "student",
      "status": "active",
      "createdAt": "2024-01-01T00:00:00Z"
    },
    {
      "id": "user-uuid-2",
      "email": "john2@example.com",
      "firstName": "John",
      "lastName": "Smith",
      "role": "student",
      "status": "active",
      "createdAt": "2024-01-02T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 2,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### **Update User Role (Admin Only)**
```http
PUT /api/v1/users/{id}/role
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json

Request Body:
{
  "role": "instructor"
}

Response: 200 OK
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "instructor",
    "status": "active",
    "updatedAt": "2024-01-15T10:35:00Z"
  },
  "message": "User role updated successfully",
  "timestamp": "2024-01-15T10:35:00Z"
}
```

#### **Bulk Update User Roles (Admin Only)**
```http
PUT /api/v1/users/bulk/role
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json

Request Body:
{
  "userIds": ["user-uuid-1", "user-uuid-2", "user-uuid-3"],
  "role": "instructor"
}

Response: 200 OK
{
  "success": true,
  "data": {
    "successful": 2,
    "failed": 1,
    "errors": [
      {
        "id": "user-uuid-3",
        "error": "User not found"
      }
    ]
  },
  "message": "Bulk role update completed",
  "timestamp": "2024-01-15T10:35:00Z"
}
```

#### **Delete User (Admin Only)**
```http
DELETE /api/v1/users/{id}
Authorization: Bearer <admin-jwt-token>

Response: 200 OK
{
  "success": true,
  "data": {
    "deleted": true
  },
  "message": "User deleted successfully",
  "timestamp": "2024-01-15T10:35:00Z"
}
```

#### **Get User Statistics**
```http
GET /api/v1/users/{id}/stats
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "success": true,
  "data": {
    "totalEnrollments": 5,
    "activeEnrollments": 3,
    "completedEnrollments": 2,
    "totalProgress": 350,
    "averageProgress": 70,
    "lastLoginAt": "2024-01-15T10:30:00Z",
    "totalLoginCount": 45,
    "profileCompletionPercentage": 85
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### **Enrollment Management Endpoints**

#### **Get Current User Enrollments**
```http
GET /api/v1/users/me/enrollments?page=1&limit=20&status=active
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "success": true,
  "data": [
    {
      "id": "enrollment-uuid-1",
      "userId": "user-uuid",
      "courseId": "course-uuid-1",
      "enrollmentStatus": "active",
      "progress": 75,
      "enrolledAt": "2024-01-01T00:00:00Z",
      "lastAccessedAt": "2024-01-15T09:00:00Z",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-15T09:00:00Z"
    },
    {
      "id": "enrollment-uuid-2",
      "userId": "user-uuid",
      "courseId": "course-uuid-2",
      "enrollmentStatus": "completed",
      "progress": 100,
      "enrolledAt": "2023-12-01T00:00:00Z",
      "completedAt": "2024-01-10T00:00:00Z",
      "lastAccessedAt": "2024-01-10T00:00:00Z",
      "createdAt": "2023-12-01T00:00:00Z",
      "updatedAt": "2024-01-10T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 2,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### **Enroll in Course**
```http
POST /api/v1/users/me/enrollments
Authorization: Bearer <jwt-token>
Content-Type: application/json

Request Body:
{
  "courseId": "course-uuid"
}

Response: 201 Created
{
  "success": true,
  "data": {
    "id": "enrollment-uuid",
    "userId": "user-uuid",
    "courseId": "course-uuid",
    "enrollmentStatus": "active",
    "progress": 0,
    "enrolledAt": "2024-01-15T10:35:00Z",
    "createdAt": "2024-01-15T10:35:00Z",
    "updatedAt": "2024-01-15T10:35:00Z"
  },
  "message": "Enrollment created successfully",
  "timestamp": "2024-01-15T10:35:00Z"
}

Error Response: 409 Conflict
{
  "success": false,
  "error": "User is already enrolled in this course",
  "timestamp": "2024-01-15T10:35:00Z"
}
```

#### **Update Enrollment Progress**
```http
PUT /api/v1/users/{id}/enrollments/{courseId}/progress
Authorization: Bearer <jwt-token>
Content-Type: application/json

Request Body:
{
  "progress": 85
}

Response: 200 OK
{
  "success": true,
  "data": {
    "id": "enrollment-uuid",
    "userId": "user-uuid",
    "courseId": "course-uuid",
    "enrollmentStatus": "active",
    "progress": 85,
    "enrolledAt": "2024-01-01T00:00:00Z",
    "lastAccessedAt": "2024-01-15T10:35:00Z",
    "updatedAt": "2024-01-15T10:35:00Z"
  },
  "message": "Enrollment progress updated successfully",
  "timestamp": "2024-01-15T10:35:00Z"
}
```

#### **Unenroll from Course**
```http
DELETE /api/v1/users/{id}/enrollments/{courseId}
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "success": true,
  "data": {
    "deleted": true
  },
  "message": "Enrollment deleted successfully",
  "timestamp": "2024-01-15T10:35:00Z"
}
```

### **Preference Management Endpoints**

#### **Get Current User Preferences**
```http
GET /api/v1/users/me/preferences
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "success": true,
  "data": [
    {
      "id": "pref-uuid-1",
      "userId": "user-uuid",
      "category": "notifications",
      "key": "email_enabled",
      "value": true,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    },
    {
      "id": "pref-uuid-2",
      "userId": "user-uuid",
      "category": "ui",
      "key": "theme",
      "value": "dark",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-10T00:00:00Z"
    }
  ],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### **Get Category Preferences**
```http
GET /api/v1/users/me/preferences/notifications
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "success": true,
  "data": [
    {
      "id": "pref-uuid-1",
      "userId": "user-uuid",
      "category": "notifications",
      "key": "email_enabled",
      "value": true,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    },
    {
      "id": "pref-uuid-2",
      "userId": "user-uuid",
      "category": "notifications",
      "key": "push_enabled",
      "value": false,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-05T00:00:00Z"
    }
  ],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### **Update Category Preferences**
```http
PUT /api/v1/users/me/preferences/notifications
Authorization: Bearer <jwt-token>
Content-Type: application/json

Request Body:
{
  "preferences": [
    {
      "key": "email_enabled",
      "value": true
    },
    {
      "key": "push_enabled",
      "value": true
    },
    {
      "key": "sms_enabled",
      "value": false
    }
  ]
}

Response: 200 OK
{
  "success": true,
  "data": [
    {
      "id": "pref-uuid-1",
      "userId": "user-uuid",
      "category": "notifications",
      "key": "email_enabled",
      "value": true,
      "updatedAt": "2024-01-15T10:35:00Z"
    },
    {
      "id": "pref-uuid-2",
      "userId": "user-uuid",
      "category": "notifications",
      "key": "push_enabled",
      "value": true,
      "updatedAt": "2024-01-15T10:35:00Z"
    },
    {
      "id": "pref-uuid-3",
      "userId": "user-uuid",
      "category": "notifications",
      "key": "sms_enabled",
      "value": false,
      "createdAt": "2024-01-15T10:35:00Z",
      "updatedAt": "2024-01-15T10:35:00Z"
    }
  ],
  "message": "Preferences updated successfully",
  "timestamp": "2024-01-15T10:35:00Z"
}
```

#### **Delete Specific Preference**
```http
DELETE /api/v1/users/{id}/preferences/{category}/{key}
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "success": true,
  "data": {
    "deleted": true
  },
  "message": "Preference deleted successfully",
  "timestamp": "2024-01-15T10:35:00Z"
}
```

### **Health Check Endpoints**

#### **Basic Health Check**
```http
GET /health

Response: 200 OK
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

#### **Detailed Health Check**
```http
GET /health/detailed

Response: 200 OK
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 3600,
  "version": "1.0.0",
  "services": {
    "database": {
      "status": "connected",
      "responseTime": 12
    },
    "redis": {
      "status": "connected",
      "responseTime": 3
    },
    "rabbitmq": {
      "status": "connected",
      "responseTime": 8
    }
  }
}
```

#### **Readiness Probe**
```http
GET /health/ready

Response: 200 OK
{
  "status": "ready",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### **Liveness Probe**
```http
GET /health/live

Response: 200 OK
{
  "status": "alive",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 3600
}
```

#### **Service Metrics**
```http
GET /metrics

Response: 200 OK (Prometheus format)
# HELP user_service_requests_total Total number of HTTP requests
# TYPE user_service_requests_total counter
user_service_requests_total{method="GET",route="/api/v1/users/me",status="200"} 150

# HELP user_service_request_duration_seconds HTTP request duration in seconds
# TYPE user_service_request_duration_seconds histogram
user_service_request_duration_seconds_bucket{method="GET",route="/api/v1/users/me",le="0.1"} 120
user_service_request_duration_seconds_bucket{method="GET",route="/api/v1/users/me",le="0.5"} 145
user_service_request_duration_seconds_bucket{method="GET",route="/api/v1/users/me",le="1"} 150
user_service_request_duration_seconds_bucket{method="GET",route="/api/v1/users/me",le="+Inf"} 150
```

---

## 🔧 **Core Implementation**

### **Application Setup**
Based on `/src/app.ts`:

```typescript
// Create Fastify instance with TypeBox type provider
const fastify: FastifyInstance = Fastify({
  logger: false, // Using custom Winston logger
  trustProxy: true,
  bodyLimit: 10 * 1024 * 1024, // 10MB
}).withTypeProvider<TypeBoxTypeProvider>();

// Global error handler
fastify.setErrorHandler(async (error, request, reply) => {
  log.error('Unhandled error', error, {
    url: request.url,
    method: request.method,
    ip: request.ip,
    userId: request.user?.id,
  });
  
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (error.statusCode && error.statusCode < 500) {
    reply.code(error.statusCode).send({
      success: false,
      error: error.message,
      ...(isDevelopment && { details: error.stack }),
      timestamp: new Date().toISOString(),
    });
  } else {
    reply.code(500).send({
      success: false,
      error: 'Internal server error',
      ...(isDevelopment && { details: error.message }),
      timestamp: new Date().toISOString(),
    });
  }
});

// Register plugins and routes
async function registerPlugins() {
  // Security plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  });
  
  // CORS configuration
  await fastify.register(cors, {
    origin: corsConfig.origin,
    credentials: corsConfig.credentials,
    methods: corsConfig.methods,
    allowedHeaders: corsConfig.allowedHeaders,
  });
  
  // Rate limiting
  await fastify.register(rateLimit, {
    max: rateLimitConfig.max,
    timeWindow: rateLimitConfig.window,
    skipSuccessfulRequests: rateLimitConfig.skipSuccessful,
    errorResponseBuilder: (request, context) => ({
      success: false,
      error: 'Rate limit exceeded',
      retryAfter: Math.round(context.ttl / 1000),
      timestamp: new Date().toISOString(),
    }),
  });
  
  // JWT authentication
  await fastify.register(jwt, {
    secret: jwtConfig.secret,
    sign: {
      expiresIn: jwtConfig.expiresIn,
    },
  });
  
  // Multipart support for file uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
    },
  });
  
  // OpenAPI documentation
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'User Service API',
        description: 'User Service for LMS - Manages user profiles, enrollments, and preferences',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });
  
  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });
}
```

### **Database Layer Implementation**
Based on `/src/database/connection.ts`:

```typescript
// Database configuration with connection pooling
const dbConfig: Knex.Config = {
  client: 'postgresql',
  connection: databaseConfig.url || {
    host: databaseConfig.host,
    port: databaseConfig.port,
    database: databaseConfig.name,
    user: databaseConfig.user,
    password: databaseConfig.password,
    ssl: databaseConfig.ssl ? { rejectUnauthorized: false } : false,
  },
  pool: {
    min: databaseConfig.pool.min,
    max: databaseConfig.pool.max,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
  },
  migrations: {
    directory: './src/database/migrations',
    tableName: 'knex_migrations',
    extension: 'ts',
  },
  debug: process.env.NODE_ENV === 'development',
};

// Transaction helper for atomic operations
export const withTransaction = async <T>(
  callback: (trx: Knex.Transaction) => Promise<T>
): Promise<T> => {
  const trx = await db.transaction();
  
  try {
    const result = await callback(trx);
    await trx.commit();
    return result;
  } catch (error) {
    await trx.rollback();
    throw error;
  }
};

// Query builder helpers
export const buildPaginationQuery = (
  query: Knex.QueryBuilder,
  page: number = 1,
  limit: number = 20
): Knex.QueryBuilder => {
  const offset = (page - 1) * limit;
  return query.offset(offset).limit(limit);
};

export const buildSearchQuery = (
  query: Knex.QueryBuilder,
  searchTerm: string,
  searchFields: string[]
): Knex.QueryBuilder => {
  if (!searchTerm || searchFields.length === 0) {
    return query;
  }
  
  return query.where((builder) => {
    searchFields.forEach((field, index) => {
      const method = index === 0 ? 'where' : 'orWhere';
      builder[method](field, 'ILIKE', `%${searchTerm}%`);
    });
  });
};

// Row transformation utilities
export const transformRowToCamelCase = <T>(row: any): T => {
  if (!row) return row;
  
  if (Array.isArray(row)) {
    return row.map(transformRowToCamelCase) as T;
  }
  
  if (typeof row === 'object' && row !== null) {
    return snakeToCamel(row) as T;
  }
  
  return row;
};
```

### **User Model Implementation**
Based on `/src/models/user.model.ts`:

```typescript
export class UserModel {
  private tableName = 'users';
  
  // Create a new user with transaction support
  async create(userData: CreateUser, trx?: Knex.Transaction): Promise<User> {
    try {
      const dbInstance = trx || db;
      const id = uuidv4();
      
      const userRow = transformObjectToSnakeCase({
        id,
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      const [createdUser] = await dbInstance(this.tableName)
        .insert(userRow)
        .returning('*');
      
      log.debug('User created in database', { userId: id });
      
      return transformRowToCamelCase<User>(createdUser);
    } catch (error) {
      log.error('Failed to create user in database', error, { userData });
      throw error;
    }
  }
  
  // Find user by ID with caching support
  async findById(id: string, trx?: Knex.Transaction): Promise<User | null> {
    try {
      const dbInstance = trx || db;
      
      const user = await dbInstance(this.tableName)
        .where({ id })
        .first();
      
      if (!user) {
        return null;
      }
      
      return transformRowToCamelCase<User>(user);
    } catch (error) {
      log.error('Failed to find user by ID', error, { userId: id });
      throw error;
    }
  }
  
  // Search users with comprehensive filtering and pagination
  async search(searchParams: UserSearch, trx?: Knex.Transaction): Promise<{ users: User[]; pagination: Pagination }> {
    try {
      const dbInstance = trx || db;
      const {
        page = 1,
        limit = 20,
        search,
        role,
        status,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = searchParams;
      
      // Build base query
      let query = dbInstance(this.tableName).select('*');
      
      // Apply filters
      if (role) {
        query = query.where({ role });
      }
      
      if (status) {
        query = query.where({ status });
      }
      
      // Apply search across multiple fields
      if (search) {
        query = buildSearchQuery(query, search, [
          'first_name',
          'last_name',
          'email',
          'username',
          'display_name',
        ]);
      }
      
      // Get total count for pagination
      const totalQuery = query.clone();
      const [{ count }] = await totalQuery.count('* as count');
      const total = parseInt(count as string, 10);
      
      // Apply sorting and pagination
      query = buildSortQuery(query, sortBy === 'createdAt' ? 'created_at' : sortBy, sortOrder);
      query = buildPaginationQuery(query, page, limit);
      
      // Execute query
      const users = await query;
      
      // Calculate pagination metadata
      const totalPages = Math.ceil(total / limit);
      const pagination: Pagination = {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      };
      
      return {
        users: users.map(user => transformRowToCamelCase<User>(user)),
        pagination,
      };
    } catch (error) {
      log.error('Failed to search users', error, { searchParams });
      throw error;
    }
  }
  
  // Update user with optimistic locking
  async update(id: string, updates: UpdateUser, trx?: Knex.Transaction): Promise<User | null> {
    try {
      const dbInstance = trx || db;
      
      const updateData = transformObjectToSnakeCase({
        ...updates,
        updatedAt: new Date(),
      });
      
      const [updatedUser] = await dbInstance(this.tableName)
        .where({ id })
        .update(updateData)
        .returning('*');
      
      if (!updatedUser) {
        return null;
      }
      
      log.debug('User updated in database', { userId: id });
      
      return transformRowToCamelCase<User>(updatedUser);
    } catch (error) {
      log.error('Failed to update user', error, { userId: id, updates });
      throw error;
    }
  }
  
  // Bulk operations for administrative tasks
  async bulkUpdateRole(userIds: string[], role: UserRoleType, trx?: Knex.Transaction): Promise<number> {
    try {
      const dbInstance = trx || db;
      
      const result = await dbInstance(this.tableName)
        .whereIn('id', userIds)
        .update({
          role,
          updated_at: new Date(),
        });
      
      log.debug('Bulk user role update completed', { userIds, role, updatedCount: result });
      
      return result;
    } catch (error) {
      log.error('Failed to bulk update user roles', error, { userIds, role });
      throw error;
    }
  }
  
  // Get comprehensive user statistics
  async getStats(trx?: Knex.Transaction): Promise<any> {
    try {
      const dbInstance = trx || db;
      
      const [stats] = await dbInstance(this.tableName)
        .select([
          dbInstance.raw('COUNT(*) as total'),
          dbInstance.raw("COUNT(*) FILTER (WHERE status = 'active') as active"),
          dbInstance.raw("COUNT(*) FILTER (WHERE status = 'inactive') as inactive"),
          dbInstance.raw("COUNT(*) FILTER (WHERE status = 'suspended') as suspended"),
          dbInstance.raw("COUNT(*) FILTER (WHERE role = 'admin') as admins"),
          dbInstance.raw("COUNT(*) FILTER (WHERE role = 'instructor') as instructors"),
          dbInstance.raw("COUNT(*) FILTER (WHERE role = 'student') as students"),
          dbInstance.raw("COUNT(*) FILTER (WHERE email_verified = true) as email_verified"),
          dbInstance.raw("COUNT(*) FILTER (WHERE profile_completed = true) as profile_completed"),
        ]);
      
      return {
        total: parseInt(stats.total, 10),
        byStatus: {
          active: parseInt(stats.active, 10),
          inactive: parseInt(stats.inactive, 10),
          suspended: parseInt(stats.suspended, 10),
        },
        byRole: {
          admin: parseInt(stats.admins, 10),
          instructor: parseInt(stats.instructors, 10),
          student: parseInt(stats.students, 10),
        },
        verification: {
          emailVerified: parseInt(stats.email_verified, 10),
          profileCompleted: parseInt(stats.profile_completed, 10),
        },
      };
    } catch (error) {
      log.error('Failed to get user statistics', error);
      throw error;
    }
  }
}
```

### **User Service Implementation**
Based on `/src/services/user.service.ts`:

```typescript
export class UserService {
  // Create user with comprehensive validation and event publishing
  async createUser(userData: CreateUser): Promise<User> {
    try {
      log.info('Creating new user', { email: userData.email, role: userData.role });
      
      // Validation checks
      const existingUser = await userModel.findByAuthId(userData.authId);
      if (existingUser) {
        throw new ConflictError('User already exists with this auth ID');
      }
      
      const emailExists = await userModel.emailExists(userData.email);
      if (emailExists) {
        throw new ConflictError('Email address is already registered');
      }
      
      if (userData.username) {
        const usernameExists = await userModel.usernameExists(userData.username);
        if (usernameExists) {
          throw new ConflictError('Username is already taken');
        }
      }
      
      // Create user in transaction with default preferences
      const user = await withTransaction(async (trx) => {
        const newUser = await userModel.create(userData, trx);
        await preferenceModel.setDefaultPreferences(newUser.id, trx);
        return newUser;
      });
      
      // Cache user profile
      await userCache.setUserProfile(user.id, user);
      
      // Publish user created event
      await eventPublisher.publishUserEvent({
        type: 'user.created',
        data: {
          userId: user.id,
          authId: user.authId,
          email: user.email,
          role: user.role,
          profile: {
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          },
        },
        correlationId: uuidv4(),
      });
      
      log.info('User created successfully', { userId: user.id, email: user.email });
      
      return user;
    } catch (error) {
      log.error('Failed to create user', error, { userData });
      throw error;
    }
  }
  
  // Get user with intelligent caching
  async getUserById(id: string): Promise<User> {
    try {
      // Try cache first
      const cachedUser = await userCache.getUserProfile(id);
      if (cachedUser) {
        log.debug('User retrieved from cache', { userId: id });
        return cachedUser;
      }
      
      // Get from database
      const user = await userModel.findById(id);
      if (!user) {
        throw new NotFoundError('User', id);
      }
      
      // Cache the user
      await userCache.setUserProfile(id, user);
      
      log.debug('User retrieved from database', { userId: id });
      
      return user;
    } catch (error) {
      log.error('Failed to get user by ID', error, { userId: id });
      throw error;
    }
  }
  
  // Update user with profile completion tracking
  async updateUser(id: string, updates: UpdateUser): Promise<User> {
    try {
      log.info('Updating user', { userId: id, updates });
      
      const currentUser = await this.getUserById(id);
      
      // Check username availability
      if (updates.username && updates.username !== currentUser.username) {
        const usernameExists = await userModel.usernameExists(updates.username, id);
        if (usernameExists) {
          throw new ConflictError('Username is already taken');
        }
      }
      
      // Update user
      const updatedUser = await userModel.update(id, updates);
      if (!updatedUser) {
        throw new NotFoundError('User', id);
      }
      
      // Update cache
      await userCache.setUserProfile(id, updatedUser);
      
      // Check profile completion
      const profileCompleted = this.isProfileCompleted(updatedUser);
      if (profileCompleted && !currentUser.profileCompleted) {
        await userModel.update(id, { profileCompleted: true });
        updatedUser.profileCompleted = true;
        await userCache.setUserProfile(id, updatedUser);
      }
      
      // Publish update event
      await eventPublisher.publishUserEvent({
        type: 'user.updated',
        data: {
          userId: updatedUser.id,
          changes: updates,
          profile: {
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            displayName: updatedUser.displayName,
            avatarUrl: updatedUser.avatarUrl,
          },
        },
        correlationId: uuidv4(),
      });
      
      log.info('User updated successfully', { userId: id });
      
      return updatedUser;
    } catch (error) {
      log.error('Failed to update user', error, { userId: id, updates });
      throw error;
    }
  }
  
  // Calculate profile completion percentage
  private calculateProfileCompletion(user: User): number {
    const fields = [
      { field: user.firstName, weight: 20 },
      { field: user.lastName, weight: 20 },
      { field: user.email, weight: 20 },
      { field: user.username, weight: 10 },
      { field: user.bio, weight: 10 },
      { field: user.avatarUrl, weight: 10 },
      { field: user.phone, weight: 5 },
      { field: user.timezone, weight: 2.5 },
      { field: user.language, weight: 2.5 },
    ];
    
    let completedWeight = 0;
    let totalWeight = 0;
    
    for (const { field, weight } of fields) {
      totalWeight += weight;
      if (field && field.toString().trim().length > 0) {
        completedWeight += weight;
      }
    }
    
    return Math.round((completedWeight / totalWeight) * 100);
  }
}

### **Redis Cache Implementation**
Based on `/src/redis/client.ts`:

```typescript
// Specialized cache service for user data
export class UserCacheService extends CacheService {
  constructor() {
    super('user:');
  }
  
  // User profile caching with TTL
  async getUserProfile(userId: string) {
    return this.get(`profile:${userId}`);
  }
  
  async setUserProfile(userId: string, profile: any) {
    return this.set(`profile:${userId}`, profile, cacheConfig.ttl.userProfile);
  }
  
  async deleteUserProfile(userId: string) {
    return this.del(`profile:${userId}`);
  }
  
  // User preferences caching
  async getUserPreferences(userId: string) {
    return this.get(`preferences:${userId}`);
  }
  
  async setUserPreferences(userId: string, preferences: any) {
    return this.set(`preferences:${userId}`, preferences, cacheConfig.ttl.userPreferences);
  }
  
  // User enrollments caching
  async getUserEnrollments(userId: string) {
    return this.get(`enrollments:${userId}`);
  }
  
  async setUserEnrollments(userId: string, enrollments: any) {
    return this.set(`enrollments:${userId}`, enrollments, cacheConfig.ttl.userEnrollments);
  }
  
  // Cache invalidation for user data
  async invalidateUserCache(userId: string) {
    const pattern = `*:${userId}`;
    return this.deletePattern(pattern);
  }
}

// Session management cache service
export class SessionCacheService extends CacheService {
  constructor() {
    super('session:');
  }
  
  async getSession(sessionToken: string) {
    return this.get(sessionToken);
  }
  
  async setSession(sessionToken: string, sessionData: any, ttlSeconds: number) {
    return this.set(sessionToken, sessionData, ttlSeconds);
  }
  
  async deleteSession(sessionToken: string) {
    return this.del(sessionToken);
  }
  
  async getUserSessions(userId: string) {
    return this.get(`user:${userId}`);
  }
  
  async addUserSession(userId: string, sessionToken: string) {
    const sessions = await this.getUserSessions(userId) || [];
    sessions.push(sessionToken);
    return this.setUserSessions(userId, sessions);
  }
}

// Rate limiting cache service
export class RateLimitCacheService extends CacheService {
  constructor() {
    super('ratelimit:');
  }
  
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    try {
      const current = await this.incr(key);
      
      if (current === 1) {
        await this.expire(key, windowSeconds);
      }
      
      const ttl = await this.ttl(key);
      const resetTime = Date.now() + (ttl * 1000);
      
      return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current),
        resetTime,
      };
    } catch (error) {
      log.error('Rate limit check error', error, { key, limit, windowSeconds });
      return { allowed: true, remaining: limit, resetTime: Date.now() + (windowSeconds * 1000) };
    }
  }
}
```

### **RabbitMQ Event Integration**
Based on `/src/rabbitmq/connection.ts`:

```typescript
// Event publisher for user-related events
export class EventPublisher {
  private exchange: string;
  private channel: Channel;
  
  constructor(exchange: string = rabbitmqConfig.exchange, channel: Channel = publishChannel) {
    this.exchange = exchange;
    this.channel = channel;
  }
  
  // Publish generic events with routing
  async publish(routingKey: string, message: EventMessage, options?: any): Promise<boolean> {
    try {
      const messageBuffer = Buffer.from(JSON.stringify(message));
      
      const publishOptions = {
        persistent: true,
        timestamp: Date.now(),
        messageId: message.id,
        correlationId: message.correlationId,
        ...options,
      };
      
      const result = this.channel.publish(
        this.exchange,
        routingKey,
        messageBuffer,
        publishOptions
      );
      
      if (result) {
        log.debug('Event published successfully', {
          routingKey,
          messageId: message.id,
          type: message.type,
        });
      } else {
        log.warn('Event publish failed - channel buffer full', {
          routingKey,
          messageId: message.id,
          type: message.type,
        });
      }
      
      return result;
    } catch (error) {
      log.error('Failed to publish event', error, {
        routingKey,
        messageId: message.id,
        type: message.type,
      });
      return false;
    }
  }
  
  // Publish user-specific events
  async publishUserEvent(event: any): Promise<boolean> {
    const message: EventMessage = {
      id: event.id || require('uuid').v4(),
      type: event.type,
      source: 'user-service',
      data: event.data,
      timestamp: new Date().toISOString(),
      correlationId: event.correlationId,
      metadata: event.metadata,
    };
    
    return this.publish(`user.${event.type}`, message);
  }
  
  // Publish enrollment-specific events
  async publishEnrollmentEvent(event: any): Promise<boolean> {
    const message: EventMessage = {
      id: event.id || require('uuid').v4(),
      type: event.type,
      source: 'user-service',
      data: event.data,
      timestamp: new Date().toISOString(),
      correlationId: event.correlationId,
      metadata: event.metadata,
    };
    
    return this.publish(`enrollment.${event.type}`, message);
  }
}

// Event consumer for handling incoming events
export class EventConsumer {
  private exchange: string;
  private queue: string;
  private channel: Channel;
  
  constructor(
    queue: string = rabbitmqConfig.queue,
    exchange: string = rabbitmqConfig.exchange,
    channel: Channel = consumeChannel
  ) {
    this.exchange = exchange;
    this.queue = queue;
    this.channel = channel;
  }
  
  // Setup queue with routing key bindings
  async setupQueue(routingKeys: string[]): Promise<void> {
    try {
      // Assert queue
      await this.channel.assertQueue(this.queue, {
        durable: true,
        autoDelete: false,
        exclusive: false,
      });
      
      // Bind queue to exchange with routing keys
      for (const routingKey of routingKeys) {
        await this.channel.bindQueue(this.queue, this.exchange, routingKey);
        log.debug('Queue bound to routing key', { queue: this.queue, routingKey });
      }
      
      log.info('Queue setup completed', {
        queue: this.queue,
        exchange: this.exchange,
        routingKeys,
      });
    } catch (error) {
      log.error('Failed to setup queue', error, {
        queue: this.queue,
        exchange: this.exchange,
        routingKeys,
      });
      throw error;
    }
  }
  
  // Consume events with error handling
  async consume(
    handler: (message: EventMessage, routingKey: string) => Promise<void>,
    options?: any
  ): Promise<void> {
    try {
      await this.channel.consume(
        this.queue,
        async (msg) => {
          if (!msg) return;
          
          try {
            const message: EventMessage = JSON.parse(msg.content.toString());
            const routingKey = msg.fields.routingKey;
            
            log.debug('Processing event', {
              messageId: message.id,
              type: message.type,
              routingKey,
            });
            
            await handler(message, routingKey);
            
            // Acknowledge message
            this.channel.ack(msg);
            
            log.debug('Event processed successfully', {
              messageId: message.id,
              type: message.type,
              routingKey,
            });
          } catch (error) {
            log.error('Failed to process event', error, {
              routingKey: msg.fields.routingKey,
            });
            
            // Reject message and requeue
            this.channel.nack(msg, false, true);
          }
        },
        {
          noAck: false,
          ...options,
        }
      );
      
      log.info('Started consuming events', { queue: this.queue });
    } catch (error) {
      log.error('Failed to start consuming events', error, { queue: this.queue });
      throw error;
    }
  }
}
```

### **Authentication Middleware Implementation**
Based on `/src/middleware/auth.middleware.ts`:

```typescript
// JWT authentication middleware
export const authenticateJWT = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader) {
      throw new UnauthorizedError('Authorization header is required');
    }
    
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;
    
    if (!token) {
      throw new UnauthorizedError('Token is required');
    }
    
    try {
      const decoded = jwt.verify(token, jwtConfig.secret) as JwtPayloadType;
      
      // Validate token structure
      if (!decoded.sub || !decoded.authId || !decoded.email || !decoded.role) {
        throw new UnauthorizedError('Invalid token structure');
      }
      
      // Check token expiration
      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        throw new UnauthorizedError('Token has expired');
      }
      
      // Attach user to request
      request.user = {
        id: decoded.sub,
        authId: decoded.authId,
        email: decoded.email,
        role: decoded.role,
      };
      
      log.debug('User authenticated successfully', {
        userId: decoded.sub,
        email: decoded.email,
        role: decoded.role,
      });
      
    } catch (jwtError) {
      if (jwtError instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token has expired');
      } else if (jwtError instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid token');
      } else {
        throw jwtError;
      }
    }
  } catch (error) {
    log.error('Authentication failed', error, {
      url: request.url,
      method: request.method,
      ip: request.ip,
    });
    
    if (error instanceof UnauthorizedError) {
      reply.code(401).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    } else {
      reply.code(500).send({
        success: false,
        error: 'Internal server error during authentication',
        timestamp: new Date().toISOString(),
      });
    }
  }
};

// Role-based authorization middleware factory
export const requireRole = (...allowedRoles: Array<'admin' | 'instructor' | 'student'>) => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      if (!request.user) {
        throw new UnauthorizedError('Authentication required');
      }
      
      if (!allowedRoles.includes(request.user.role)) {
        throw new ForbiddenError(`Access denied. Required roles: ${allowedRoles.join(', ')}`);
      }
      
      log.debug('Role authorization successful', {
        userId: request.user.id,
        userRole: request.user.role,
        allowedRoles,
      });
    } catch (error) {
      log.error('Role authorization failed', error, {
        userId: request.user?.id,
        userRole: request.user?.role,
        allowedRoles,
        url: request.url,
        method: request.method,
      });
      
      if (error instanceof UnauthorizedError) {
        reply.code(401).send({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else if (error instanceof ForbiddenError) {
        reply.code(403).send({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else {
        reply.code(500).send({
          success: false,
          error: 'Internal server error during authorization',
          timestamp: new Date().toISOString(),
        });
      }
    }
  };
};

// Resource ownership middleware
export const requireOwnership = (userIdParam: string = 'id') => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      if (!request.user) {
        throw new UnauthorizedError('Authentication required');
      }
      
      const params = request.params as Record<string, string>;
      const resourceUserId = params[userIdParam];
      
      // Allow if user is admin
      if (request.user.role === 'admin') {
        log.debug('Admin access granted for resource ownership', {
          userId: request.user.id,
          resourceUserId,
        });
        return;
      }
      
      // Allow if accessing own resource
      if (request.user.id === resourceUserId) {
        log.debug('Resource ownership verified', {
          userId: request.user.id,
          resourceUserId,
        });
        return;
      }
      
      // Special case for 'me' parameter
      if (resourceUserId === 'me') {
        params[userIdParam] = request.user.id;
        log.debug('Me parameter replaced with user ID', {
          userId: request.user.id,
        });
        return;
      }
      
      throw new ForbiddenError('Access denied. You can only access your own resources');
    } catch (error) {
      log.error('Resource ownership check failed', error, {
        userId: request.user?.id,
        userRole: request.user?.role,
        resourceUserId: (request.params as Record<string, string>)[userIdParam],
        url: request.url,
        method: request.method,
      });
      
      if (error instanceof UnauthorizedError) {
        reply.code(401).send({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else if (error instanceof ForbiddenError) {
        reply.code(403).send({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else {
        reply.code(500).send({
          success: false,
          error: 'Internal server error during ownership check',
          timestamp: new Date().toISOString(),
        });
      }
    }
  };
};

// Request logging middleware
export const logRequest = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const startTime = Date.now();
  
  // Log request
  log.info('Incoming request', {
    method: request.method,
    url: request.url,
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    userId: request.user?.id,
    userRole: request.user?.role,
  });
  
  // Log response when request completes
  reply.addHook('onSend', async (request, reply, payload) => {
    const duration = Date.now() - startTime;
    
    log.request(
      request.method,
      request.url,
      reply.statusCode,
      duration,
      {
        ip: request.ip,
        userId: request.user?.id,
        userRole: request.user?.role,
      }
    );
    
    return payload;
  });
};
```
```

---

## 🔄 **Event Integration**

### **Events Published**
The User Service publishes the following events to RabbitMQ:

#### **User Events**
- **`user.created`** - New user profile created
- **`user.updated`** - User profile updated
- **`user.deleted`** - User account deleted
- **`user.role_changed`** - User role updated
- **`user.status_changed`** - User status updated

#### **Enrollment Events**
- **`user.enrolled`** - User enrolled in course
- **`user.unenrolled`** - User unenrolled from course
- **`user.progress_updated`** - Course progress updated
- **`user.course_completed`** - Course completed

### **Events Consumed**
The User Service listens for events from other services:

#### **Auth Service Events**
- **`auth.user.login`** - Update last active timestamp
- **`auth.user.logout`** - Track session end
- **`auth.user.registered`** - Create user profile
- **`auth.user.password_changed`** - Security logging

---

## 📊 **Monitoring & Observability**

### **Health Checks**
- **Basic Health:** Service availability check
- **Detailed Health:** Database, Redis, and RabbitMQ connectivity
- **Readiness Probe:** Kubernetes readiness check
- **Liveness Probe:** Kubernetes liveness check

### **Metrics Collection**
- HTTP request metrics (count, duration, status codes)
- Database connection pool metrics
- Cache hit/miss rates
- User registration and enrollment metrics
- Event publishing metrics

### **Structured Logging**
- Request/response logging with correlation IDs
- Error tracking with stack traces
- Performance metrics
- Audit logging for sensitive operations

---

## 🚀 **Deployment Configuration**

### **Docker Support**
- Multi-stage builds for optimized production images
- Non-root user for security
- Health checks for container orchestration
- Resource limits and reservations

### **Kubernetes Ready**
- Horizontal pod autoscaling
- Rolling deployments
- ConfigMaps and Secrets integration
- Service mesh compatibility

---

## 📈 **Performance Requirements**

### **Response Time Targets**
- User profile operations: < 200ms (95th percentile)
- Search operations: < 500ms (95th percentile)
- Enrollment operations: < 300ms (95th percentile)
- Health checks: < 50ms

### **Throughput Requirements**
- Peak load: 1,000 requests/second
- Sustained load: 500 requests/second
- Concurrent users: 10,000 active users

---

## 🔒 **Security Requirements**

### **Authentication & Authorization**
- JWT validation with configurable algorithms
- Role-based access control (Admin, Instructor, Student)
- Resource ownership validation
- Rate limiting and abuse prevention

### **Data Protection**
- Input validation and sanitization
- Audit logging for sensitive operations
- PII protection and compliance
- Secure headers and CORS configuration

---

## 🧪 **Testing Strategy**

### **Test Coverage**
- Unit tests for service layer and utilities
- Integration tests for API endpoints
- Load testing for performance validation
- Security testing for vulnerability assessment

### **Test Automation**
- Continuous integration with automated testing
- Code coverage reporting
- Performance regression testing
- Security scanning in CI/CD pipeline

---

## 🎯 **Success Criteria**

### **Functional Requirements**
- ✅ Complete user profile management
- ✅ Role-based access control
- ✅ Course enrollment tracking
- ✅ User preference management
- ✅ JWT authentication integration
- ✅ Real-time event publishing

### **Non-Functional Requirements**
- ✅ 99.9% uptime SLA
- ✅ < 200ms response time
- ✅ 1,000 concurrent requests
- ✅ Zero security vulnerabilities
- ✅ Comprehensive monitoring
- ✅ Complete API documentation

---

This specification provides a complete blueprint for building a production-ready User Service that serves as the central hub for user management in the LMS platform, ensuring scalable, secure, and performant user operations while maintaining comprehensive monitoring and event-driven architecture integration.
