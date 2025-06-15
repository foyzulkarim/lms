# Course Service Technical Specification

## 🎯 **Service Overview**

The Course Service is the core microservice responsible for managing educational content, course structure, and learning pathways within the LMS platform. It provides comprehensive course management capabilities including course creation, module organization, lesson delivery, and progress tracking.

### **Core Responsibilities**
- Course lifecycle management (creation, publishing, archiving)
- Hierarchical content organization (courses → modules → lessons)
- Content delivery and access control
- Course enrollment and progress tracking
- Instructor course management
- Course discovery and search integration
- Content versioning and publishing workflows
- Learning analytics integration
- Multi-format content support (video, text, interactive)

### **Service Characteristics**
- **Technology Stack:** Node.js + Fastify + TypeScript
- **Port:** 3003
- **Database:** PostgreSQL with Knex.js ORM
- **Cache:** Redis for performance optimization
- **Message Broker:** Kafka for event-driven architecture
- **Documentation:** OpenAPI 3.0 with Swagger UI
- **Authentication:** JWT-based with role-based access control

---

## 🏗️ **Architecture Design**

### **High-Level Architecture**
```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│   API Gateway   │────│   Course Service     │────│   PostgreSQL    │
│   Client Apps   │    │   (Port 3003)        │    │   (Courses DB)  │
└─────────────────┘    └──────────────────────┘    └─────────────────┘
                              │                              │
                    ┌─────────┼─────────────┐                │
                    │         │             │                │
            ┌───────▼───┐ ┌──▼──▼────┐ ┌────▼─────────┐ ┌───▼────┐
            │   Redis   │ │  Kafka   │ │External APIs │ │File    │
            │  (Cache)  │ │(Events)  │ │(Auth/User)   │ │Service │
            └───────────┘ └──────────┘ └──────────────┘ └────────┘
```

### **Service Integration Flow**
```
Course Creation → Content Upload → Module Organization → Lesson Sequencing → 
Publishing Workflow → Enrollment Management → Progress Tracking → Analytics
```

### **Domain Model Hierarchy**
```
Course
├── Modules (ordered collection)
│   ├── Lessons (ordered collection)
│   │   ├── Content (text, video, interactive)
│   │   ├── Resources (files, links)
│   │   └── Assessments (quizzes, assignments)
│   └── Module Progress
├── Enrollments
├── Reviews & Ratings
└── Course Analytics
```

---

## 📊 **Data Models**

### **Core Course Models**
Based on the actual TypeScript definitions from `/src/types/course.ts`:

```typescript
interface Course {
  id: string;                    // UUID
  title: string;                 // 1-200 characters
  slug: string;                  // URL-friendly identifier
  description: string;           // Full description (max 1000 chars)
  shortDescription?: string;     // Brief summary (max 300 chars)
  thumbnailUrl?: string;         // Course thumbnail image
  bannerUrl?: string;           // Course banner image
  
  // Course Classification
  status: CourseStatus;          // draft | published | archived
  difficulty: CourseDifficulty;  // beginner | intermediate | advanced
  language: string;              // ISO language code (default: 'en')
  
  // Content Organization
  estimatedDuration: number;     // Total duration in minutes
  tags: string[];               // Searchable tags
  categories: string[];         // Course categories
  prerequisites: string[];      // Required prior knowledge
  learningObjectives: string[]; // What students will learn
  
  // Instructor Information
  instructorId: string;         // UUID reference to user service
  instructorName: string;       // Cached instructor name
  instructorEmail: string;      // Cached instructor email
  
  // Enrollment & Pricing
  price: number;                // Course price (0 for free)
  currency: string;             // Currency code (default: 'USD')
  enrollmentCount: number;      // Total enrolled students
  isPublic: boolean;            // Public visibility
  allowEnrollment: boolean;     // Allow new enrollments
  
  // Quality Metrics
  rating: number;               // Average rating (0-5)
  reviewCount: number;          // Total number of reviews
  
  // Features
  certificateEnabled: boolean;  // Issue certificates on completion
  
  // Timestamps
  publishedAt?: Date;           // When course was published
  createdAt: Date;
  updatedAt: Date;
}

enum CourseStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published', 
  ARCHIVED = 'archived'
}

enum CourseDifficulty {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced'
}
```

### **Module Models**
```typescript
interface Module {
  id: string;                   // UUID
  courseId: string;            // Parent course UUID
  title: string;               // Module title (1-200 chars)
  description?: string;        // Module description (max 1000 chars)
  orderIndex: number;          // Position within course
  estimatedDuration: number;   // Duration in minutes
  isPublished: boolean;        // Publication status
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### **Lesson Models**
```typescript
interface Lesson {
  id: string;                  // UUID
  moduleId: string;           // Parent module UUID
  courseId: string;           // Parent course UUID
  title: string;              // Lesson title (1-200 chars)
  description?: string;       // Lesson description
  
  // Content Type & Data
  type: LessonType;           // video | text | quiz | assignment | interactive
  content?: string;           // Text content or HTML
  contentType?: ContentType;  // markdown | html | text
  
  // Video-specific fields
  videoUrl?: string;          // Video file URL
  videoDuration?: number;     // Video duration in seconds
  
  // Resources
  attachments?: string[];     // Array of file URLs
  
  // Organization
  orderIndex: number;         // Position within module
  estimatedDuration: number;  // Duration in minutes
  
