# Course Service

The Course Service is the core microservice responsible for managing educational content, course structure, and learning pathways within the LMS platform. It provides comprehensive course management capabilities including course creation, module organization, lesson delivery, and progress tracking.

## 🎯 **Overview**

This service handles the complete course lifecycle from creation to completion, supporting hierarchical content organization, multi-format content delivery, and comprehensive progress tracking.

### **Key Features**

- **Course Lifecycle Management**: Create, publish, update, and archive courses
- **Hierarchical Content Organization**: Courses → Modules → Lessons structure
- **Multi-Format Content Support**: Video, text, interactive content, and assessments
- **Progress Tracking**: Detailed learning progress and completion tracking
- **Enrollment Management**: Course enrollment and access control
- **Review & Rating System**: Student feedback and course ratings
- **Search Integration**: Course discovery and filtering capabilities
- **Event-Driven Architecture**: Real-time integration with other services
- **Analytics Integration**: Learning analytics and reporting

## 🏗️ **Architecture**

```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│   API Gateway   │────│   Course Service     │────│   PostgreSQL    │
│   Client Apps   │    │   (Port 3002)        │    │   (Courses DB)  │
└─────────────────┘    └──────────────────────┘    └─────────────────┘
                              │                              │
                    ┌─────────┼─────────────┐                │
                    │         │             │                │
            ┌───────▼───┐ ┌──▼──▼────┐ ┌────▼─────────┐ ┌───▼────┐
            │   Redis   │ │  Kafka   │ │External APIs │ │File    │
            │  (Cache)  │ │(Events)  │ │(Auth/User)   │ │Service │
            └───────────┘ └──────────┘ └──────────────┘ └────────┘
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

## 🚀 **Getting Started**

### **Prerequisites**

- Docker 20.10+
- Docker Compose v2.0+
- Node.js 20+ (for development)
- PostgreSQL 15+
- Redis 7+
- Kafka (for event streaming)

### **Environment Variables**

Copy the environment template and configure:

```bash
cp .env.example .env
```

Key configuration variables:

```bash
# Server Configuration
NODE_ENV=production
PORT=3002
LOG_LEVEL=info

# Database Configuration
DATABASE_URL=postgresql://user:pass@postgres:5432/lms_courses
DB_POOL_MIN=2
DB_POOL_MAX=10

# Redis Configuration
REDIS_URL=redis://redis:6379/3
REDIS_PASSWORD=your-redis-password

# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-key
JWT_EXPIRES_IN=24h

# External Services
AUTH_SERVICE_URL=http://auth-service:3003
USER_SERVICE_URL=http://user-service:3001
FILE_SERVICE_URL=http://file-service:3004

# Course Configuration
DEFAULT_COURSE_LANGUAGE=en
MAX_MODULES_PER_COURSE=50
MAX_LESSONS_PER_MODULE=100
```

### **Development Setup**

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up database:**
   ```bash
   # Run migrations
   npm run db:migrate
   
   # Seed with sample data
   npm run db:seed
   ```

3. **Start development environment:**
   ```bash
   # Start infrastructure services
   docker-compose -f ../../infra/docker-compose.yml -f ../../infra/docker-compose.dev.yml up -d postgresql redis-master kafka-1

   # Start the service in development mode
   npm run dev
   ```

4. **Start workers (optional):**
   ```bash
   # Analytics worker
   npm run worker:analytics
   
   # Search indexer worker
   npm run worker:search
   ```

### **Production Deployment**

```bash
# Deploy with Docker Compose
docker-compose -f ../../infra/docker-compose.yml -f ../../infra/docker-compose.prod.yml up -d course-service

# Or build and run locally
npm run build
npm start
```

## 📊 **Service Components**

### **Main Service (Port 3002)**
- REST API for course management
- Course CRUD operations
- Module and lesson management
- Enrollment and progress tracking
- Review and rating system
- Health checks and metrics

### **Analytics Worker (Port 3012)**
- Course progress calculations
- Rating aggregations
- Learning analytics processing
- Performance metrics collection

### **Search Indexer (Port 3013)**
- Course search index maintenance
- Elasticsearch integration
- Search optimization
- Content indexing

## 🔌 **API Endpoints**

### **Course Management**

#### **Get Published Courses**
```http
GET /courses
Query Parameters:
- page?: number (default: 1)
- limit?: number (default: 20, max: 100)
- search?: string
- category?: string
- difficulty?: 'beginner' | 'intermediate' | 'advanced'
- tags?: string (comma-separated)
- sortBy?: 'title' | 'createdAt' | 'rating' | 'enrollmentCount'
- sortOrder?: 'asc' | 'desc'