  // Access Control
  isPublished: boolean;       // Publication status
  isFree: boolean;           // Free preview lesson
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

enum LessonType {
  VIDEO = 'video',
  TEXT = 'text',
  QUIZ = 'quiz',
  ASSIGNMENT = 'assignment',
  INTERACTIVE = 'interactive'
}
```

### **Enrollment & Progress Models**
```typescript
interface Enrollment {
  id: string;                 // UUID
  courseId: string;          // Course UUID
  userId: string;            // User UUID
  enrolledAt: Date;          // Enrollment timestamp
  completedAt?: Date;        // Completion timestamp
  progress: number;          // Progress percentage (0-100)
  lastAccessedAt?: Date;     // Last access timestamp
  certificateIssued: boolean; // Certificate status
  certificateIssuedAt?: Date; // Certificate issue date
}

interface LessonProgress {
  id: string;                // UUID
  userId: string;           // User UUID
  courseId: string;         // Course UUID
  moduleId: string;         // Module UUID
  lessonId: string;         // Lesson UUID
  isCompleted: boolean;     // Completion status
  completedAt?: Date;       // Completion timestamp
  timeSpent: number;        // Time spent in seconds
  lastPosition?: number;    // Last video position (for videos)
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### **Review & Rating Models**
```typescript
interface Review {
  id: string;               // UUID
  courseId: string;        // Course UUID
  userId: string;          // Reviewer UUID
  userName: string;        // Cached reviewer name
  rating: number;          // Rating (1-5)
  comment?: string;        // Review comment (max 1000 chars)
  isPublic: boolean;       // Public visibility
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 🗄️ **Database Schema**

Based on the actual migration files in `/src/database/migrations/`:

### **Courses Table**
```sql
CREATE TYPE course_level AS ENUM ('beginner', 'intermediate', 'advanced', 'expert');
CREATE TYPE course_status AS ENUM ('draft', 'review', 'published', 'archived', 'deleted');
CREATE TYPE course_visibility AS ENUM ('public', 'private', 'unlisted');

CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    short_description VARCHAR(500),
    thumbnail_url TEXT,
    banner_url TEXT,
    instructor_id UUID NOT NULL,
    category_id UUID REFERENCES course_categories(id) ON DELETE SET NULL,
    level course_level NOT NULL DEFAULT 'beginner',
    status course_status NOT NULL DEFAULT 'draft',
    visibility course_visibility NOT NULL DEFAULT 'private',
    language VARCHAR(10) DEFAULT 'en',
    duration_hours INTEGER DEFAULT 0,
    price DECIMAL(10,2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'USD',
    is_free BOOLEAN DEFAULT true,
    enrollment_limit INTEGER,
    enrollment_count INTEGER DEFAULT 0,
    rating DECIMAL(3,2) DEFAULT 0.00,
    rating_count INTEGER DEFAULT 0,
    tags TEXT[],
    prerequisites TEXT[],
    learning_objectives TEXT[],
    target_audience TEXT,
    requirements TEXT[],
    what_you_will_learn TEXT[],
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1
);

-- Indexes for performance
CREATE INDEX idx_courses_instructor ON courses(instructor_id);
CREATE INDEX idx_courses_category ON courses(category_id);
CREATE INDEX idx_courses_status ON courses(status);
CREATE INDEX idx_courses_visibility ON courses(visibility);
CREATE INDEX idx_courses_published ON courses(published_at);
CREATE INDEX idx_courses_rating ON courses(rating);
CREATE INDEX idx_courses_created ON courses(created_at);
```

### **Course Categories Table**
```sql
CREATE TABLE course_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    parent_id UUID REFERENCES course_categories(id) ON DELETE CASCADE,
    icon_url TEXT,
    color VARCHAR(7), -- Hex color code
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_categories_parent ON course_categories(parent_id);
CREATE INDEX idx_categories_active ON course_categories(is_active);
```

### **Course Modules Table**
```sql
CREATE TABLE course_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    duration_minutes INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_modules_course ON course_modules(course_id);
CREATE INDEX idx_modules_order ON course_modules(course_id, sort_order);
```

### **Course Lessons Table**
```sql
CREATE TYPE lesson_type AS ENUM ('video', 'text', 'quiz', 'assignment', 'interactive', 'live_session');
CREATE TYPE content_type AS ENUM ('markdown', 'html', 'text', 'video', 'audio', 'document');

CREATE TABLE course_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    lesson_type lesson_type NOT NULL DEFAULT 'text',
    content_type content_type DEFAULT 'text',
    content TEXT,
    video_url TEXT,
    video_duration INTEGER, -- in seconds
    sort_order INTEGER NOT NULL DEFAULT 0,
    duration_minutes INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT false,
    is_free BOOLEAN DEFAULT false,
    resources JSONB, -- Array of resource objects
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lessons_module ON course_lessons(module_id);
CREATE INDEX idx_lessons_course ON course_lessons(course_id);
CREATE INDEX idx_lessons_order ON course_lessons(module_id, sort_order);
CREATE INDEX idx_lessons_published ON course_lessons(is_published);
```

### **Course Progress Tables**
```sql
CREATE TABLE course_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    progress_percentage DECIMAL(5,2) DEFAULT 0.00,
    last_accessed_at TIMESTAMP,
    time_spent_minutes INTEGER DEFAULT 0,
    certificate_issued BOOLEAN DEFAULT false,
    certificate_issued_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, course_id)
);

CREATE INDEX idx_progress_user ON course_progress(user_id);
CREATE INDEX idx_progress_course ON course_progress(course_id);
CREATE INDEX idx_progress_completed ON course_progress(completed_at);

CREATE TABLE lesson_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    module_id UUID NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    is_completed BOOLEAN DEFAULT false,
    time_spent_seconds INTEGER DEFAULT 0,
    last_position INTEGER DEFAULT 0, -- For video lessons
    attempts INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, lesson_id)
);

CREATE INDEX idx_lesson_progress_user ON lesson_progress(user_id);
CREATE INDEX idx_lesson_progress_lesson ON lesson_progress(lesson_id);
CREATE INDEX idx_lesson_progress_completed ON lesson_progress(is_completed);
```

### **Course Reviews Table**
```sql
CREATE TABLE course_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    is_public BOOLEAN DEFAULT true,
    is_verified_purchase BOOLEAN DEFAULT false,
    helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(course_id, user_id)
);

CREATE INDEX idx_reviews_course ON course_reviews(course_id);
CREATE INDEX idx_reviews_user ON course_reviews(user_id);
CREATE INDEX idx_reviews_rating ON course_reviews(rating);
CREATE INDEX idx_reviews_public ON course_reviews(is_public);
```

---

## ⚙️ **Configuration Management**

Based on the actual configuration from `/src/config/index.ts`:

### **Environment Variables**
```bash
# Server Configuration
PORT=3003
HOST=0.0.0.0
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://lms_user:password@localhost:5432/lms_courses
DB_HOST=localhost
DB_PORT=5432
DB_NAME=lms_courses
DB_USER=lms_user
DB_PASSWORD=password
DB_POOL_MIN=2
DB_POOL_MAX=10

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# RabbitMQ Configuration
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=guest
RABBITMQ_PASSWORD=guest
RABBITMQ_VHOST=/

# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-key-at-least-32-characters-long
JWT_EXPIRES_IN=24h

# External Services
AUTH_SERVICE_URL=http://localhost:3001
USER_SERVICE_URL=http://localhost:3002
FILE_SERVICE_URL=http://localhost:3005
SEARCH_SERVICE_URL=http://localhost:3006

# Content Processing
MAX_CONTENT_SIZE=10485760
ALLOWED_VIDEO_FORMATS=mp4,webm,ogg
ALLOWED_DOCUMENT_FORMATS=pdf,doc,docx,ppt,pptx
CONTENT_CACHE_TTL=3600

# File Upload
UPLOAD_DIR=uploads
MAX_FILE_SIZE=52428800
ALLOWED_IMAGE_FORMATS=jpg,jpeg,png,gif,webp

# Rate Limiting
RATE_LIMIT_MAX=200
RATE_LIMIT_WINDOW=60000

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
CORS_CREDENTIALS=true

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Course Settings
DEFAULT_COURSE_LANGUAGE=en
MAX_MODULES_PER_COURSE=50
MAX_LESSONS_PER_MODULE=100
COURSE_SLUG_MAX_LENGTH=100
FEATURED_COURSES_LIMIT=10
POPULAR_COURSES_LIMIT=20

# Cache TTL (in seconds)
COURSE_CACHE_TTL=3600
COURSE_LIST_CACHE_TTL=1800
LESSON_CONTENT_CACHE_TTL=7200
CATEGORY_CACHE_TTL=86400

# Search Configuration
SEARCH_RESULTS_LIMIT=50
SEARCH_CACHE_TTL=300

# Analytics
ANALYTICS_BATCH_SIZE=100
ANALYTICS_FLUSH_INTERVAL=30000
```

### **Configuration Schema**
Based on the Zod validation schema:

```typescript
const envSchema = z.object({
  // Server Configuration
  PORT: z.string().transform(Number).default('3003'),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database Configuration
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().transform(Number).default('5432'),
  DB_NAME: z.string().default('lms_courses'),
  DB_USER: z.string().default('lms_user'),
  DB_PASSWORD: z.string().default('password'),
  DB_POOL_MIN: z.string().transform(Number).default('2'),
  DB_POOL_MAX: z.string().transform(Number).default('10'),

  // JWT Configuration
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // Content Processing
  MAX_CONTENT_SIZE: z.string().transform(Number).default('10485760'),
  ALLOWED_VIDEO_FORMATS: z.string().default('mp4,webm,ogg'),
  ALLOWED_DOCUMENT_FORMATS: z.string().default('pdf,doc,docx,ppt,pptx'),

  // Course Settings
  DEFAULT_COURSE_LANGUAGE: z.string().default('en'),
  MAX_MODULES_PER_COURSE: z.string().transform(Number).default('50'),
  MAX_LESSONS_PER_MODULE: z.string().transform(Number).default('100'),
});
```

---

## 🔧 **Core Implementation**

### **Application Setup**
Based on `/src/app.ts` and `/src/main.ts`:

```typescript
// Main application entry point
async function start() {
  const fastify = Fastify({
    logger: false, // Using custom Winston logger
    trustProxy: true,
    bodyLimit: config.fileUpload.maxFileSize,
  }).withTypeProvider<TypeBoxTypeProvider>();

  try {
    // Register the application
    await fastify.register(createApp);

    // Start the server
    await fastify.listen({
      port: config.port,
      host: config.host,
    });

    logger.info(`Course service started on ${config.host}:${config.port}`);
    logger.info(`Swagger UI available at: http://${config.host}:${config.port}/docs`);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}
```

### **Application Configuration**
```typescript
export const createApp: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  // Initialize external services
  await initializeDatabase();
  await initializeRedis();
  await initializeKafka();
  
  // Setup event consumers
  await setupEventConsumers();

  // Register security plugins
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  });

  await fastify.register(fastifyCors, {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
  });

  await fastify.register(fastifyRateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.window,
  });

  // Register JWT authentication
  await fastify.register(fastifyJwt, {
    secret: config.jwt.secret,
  });

  // Register file upload support
  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: config.fileUpload.maxFileSize,
    },
  });

  // Serve static files (uploads)
  await fastify.register(fastifyStatic, {
    root: path.join(process.cwd(), config.fileUpload.uploadDir),
    prefix: '/uploads/',
  });

  // Register OpenAPI documentation
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'LMS Course Service API',
        description: 'Course management service for Learning Management System',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://${config.host}:${config.port}`,
          description: 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      tags: [
        { name: 'Health', description: 'Health check endpoints' },
        { name: 'Courses', description: 'Course management endpoints' },
        { name: 'Modules', description: 'Module management endpoints' },
        { name: 'Lessons', description: 'Lesson management endpoints' },
      ],
    },
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false,
    },
  });

  // Register middleware
  await fastify.register(requestLogger);
  await fastify.register(errorHandler);

  // Register routes
  await fastify.register(healthRoutes, { prefix: '/health' });
  await fastify.register(courseRoutes, { prefix: '/courses' });
  await fastify.register(moduleRoutes, { prefix: '/modules' });
  await fastify.register(lessonRoutes, { prefix: '/lessons' });

  logger.info('Course service application initialized successfully');
};
```

---

## 🔌 **API Specification**

### **Course Management Endpoints**

#### **Get Published Courses (Public)**
```http
GET /courses
Query Parameters:
- page?: number (default: 1)
- limit?: number (default: 20, max: 100)
- search?: string
- category?: string
- difficulty?: 'beginner' | 'intermediate' | 'advanced'
- tags?: string (comma-separated)
- minPrice?: number
- maxPrice?: number
- sortBy?: 'title' | 'createdAt' | 'rating' | 'enrollmentCount' | 'price'
- sortOrder?: 'asc' | 'desc'