Response: 200 OK
{
  "courses": [
    {
      "id": "course-uuid",
      "title": "Introduction to Machine Learning",
      "slug": "intro-to-ml",
      "description": "Learn ML fundamentals...",
      "thumbnailUrl": "https://example.com/thumb.jpg",
      "difficulty": "beginner",
      "estimatedDuration": 480,
      "price": 99.99,
      "currency": "USD",
      "instructorName": "Dr. Jane Smith",
      "enrollmentCount": 1250,
      "rating": 4.7,
      "reviewCount": 89
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

#### **Get Course Details**
```http
GET /courses/{courseId}
Authorization: Bearer <jwt-token> (optional for public courses)

Response: 200 OK
{
  "id": "course-uuid",
  "title": "Introduction to Machine Learning",
  "description": "Comprehensive ML course...",
  "modules": [
    {
      "id": "module-uuid",
      "title": "Getting Started",
      "lessons": [
        {
          "id": "lesson-uuid",
          "title": "What is Machine Learning?",
          "type": "video",
          "duration": 900,
          "isFree": true
        }
      ]
    }
  ]
}
```

#### **Create Course**
```http
POST /courses
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "title": "Advanced React Development",
  "description": "Master advanced React concepts...",
  "difficulty": "advanced",
  "price": 149.99,
  "tags": ["react", "javascript", "frontend"],
  "learningObjectives": [
    "Master React hooks",
    "Implement state management"
  ]
}

Response: 201 Created
{
  "id": "new-course-uuid",
  "title": "Advanced React Development",
  "slug": "advanced-react-development",
  "status": "draft"
}
```

#### **Update Course**
```http
PUT /courses/{courseId}
Authorization: Bearer <jwt-token>

{
  "title": "Updated Course Title",
  "price": 199.99
}

Response: 200 OK
```

#### **Publish Course**
```http
POST /courses/{courseId}/publish
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "status": "published",
  "publishedAt": "2024-01-20T12:00:00Z"
}
```

### **Module Management**

#### **Get Course Modules**
```http
GET /courses/{courseId}/modules
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "modules": [
    {
      "id": "module-uuid",
      "title": "Introduction",
      "orderIndex": 0,
      "estimatedDuration": 60,
      "isPublished": true
    }
  ]
}
```

#### **Create Module**
```http
POST /courses/{courseId}/modules
Authorization: Bearer <jwt-token>

{
  "title": "Advanced Concepts",
  "description": "Deep dive into advanced topics",
  "orderIndex": 2
}

Response: 201 Created
```

### **Lesson Management**

#### **Get Module Lessons**
```http
GET /modules/{moduleId}/lessons
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "lessons": [
    {
      "id": "lesson-uuid",
      "title": "Introduction to Concepts",
      "type": "video",
      "videoUrl": "https://example.com/lesson1.mp4",
      "videoDuration": 1200,
      "orderIndex": 0,
      "isPublished": true
    }
  ]
}
```

#### **Create Lesson**
```http
POST /modules/{moduleId}/lessons
Authorization: Bearer <jwt-token>

{
  "title": "New Lesson",
  "type": "text",
  "content": "# Lesson Content\n\nThis is the lesson content.",
  "estimatedDuration": 15
}

Response: 201 Created
```

### **Enrollment & Progress**

#### **Enroll in Course**
```http
POST /courses/{courseId}/enroll
Authorization: Bearer <jwt-token>

Response: 201 Created
{
  "enrolledAt": "2024-01-20T00:00:00Z",
  "progress": 0
}
```

#### **Get Course Progress**
```http
GET /courses/{courseId}/progress
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "progress": 45.5,
  "completedLessons": 12,
  "totalLessons": 24,
  "timeSpentMinutes": 180,
  "lastAccessedAt": "2024-01-20T10:30:00Z"
}
```

#### **Update Lesson Progress**
```http
POST /lessons/{lessonId}/progress
Authorization: Bearer <jwt-token>

{
  "isCompleted": true,
  "timeSpent": 900,
  "lastPosition": 850
}

Response: 200 OK
```

### **Reviews & Ratings**

#### **Get Course Reviews**
```http
GET /courses/{courseId}/reviews
Query Parameters:
- page?: number
- limit?: number
- rating?: number

Response: 200 OK
{
  "reviews": [
    {
      "id": "review-uuid",
      "userName": "John Student",
      "rating": 5,
      "comment": "Excellent course!",
      "createdAt": "2024-01-18T00:00:00Z"
    }
  ],
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

{
  "rating": 5,
  "comment": "Great course with excellent content!"
}

Response: 201 Created
```

## 🔄 **Event Integration**

### **Published Events**

- `course.created` - New course created
- `course.updated` - Course information updated
- `course.published` - Course published and available
- `course.archived` - Course archived
- `course.enrolled` - Student enrolled in course
- `course.completed` - Student completed course
- `lesson.completed` - Student completed lesson
- `review.created` - New course review added

### **Consumed Events**

- `user.updated` - Update cached instructor information
- `file.uploaded` - Process course content files
- `payment.completed` - Handle course purchase completion

## 📊 **Monitoring & Observability**

### **Health Checks**

```bash
# Basic health check
curl http://localhost:3002/health

# Detailed health check with service status
curl http://localhost:3002/health/detailed
```

### **Metrics**

The service exposes Prometheus metrics on `/metrics`:

- `course_service_course_creation_duration_seconds` - Course creation time
- `course_service_queries_total` - Total course queries by type
- `course_service_total_enrollments` - Total enrollments per course
- `course_service_active_courses` - Number of active courses
- `course_service_completion_rate` - Course completion rates

### **Logging**

Structured JSON logging with correlation IDs:

```bash
# View service logs
docker-compose logs -f course-service

# View worker logs
docker-compose logs -f course-analytics-worker
docker-compose logs -f course-search-indexer
```

## 🛠️ **Development**

### **Project Structure**

```
src/
├── main.ts                     # Application entry point
├── app.ts                      # Fastify app configuration
├── routes/                     # API route handlers
│   ├── courses.ts             # Course management endpoints
│   ├── modules.ts             # Module management endpoints
│   ├── lessons.ts             # Lesson management endpoints
│   ├── progress.ts            # Progress tracking endpoints
│   └── reviews.ts             # Review and rating endpoints
├── models/                     # Data models and database operations
│   ├── course.ts              # Course model
│   ├── module.ts              # Module model
│   ├── lesson.ts              # Lesson model
│   └── progress.ts            # Progress tracking model
├── services/                   # Business logic services
│   ├── course-service.ts      # Core course operations
│   ├── enrollment-service.ts  # Enrollment management
│   ├── progress-service.ts    # Progress calculation
│   └── analytics-service.ts   # Analytics integration
├── middleware/                 # Custom middleware
│   ├── auth.ts                # Authentication middleware
│   ├── validation.ts          # Request validation
│   └── error-handler.ts       # Error handling
├── database/                   # Database configuration
│   ├── connection.ts          # Database connection
│   ├── migrations/            # Database migrations
│   └── seeds/                 # Sample data
├── events/                     # Event handling
│   ├── publishers/            # Event publishers
│   └── handlers/              # Event handlers
├── utils/                      # Utility functions
│   ├── logger.ts              # Logging configuration
│   ├── cache.ts               # Redis cache utilities
│   └── validation.ts          # Input validation schemas
└── types/                      # TypeScript type definitions
    ├── course.ts              # Course-related types
    ├── user.ts                # User-related types
    └── api.ts                 # API request/response types
```

### **Database Management**

```bash
# Create new migration
npx knex migrate:make create_courses_table

# Run migrations
npm run db:migrate

# Rollback last migration
npm run db:rollback

# Seed database with sample data
npm run db:seed

# Reset database (rollback, migrate, seed)
npm run db:reset
```

### **Testing**

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

### **Code Quality**

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Type checking
npm run typecheck

# Generate API documentation
npm run docs:generate
```

## 🔧 **Configuration**

### **Course Settings**

```bash
# Course Limits
MAX_MODULES_PER_COURSE=50
MAX_LESSONS_PER_MODULE=100
COURSE_SLUG_MAX_LENGTH=100

# Content Settings
MAX_CONTENT_SIZE=10485760
ALLOWED_VIDEO_FORMATS=mp4,webm,ogg
ALLOWED_DOCUMENT_FORMATS=pdf,doc,docx,ppt,pptx

# Cache Settings
COURSE_CACHE_TTL=3600
COURSE_LIST_CACHE_TTL=1800
LESSON_CONTENT_CACHE_TTL=7200
```

### **Performance Tuning**

```bash
# Database Connection Pool
DB_POOL_MIN=2
DB_POOL_MAX=10

# Rate Limiting
RATE_LIMIT_MAX=200
RATE_LIMIT_WINDOW=60000

# Worker Concurrency
COURSE_ANALYTICS_WORKER_CONCURRENCY=3
COURSE_SEARCH_INDEXER_CONCURRENCY=2
```

## 🚨 **Troubleshooting**

### **Common Issues**

1. **Database connection errors:**
   ```bash
   # Check database connectivity
   docker-compose exec postgresql pg_isready -U lms_user
   
   # Check migration status
   npm run db:migrate:status
   ```

2. **Cache performance issues:**
   ```bash
   # Check Redis connectivity
   docker-compose exec redis-master redis-cli ping
   
   # Monitor cache hit rates
   curl http://localhost:3002/metrics | grep cache
   ```

3. **High memory usage:**
   ```bash
   # Check service memory usage
   docker stats course-service
   
   # Reduce cache TTL values
   COURSE_CACHE_TTL=1800
   COURSE_LIST_CACHE_TTL=900
   ```

4. **Slow course queries:**
   ```bash
   # Check database indexes
   docker-compose exec postgresql psql -U lms_user -d lms_db -c "\d+ courses"
   
   # Monitor query performance
   curl http://localhost:3002/metrics | grep query_duration
   ```

### **Performance Optimization**

1. **Enable query caching for frequently accessed courses**
2. **Use database indexes for search and filtering operations**
3. **Implement pagination for large course lists**
4. **Cache course thumbnails and media files**
5. **Use background workers for analytics calculations**

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📞 **Support**

For issues and questions:
- Check the [troubleshooting guide](#-troubleshooting)
- Review service logs: `docker-compose logs course-service`
- Monitor health endpoints: `/health`
- Check metrics: `/metrics`
- Review API documentation: `/docs`