Response: 200 OK
{
  "courses": [
    {
      "id": "course-uuid",
      "title": "Introduction to Machine Learning",
      "slug": "intro-to-ml",
      "description": "Learn the fundamentals of machine learning...",
      "shortDescription": "ML basics for beginners",
      "thumbnailUrl": "https://example.com/thumb.jpg",
      "status": "published",
      "difficulty": "beginner",
      "estimatedDuration": 480,
      "price": 99.99,
      "currency": "USD",
      "language": "en",
      "tags": ["machine-learning", "ai", "python"],
      "categories": ["Technology", "Data Science"],
      "instructorId": "instructor-uuid",
      "instructorName": "Dr. Jane Smith",
      "enrollmentCount": 1250,
      "rating": 4.7,
      "reviewCount": 89,
      "isPublic": true,
      "certificateEnabled": true,
      "publishedAt": "2024-01-15T10:00:00Z",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-15T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

#### **Get Course by ID**
```http
GET /courses/{courseId}
Authorization: Bearer <jwt-token> (optional for public courses)

Response: 200 OK
{
  "id": "course-uuid",
  "title": "Introduction to Machine Learning",
  "slug": "intro-to-ml",
  "description": "Comprehensive course covering ML fundamentals...",
  "shortDescription": "ML basics for beginners",
  "thumbnailUrl": "https://example.com/thumb.jpg",
  "bannerUrl": "https://example.com/banner.jpg",
  "status": "published",
  "difficulty": "beginner",
  "estimatedDuration": 480,
  "price": 99.99,
  "currency": "USD",
  "language": "en",
  "tags": ["machine-learning", "ai", "python"],
  "categories": ["Technology", "Data Science"],
  "prerequisites": ["Basic Python knowledge"],
  "learningObjectives": [
    "Understand ML algorithms",
    "Implement basic models",
    "Evaluate model performance"
  ],
  "instructorId": "instructor-uuid",
  "instructorName": "Dr. Jane Smith",
  "instructorEmail": "jane.smith@example.com",
  "enrollmentCount": 1250,
  "rating": 4.7,
  "reviewCount": 89,
  "isPublic": true,
  "allowEnrollment": true,
  "certificateEnabled": true,
  "publishedAt": "2024-01-15T10:00:00Z",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T10:00:00Z"
}
```

#### **Create Course (Instructor Only)**
```http
POST /courses
Authorization: Bearer <jwt-token>
Content-Type: application/json

Request Body:
{
  "title": "Advanced React Development",
  "description": "Master advanced React concepts and patterns...",
  "shortDescription": "Advanced React for experienced developers",
  "difficulty": "advanced",
  "estimatedDuration": 720,
  "price": 149.99,
  "currency": "USD",
  "language": "en",
  "tags": ["react", "javascript", "frontend"],
  "categories": ["Web Development", "Frontend"],
  "prerequisites": ["React basics", "JavaScript ES6+"],
  "learningObjectives": [
    "Master React hooks",
    "Implement complex state management",
    "Build scalable React applications"
  ],
  "isPublic": true,
  "allowEnrollment": true,
  "certificateEnabled": true
}

Response: 201 Created
{
  "id": "new-course-uuid",
  "title": "Advanced React Development",
  "slug": "advanced-react-development",
  "status": "draft",
  "instructorId": "instructor-uuid",
  "instructorName": "John Doe",
  "instructorEmail": "john.doe@example.com",
  "createdAt": "2024-01-20T00:00:00Z",
  "updatedAt": "2024-01-20T00:00:00Z"
}
```

#### **Update Course**
```http
PUT /courses/{courseId}
Authorization: Bearer <jwt-token>
Content-Type: application/json

Request Body:
{
  "title": "Updated Course Title",
  "description": "Updated description...",
  "price": 199.99,
  "tags": ["updated", "tags"]
}

Response: 200 OK
{
  "id": "course-uuid",
  "title": "Updated Course Title",
  "slug": "updated-course-title",
  "updatedAt": "2024-01-20T12:00:00Z"
}
```

#### **Publish Course**
```http
POST /courses/{courseId}/publish
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "id": "course-uuid",
  "status": "published",
  "publishedAt": "2024-01-20T12:00:00Z",
  "message": "Course published successfully"
}
```

#### **Get Course with Full Structure**
```http
GET /courses/{courseId}/full
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "id": "course-uuid",
  "title": "Introduction to Machine Learning",
  "description": "Comprehensive ML course...",
  "modules": [
    {
      "id": "module-uuid",
      "title": "Getting Started",
      "description": "Introduction to ML concepts",
      "orderIndex": 0,
      "estimatedDuration": 120,
      "isPublished": true,
      "lessons": [
        {
          "id": "lesson-uuid",
          "title": "What is Machine Learning?",
          "description": "Overview of ML",
          "type": "video",
          "videoUrl": "https://example.com/video.mp4",
          "videoDuration": 900,
          "orderIndex": 0,
          "estimatedDuration": 15,
          "isPublished": true,
          "isFree": true
        }
      ]
    }
  ]
}
```

### **Module Management Endpoints**

#### **Get Course Modules**
```http
GET /courses/{courseId}/modules
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "modules": [
    {
      "id": "module-uuid",
      "courseId": "course-uuid",
      "title": "Introduction",
      "description": "Course introduction and overview",
      "orderIndex": 0,
      "estimatedDuration": 60,
      "isPublished": true,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### **Create Module**
```http
POST /courses/{courseId}/modules
Authorization: Bearer <jwt-token>
Content-Type: application/json

Request Body:
{
  "title": "Advanced Concepts",
  "description": "Deep dive into advanced topics",
  "orderIndex": 2
}

Response: 201 Created
{
  "id": "new-module-uuid",
  "courseId": "course-uuid",
  "title": "Advanced Concepts",
  "description": "Deep dive into advanced topics",
  "orderIndex": 2,
  "estimatedDuration": 0,
  "isPublished": false,
  "createdAt": "2024-01-20T00:00:00Z",
  "updatedAt": "2024-01-20T00:00:00Z"
}
```

#### **Update Module**
```http
PUT /modules/{moduleId}
Authorization: Bearer <jwt-token>
Content-Type: application/json

Request Body:
{
  "title": "Updated Module Title",
  "description": "Updated description",
  "orderIndex": 1
}

Response: 200 OK
{
  "id": "module-uuid",
  "title": "Updated Module Title",
  "updatedAt": "2024-01-20T12:00:00Z"
}
```

### **Lesson Management Endpoints**

#### **Get Module Lessons**
```http
GET /modules/{moduleId}/lessons
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "lessons": [
    {
      "id": "lesson-uuid",
      "moduleId": "module-uuid",
      "courseId": "course-uuid",
      "title": "Introduction to Concepts",
      "description": "Basic concepts overview",
      "type": "video",
      "content": null,
      "contentType": null,
      "videoUrl": "https://example.com/lesson1.mp4",
      "videoDuration": 1200,
      "attachments": ["https://example.com/slides.pdf"],
      "orderIndex": 0,
      "estimatedDuration": 20,
      "isPublished": true,
      "isFree": false,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### **Create Lesson**
```http
POST /modules/{moduleId}/lessons
Authorization: Bearer <jwt-token>
Content-Type: application/json

Request Body:
{
  "title": "New Lesson",
  "description": "Lesson description",
  "type": "text",
  "content": "# Lesson Content\n\nThis is the lesson content in markdown.",
  "contentType": "markdown",
  "estimatedDuration": 15,
  "orderIndex": 1,
  "isFree": false
}

Response: 201 Created
{
  "id": "new-lesson-uuid",
  "moduleId": "module-uuid",
  "courseId": "course-uuid",
  "title": "New Lesson",
  "type": "text",
  "content": "# Lesson Content\n\nThis is the lesson content in markdown.",
  "contentType": "markdown",
  "orderIndex": 1,
  "estimatedDuration": 15,
  "isPublished": false,
  "isFree": false,
  "createdAt": "2024-01-20T00:00:00Z",
  "updatedAt": "2024-01-20T00:00:00Z"
}
```

#### **Update Lesson**
```http
PUT /lessons/{lessonId}
Authorization: Bearer <jwt-token>
Content-Type: application/json

Request Body:
{
  "title": "Updated Lesson Title",
  "content": "Updated lesson content",
  "estimatedDuration": 25
}

Response: 200 OK
{
  "id": "lesson-uuid",
  "title": "Updated Lesson Title",
  "content": "Updated lesson content",
  "estimatedDuration": 25,
  "updatedAt": "2024-01-20T12:00:00Z"
}
```

### **Enrollment & Progress Endpoints**

#### **Enroll in Course**
```http
POST /courses/{courseId}/enroll
Authorization: Bearer <jwt-token>

Response: 201 Created
{
  "id": "enrollment-uuid",
  "courseId": "course-uuid",
  "userId": "user-uuid",
  "enrolledAt": "2024-01-20T00:00:00Z",
  "progress": 0,
  "certificateIssued": false
}
```

#### **Get User's Course Progress**
```http
GET /courses/{courseId}/progress
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "courseId": "course-uuid",
  "userId": "user-uuid",
  "progress": 45.5,
  "enrolledAt": "2024-01-15T00:00:00Z",
  "lastAccessedAt": "2024-01-20T10:30:00Z",
  "timeSpentMinutes": 180,
  "completedLessons": 12,
  "totalLessons": 24,
  "moduleProgress": [
    {
      "moduleId": "module-uuid",
      "title": "Introduction",
      "progress": 100,
      "completedLessons": 4,
      "totalLessons": 4
    }
  ]
}
```

#### **Update Lesson Progress**
```http
POST /lessons/{lessonId}/progress
Authorization: Bearer <jwt-token>
Content-Type: application/json

Request Body:
{
  "isCompleted": true,
  "timeSpent": 900,
  "lastPosition": 850
}

Response: 200 OK
{
  "id": "progress-uuid",
  "lessonId": "lesson-uuid",
  "userId": "user-uuid",
  "isCompleted": true,
  "timeSpent": 900,
  "lastPosition": 850,
  "completedAt": "2024-01-20T12:00:00Z",
  "updatedAt": "2024-01-20T12:00:00Z"
}
```

### **Review & Rating Endpoints**

#### **Get Course Reviews**
```http
GET /courses/{courseId}/reviews
Query Parameters:
- page?: number (default: 1)
- limit?: number (default: 20)
- rating?: number (filter by rating)

Response: 200 OK
{
  "reviews": [
    {
      "id": "review-uuid",
      "courseId": "course-uuid",
      "userId": "user-uuid",
      "userName": "John Student",
      "rating": 5,
      "comment": "Excellent course! Learned a lot.",
      "isPublic": true,
      "createdAt": "2024-01-18T00:00:00Z",
      "updatedAt": "2024-01-18T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 89,
    "totalPages": 5
  },
  "summary": {
    "averageRating": 4.7,
    "totalReviews": 89,
    "ratingDistribution": {
      "5": 45,
      "4": 32,
      "3": 8,
      "2": 3,
      "1": 1
    }
  }
}
```

#### **Create Review**
```http
POST /courses/{courseId}/reviews
Authorization: Bearer <jwt-token>
Content-Type: application/json

Request Body:
{
  "rating": 5,
  "comment": "Great course with excellent content!",
  "isPublic": true
}

Response: 201 Created
{
  "id": "new-review-uuid",
  "courseId": "course-uuid",
  "userId": "user-uuid",
  "userName": "John Student",
  "rating": 5,
  "comment": "Great course with excellent content!",
  "isPublic": true,
  "createdAt": "2024-01-20T00:00:00Z",
  "updatedAt": "2024-01-20T00:00:00Z"
}
```

### **Health Check Endpoints**

#### **Basic Health Check**
```http
GET /health

Response: 200 OK
{
  "status": "healthy",
  "timestamp": "2024-01-20T12:00:00Z",
  "uptime": 3600,
  "services": {
    "database": { "status": "unknown" },
    "redis": { "status": "unknown" },
    "kafka": { "status": "unknown" }
  }
}
```

#### **Detailed Health Check**
```http
GET /health/detailed

Response: 200 OK
{
  "status": "healthy",
  "timestamp": "2024-01-20T12:00:00Z",
  "uptime": 3600,
  "services": {
    "database": {
      "status": "healthy",
      "responseTime": 15
    },
    "redis": {
      "status": "healthy", 
      "responseTime": 8
    },
    "kafka": {
      "status": "healthy",
      "responseTime": 12
    }
  }
}
```

---
## 🛡️ **Security & Middleware**

### **Authentication Middleware**
Based on the actual implementation from `/src/middleware/auth.ts`:

```typescript
export const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    // Verify JWT token
    await request.jwtVerify();
    
    const payload = request.user as any;
    const userId = payload.sub || payload.userId;
    
    if (!userId) {
      throw new AuthenticationError('Invalid token payload');
    }

    // Attach user to request
    request.user = {
      id: userId,
      email: payload.email,
      username: payload.username,
      firstName: payload.firstName,
      lastName: payload.lastName,
      isActive: payload.isActive ?? true,
      isEmailVerified: payload.isEmailVerified ?? true,
      roles: payload.roles || [],
    };
    
    if (!request.user.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }

    request.logger.debug('User authenticated', {
      userId: request.user.id,
      email: request.user.email,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError('Authentication failed');
  }
};

export const requireInstructor = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  if (!request.user) {
    throw new AuthenticationError('Authentication required');
  }

  const roles = request.user.roles || [];
  if (!roles.includes('instructor') && !roles.includes('admin')) {
    throw new AuthorizationError('Instructor access required');
  }
};

export const optionalAuth = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return;
    }

    await authenticate(request, reply);
  } catch (error) {
    // Ignore authentication errors for optional auth
    request.logger.debug('Optional authentication failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
```

### **Request Logger Middleware**
```typescript
export const requestLogger: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('onRequest', async (request, reply) => {
    request.startTime = Date.now();
    request.correlationId = uuidv4();
    
    request.logger = logger.child({
      correlationId: request.correlationId,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });

    request.logger.info('Request started');
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - (request.startTime || Date.now());
    
    request.logger.info('Request completed', {
      statusCode: reply.statusCode,
      duration: `${duration}ms`,
      userId: request.user?.id,
    });
  });
};
```

---

## 🔧 **Core Models Implementation**

### **Course Model**
Based on the actual implementation from `/src/models/course.ts`:

```typescript
export class CourseModel {
  static async create(courseData: CreateCourse, instructorId: string, instructorName: string, instructorEmail: string): Promise<Course> {
    const db = getDatabase();
    
    const slug = await this.generateUniqueSlug(courseData.title);
    
    const [course] = await db(TABLE_NAME)
      .insert({
        id: uuidv4(),
        title: courseData.title,
        slug,
        description: courseData.description,
        shortDescription: courseData.shortDescription,
        status: 'draft',
        difficulty: courseData.difficulty,
        estimatedDuration: courseData.estimatedDuration,
        price: courseData.price,
        currency: courseData.currency || 'USD',
        language: courseData.language || 'en',
        tags: JSON.stringify(courseData.tags || []),
        categories: JSON.stringify(courseData.categories || []),
        prerequisites: JSON.stringify(courseData.prerequisites || []),
        learningObjectives: JSON.stringify(courseData.learningObjectives || []),
        instructorId,
        instructorName,
        instructorEmail,
        enrollmentCount: 0,
        rating: 0,
        reviewCount: 0,
        isPublic: courseData.isPublic ?? true,
        allowEnrollment: courseData.allowEnrollment ?? true,
        certificateEnabled: courseData.certificateEnabled ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning('*');

    return this.formatCourse(course);
  }

  static async findPublished(query: CourseQuery): Promise<{ courses: Course[]; total: number }> {
    const db = getDatabase();
    const { 
      page = 1, 
      limit = 20, 
      search, 
      category, 
      difficulty, 
      tags, 
      minPrice, 
      maxPrice,
      sortBy = 'updatedAt',
      sortOrder = 'desc'
    } = query;
    const offset = (page - 1) * limit;

    let queryBuilder = db(TABLE_NAME)
      .where({ status: 'published', isPublic: true });

    if (search) {
      queryBuilder = queryBuilder.where(function() {
        this.where('title', 'ilike', `%${search}%`)
          .orWhere('description', 'ilike', `%${search}%`)
          .orWhere('shortDescription', 'ilike', `%${search}%`);
      });
    }

    if (category) {
      queryBuilder = queryBuilder.whereRaw('categories::text ILIKE ?', [`%"${category}"%`]);
    }

    if (difficulty) {
      queryBuilder = queryBuilder.where({ difficulty });
    }

    if (tags) {
      const tagList = tags.split(',').map(tag => tag.trim());
      for (const tag of tagList) {
        queryBuilder = queryBuilder.whereRaw('tags::text ILIKE ?', [`%"${tag}"%`]);
      }
    }

    if (minPrice !== undefined) {
      queryBuilder = queryBuilder.where('price', '>=', minPrice);
    }

    if (maxPrice !== undefined) {
      queryBuilder = queryBuilder.where('price', '<=', maxPrice);
    }

    const [courses, [{ count }]] = await Promise.all([
      queryBuilder
        .clone()
        .orderBy(sortBy, sortOrder)
        .limit(limit)
        .offset(offset),
      queryBuilder.clone().count('* as count')
    ]);

    return {
      courses: courses.map(this.formatCourse),
      total: parseInt(count as string),
    };
  }

  static async updateStatus(id: string, status: CourseStatus): Promise<Course | null> {
    const db = getDatabase();
    
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'published') {
      updateData.publishedAt = new Date();
    }

    const [course] = await db(TABLE_NAME)
      .where({ id })
      .update(updateData)
      .returning('*');

    return course ? this.formatCourse(course) : null;
  }

  private static async generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
    let baseSlug = slugify(title, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 1;

    while (await this.slugExists(slug, excludeId)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  private static formatCourse(course: any): Course {
    return {
      ...course,
      tags: typeof course.tags === 'string' ? JSON.parse(course.tags) : course.tags || [],
      categories: typeof course.categories === 'string' ? JSON.parse(course.categories) : course.categories || [],
      prerequisites: typeof course.prerequisites === 'string' ? JSON.parse(course.prerequisites) : course.prerequisites || [],
      learningObjectives: typeof course.learningObjectives === 'string' ? JSON.parse(course.learningObjectives) : course.learningObjectives || [],
      createdAt: course.createdAt.toISOString(),
      updatedAt: course.updatedAt.toISOString(),
      publishedAt: course.publishedAt ? course.publishedAt.toISOString() : undefined,
    };
  }
}
```

---

## 🔄 **Event Integration**

### **Published Events**
```typescript
enum CourseEventType {
  COURSE_CREATED = 'course.created',
  COURSE_UPDATED = 'course.updated',
  COURSE_PUBLISHED = 'course.published',
  COURSE_ARCHIVED = 'course.archived',
  MODULE_CREATED = 'course.module.created',
  MODULE_UPDATED = 'course.module.updated',
  LESSON_CREATED = 'course.lesson.created',
  LESSON_UPDATED = 'course.lesson.updated',
  LESSON_COMPLETED = 'course.lesson.completed',
  COURSE_ENROLLED = 'course.enrolled',
  COURSE_COMPLETED = 'course.completed',
  REVIEW_CREATED = 'course.review.created'
}

class CourseEventPublisher {
  async publishCourseCreated(course: Course): Promise<void> {
    await this.eventBus.publish(CourseEventType.COURSE_CREATED, {
      courseId: course.id,
      title: course.title,
      instructorId: course.instructorId,
      status: course.status,
      createdAt: course.createdAt,
      timestamp: new Date()
    });
  }

  async publishCoursePublished(course: Course): Promise<void> {
    await this.eventBus.publish(CourseEventType.COURSE_PUBLISHED, {
      courseId: course.id,
      title: course.title,
      instructorId: course.instructorId,
      publishedAt: course.publishedAt,
      timestamp: new Date()
    });
  }

  async publishLessonCompleted(userId: string, lessonProgress: LessonProgress): Promise<void> {
    await this.eventBus.publish(CourseEventType.LESSON_COMPLETED, {
      userId,
      courseId: lessonProgress.courseId,
      moduleId: lessonProgress.moduleId,
      lessonId: lessonProgress.lessonId,
      completedAt: lessonProgress.completedAt,
      timeSpent: lessonProgress.timeSpent,
      timestamp: new Date()
    });
  }
}
```

### **Consumed Events**
```typescript
// Handle user enrollment events from external services
class UserEnrolledHandler {
  async handle(event: UserEnrolledEvent): Promise<void> {
    // Update course enrollment count
    await CourseModel.updateEnrollmentCount(event.courseId, 1);
    
    // Create course progress record
    await this.createCourseProgress(event.userId, event.courseId);
  }
}

// Handle user profile updates
class UserUpdatedHandler {
  async handle(event: UserUpdatedEvent): Promise<void> {
    // Update cached instructor information in courses
    if (event.roles?.includes('instructor')) {
      await this.updateInstructorInfo(event.userId, event.name, event.email);
    }
  }
}
```

---

## 📊 **Monitoring & Observability**

### **Health Checks**
Based on the actual implementation from `/src/routes/health.ts`:

```typescript
export const healthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Detailed health check
  fastify.get('/detailed', {
    schema: {
      tags: ['Health'],
      summary: 'Detailed health check with service status',
      response: {
        200: HealthResponseSchema,
        503: HealthResponseSchema,
      },
    },
  }, async (request, reply) => {
    const services = {
      database: { status: 'unknown', responseTime: 0 },
      redis: { status: 'unknown', responseTime: 0 },
      kafka: { status: 'unknown', responseTime: 0 },
    };

    let overallStatus = 'healthy';

    // Check database
    try {
      const dbStart = Date.now();
      const db = getDatabase();
      await db.raw('SELECT 1');
      services.database = {
        status: 'healthy',
        responseTime: Date.now() - dbStart,
      };
    } catch (error) {
      services.database = {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
      };
      overallStatus = 'unhealthy';
      request.logger.error('Database health check failed:', error);
    }

    // Check Redis
    try {
      const redisStart = Date.now();
      const redis = getRedisClient();
      await redis.ping();
      services.redis = {
        status: 'healthy',
        responseTime: Date.now() - redisStart,
      };
    } catch (error) {
      services.redis = {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
      };
      overallStatus = 'unhealthy';
      request.logger.error('Redis health check failed:', error);
    }

    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services,
    };

    if (overallStatus === 'unhealthy') {
      reply.status(503);
    }

    return response;
  });
};
```

### **Logging Configuration**
Based on the actual implementation from `/src/utils/logger.ts`:

```typescript
export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: {
    service: 'course-service',
    version: '1.0.0',
  },
  transports: [
    new winston.transports.Console({
      format: config.isDevelopment
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        : logFormat,
    }),
  ],
  exceptionHandlers: [
    new winston.transports.Console(),
  ],
  rejectionHandlers: [
    new winston.transports.Console(),
  ],
});

// Add file transport in production
if (config.isProduction) {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );

  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}
```

### **Performance Metrics**
```typescript
const metrics = {
  courseCreationDuration: new promClient.Histogram({
    name: 'course_service_course_creation_duration_seconds',
    help: 'Course creation duration',
    labelNames: ['instructor_id', 'status']
  }),
  
  courseQueries: new promClient.Counter({
    name: 'course_service_queries_total',
    help: 'Total course queries',
    labelNames: ['query_type', 'status']
  }),
  
  enrollmentCount: new promClient.Gauge({
    name: 'course_service_total_enrollments',
    help: 'Total course enrollments',
    labelNames: ['course_id']
  })
};
```

---

## 🧪 **Testing Strategy**

### **Unit Tests**
```typescript
describe('CourseModel', () => {
  describe('create', () => {
    it('should create course with unique slug', async () => {
      const courseData: CreateCourse = {
        title: 'Test Course',
        description: 'Test description',
        difficulty: 'beginner',
        estimatedDuration: 60,
        price: 0
      };

      const course = await CourseModel.create(
        courseData, 
        'instructor-id', 
        'John Doe', 
        'john@example.com'
      );

      expect(course.id).toBeDefined();
      expect(course.slug).toBe('test-course');
      expect(course.status).toBe('draft');
    });
  });

  describe('findPublished', () => {
    it('should return published courses only', async () => {
      const query: CourseQuery = { page: 1, limit: 10 };
      const result = await CourseModel.findPublished(query);

      expect(result.courses).toBeInstanceOf(Array);
      result.courses.forEach(course => {
        expect(course.status).toBe('published');
        expect(course.isPublic).toBe(true);
      });
    });

    it('should filter by search term', async () => {
      const query: CourseQuery = { search: 'machine learning' };
      const result = await CourseModel.findPublished(query);

      result.courses.forEach(course => {
        const searchableText = `${course.title} ${course.description}`.toLowerCase();
        expect(searchableText).toContain('machine learning');
      });
    });
  });
});
```

### **Integration Tests**
```typescript
describe('Course Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /courses', () => {
    it('should return published courses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/courses'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('courses');
      expect(response.json()).toHaveProperty('pagination');
    });

    it('should filter courses by difficulty', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/courses?difficulty=beginner'
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      data.courses.forEach((course: Course) => {
        expect(course.difficulty).toBe('beginner');
      });
    });
  });

  describe('POST /courses', () => {
    it('should create course for instructor', async () => {
      const token = await getInstructorToken();
      const courseData = {
        title: 'New Course',
        description: 'Course description',
        difficulty: 'intermediate',
        estimatedDuration: 120,
        price: 99.99
      };

      const response = await app.inject({
        method: 'POST',
        url: '/courses',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: courseData
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toHaveProperty('id');
      expect(response.json().title).toBe(courseData.title);
    });

    it('should reject course creation for non-instructor', async () => {
      const token = await getStudentToken();
      const courseData = {
        title: 'New Course',
        description: 'Course description',
        difficulty: 'intermediate',
        estimatedDuration: 120,
        price: 99.99
      };

      const response = await app.inject({
        method: 'POST',
        url: '/courses',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: courseData
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
```

---

## 🚀 **Deployment Configuration**

### **Dockerfile**
```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S courseuser -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=courseuser:nodejs /app/dist ./dist
COPY --from=builder --chown=courseuser:nodejs /app/migrations ./migrations

# Switch to non-root user
USER courseuser

# Expose port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3003/health || exit 1

# Start the application
CMD ["node", "dist/main.js"]
```

### **Docker Compose Integration**
```yaml
version: '3.8'

services:
  course-service:
    build:
      context: ./services/course-service
      dockerfile: Dockerfile
    ports:
      - "3003:3003"
    environment:
      - NODE_ENV=production
      - PORT=3003
      - DATABASE_URL=postgresql://lms_user:${DB_PASSWORD}@postgres:5432/lms_courses
      - REDIS_URL=redis://redis:6379
      - KAFKA_BROKERS=kafka:9092
      - JWT_SECRET=${JWT_SECRET}
      - AUTH_SERVICE_URL=http://auth-service:3001
      - USER_SERVICE_URL=http://user-service:3002
      - FILE_SERVICE_URL=http://file-service:3005
      - SEARCH_SERVICE_URL=http://search-service:3006
      - CORS_ORIGIN=${FRONTEND_URL}
    depends_on:
      - postgres
      - redis
      - kafka
    networks:
      - lms-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M

networks:
  lms-network:
    driver: bridge
```

---

## 📈 **Performance Requirements**

### **Response Time Targets**
- **Course listing:** < 200ms (95th percentile)
- **Course details:** < 100ms (average)
- **Course creation:** < 500ms
- **Module/lesson operations:** < 200ms
- **Search queries:** < 300ms

### **Throughput Requirements**
- **Peak load:** 1,000 requests/second
- **Sustained load:** 500 requests/second
- **Concurrent course creation:** 50 simultaneous
- **Database connections:** 10-20 pool size

### **Scalability Targets**
- **Horizontal scaling:** Support 5+ instances
- **Database optimization:** Query response < 50ms
- **Cache hit ratio:** > 80% for course listings
- **Memory usage:** < 1GB per instance

---

## 🎯 **Success Criteria**

### **Functional Requirements**
- ✅ Complete course lifecycle management (create, publish, archive)
- ✅ Hierarchical content organization (courses → modules → lessons)
- ✅ Multi-format content support (video, text, interactive)
- ✅ Progress tracking and enrollment management
- ✅ Review and rating system
- ✅ Search and filtering capabilities
- ✅ Event-driven integration with other services

### **Non-Functional Requirements**
- ✅ **Availability:** 99.9% uptime SLA
- ✅ **Performance:** < 200ms API response time
- ✅ **Scalability:** Handle 1,000 concurrent requests
- ✅ **Security:** Role-based access control and data validation
- ✅ **Monitoring:** Comprehensive health checks and metrics
- ✅ **Documentation:** Complete API documentation with Swagger
- ✅ **Maintainability:** Clean, testable TypeScript codebase

### **Technical Requirements**
- ✅ **Database:** PostgreSQL with proper indexing and migrations
- ✅ **Caching:** Redis integration for performance optimization
- ✅ **Events:** Kafka integration for event-driven architecture
- ✅ **Authentication:** JWT-based with role validation
- ✅ **Logging:** Structured logging with Winston
- ✅ **Testing:** Unit and integration test coverage > 80%
- ✅ **Deployment:** Container-ready with Docker and health checks

---

This specification provides a complete blueprint for building a production-ready Course Service that serves as the core content management system for the LMS platform, ensuring scalability, maintainability, and seamless integration with other microservices.
