# User Service

The User Service is a comprehensive microservice for managing user profiles, enrollments, and preferences within the LMS ecosystem. It provides a robust API for user management, course enrollment tracking, and personalized user settings.

## 🚀 Features

### Core Functionality
- **User Profile Management**: Complete CRUD operations for user profiles
- **Role-Based Access Control**: Admin, instructor, and student roles with appropriate permissions
- **Course Enrollment Tracking**: Manage user enrollments with progress tracking
- **User Preferences**: Flexible preference system organized by categories
- **Authentication Integration**: JWT-based authentication with the Auth Service
- **Real-time Events**: RabbitMQ integration for event-driven architecture

### Technical Features
- **High Performance**: Redis caching for frequently accessed data
- **Data Integrity**: PostgreSQL with comprehensive migrations
- **API Documentation**: OpenAPI 3.0 with Swagger UI
- **Health Monitoring**: Comprehensive health checks and metrics
- **Security**: Rate limiting, CORS, Helmet security headers
- **Observability**: Structured logging with correlation IDs
- **Scalability**: Horizontal scaling ready with stateless design

## 🏗️ Architecture

### Service Dependencies
- **Database**: PostgreSQL for persistent data storage
- **Cache**: Redis for session data and performance optimization
- **Message Broker**: RabbitMQ for event publishing/consuming
- **Auth Service**: JWT token validation and user authentication

### Data Models
- **Users**: Profile information, roles, and account status
- **User Preferences**: Categorized settings (notifications, UI, learning, privacy)
- **User Enrollments**: Course enrollment tracking with progress
- **User Sessions**: Active session tracking for security

## 📋 Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis 7+
- RabbitMQ 3.12+
- Docker (optional)

## 🛠️ Installation

### Local Development

1. **Clone and navigate to the service**:
   ```bash
   cd services/user-service
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up the database**:
   ```bash
   # Create database
   createdb lms_users
   
   # Run migrations
   npm run migrate
   ```

5. **Start the service**:
   ```bash
   # Development mode with hot reload
   npm run dev
   
   # Production mode
   npm run build
   npm start
   ```

### Docker Development

```bash
# Build and run with Docker Compose
docker-compose up user-service

# Or build standalone
docker build -t user-service .
docker run -p 3002:3002 user-service
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3002` |
| `NODE_ENV` | Environment | `development` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `RABBITMQ_URL` | RabbitMQ connection string | `amqp://localhost:5672` |
| `JWT_SECRET` | JWT secret key (must match auth-service) | - |
| `CORS_ORIGIN` | Allowed CORS origins | `http://localhost:3000` |

### Database Configuration

The service uses PostgreSQL with Knex.js for migrations and query building:

```bash
# Run migrations
npm run migrate

# Rollback migrations
npm run migrate:rollback

# Create new migration
npm run migrate:make migration_name

# Seed database
npm run seed
```

## 📚 API Documentation

### Interactive Documentation
- **Swagger UI**: `http://localhost:3002/docs`
- **OpenAPI Spec**: `http://localhost:3002/docs/json`

### Key Endpoints

#### User Management
```http
GET    /api/v1/users/me                    # Get current user profile
PUT    /api/v1/users/me                    # Update current user profile
GET    /api/v1/users/:id                   # Get user by ID
PUT    /api/v1/users/:id                   # Update user by ID
DELETE /api/v1/users/:id                   # Delete user (admin only)
GET    /api/v1/users                       # Search users (admin only)
GET    /api/v1/users/:id/stats             # Get user statistics
PUT    /api/v1/users/:id/role              # Update user role (admin only)
PUT    /api/v1/users/bulk/role             # Bulk update roles (admin only)
```

#### Enrollment Management
```http
GET    /api/v1/users/me/enrollments        # Get current user enrollments
POST   /api/v1/users/me/enrollments        # Enroll in course
GET    /api/v1/users/:id/enrollments       # Get user enrollments
POST   /api/v1/users/:id/enrollments       # Enroll user in course
PUT    /api/v1/users/:id/enrollments/:courseId # Update enrollment
DELETE /api/v1/users/:id/enrollments/:courseId # Unenroll from course
PUT    /api/v1/users/:id/enrollments/:courseId/progress # Update progress
```

#### Preference Management
```http
GET    /api/v1/users/me/preferences        # Get current user preferences
PUT    /api/v1/users/me/preferences        # Bulk update preferences
GET    /api/v1/users/me/preferences/:category # Get category preferences
PUT    /api/v1/users/me/preferences/:category # Update category preferences
DELETE /api/v1/users/:id/preferences/:category/:key # Delete preference
```

#### Health & Monitoring
```http
GET    /health                             # Basic health check
GET    /health/live                        # Liveness probe
GET    /health/ready                       # Readiness probe
GET    /health/detailed                    # Detailed health information
GET    /metrics                            # Service metrics
GET    /info                               # Service information
```

## 🔐 Authentication & Authorization

### JWT Authentication
All protected endpoints require a valid JWT token in the Authorization header:
```http
Authorization: Bearer <jwt-token>
```

### Role-Based Access Control
- **Admin**: Full access to all endpoints
- **Instructor**: Access to own profile and student data
- **Student**: Access to own profile and enrollments only

### Resource Ownership
Users can only access their own resources unless they have admin privileges. The API supports both explicit user IDs and the special `me` parameter for current user operations.

## 📊 Data Models

### User Profile
```typescript
interface User {
  id: string;
  authId: string;
  email: string;
  username?: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  phone?: string;
  timezone: string;
  language: string;
  role: 'admin' | 'instructor' | 'student';
  status: 'active' | 'inactive' | 'suspended' | 'deleted';
  emailVerified: boolean;
  profileCompleted: boolean;
  lastActiveAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### User Enrollment
```typescript
interface UserEnrollment {
  id: string;
  userId: string;
  courseId: string;
  enrollmentStatus: 'active' | 'completed' | 'dropped' | 'suspended';
  progress: number; // 0-100
  enrolledAt: Date;
  completedAt?: Date;
  lastAccessedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### User Preference
```typescript
interface UserPreference {
  id: string;
  userId: string;
  category: string; // notifications, ui, learning, privacy
  key: string;
  value: any;
  createdAt: Date;
  updatedAt: Date;
}
```

## 🔄 Event Integration

### Events Consumed
The service listens for events from the Auth Service:
- `user.login` - Update last active timestamp
- `user.logout` - Track session end
- `user.registered` - Create user profile
- `user.password_changed` - Security logging

### Events Published
The service publishes events for other services:
- `user.created` - New user profile created
- `user.updated` - User profile updated
- `user.deleted` - User account deleted
- `user.role_changed` - User role updated
- `user.enrolled` - User enrolled in course
- `user.unenrolled` - User unenrolled from course
- `user.progress_updated` - Course progress updated
- `user.course_completed` - Course completed

## 🚀 Performance & Caching

### Redis Caching Strategy
- **User Profiles**: 15-minute TTL
- **User Preferences**: 30-minute TTL
- **User Enrollments**: 5-minute TTL
- **Search Results**: 2-minute TTL

### Database Optimization
- Comprehensive indexing on frequently queried fields
- Connection pooling for optimal resource usage
- Query optimization with proper joins and aggregations

## 🔍 Monitoring & Observability

### Health Checks
- **Liveness**: Basic service availability
- **Readiness**: Database and Redis connectivity
- **Detailed**: Comprehensive system information

### Metrics
- User registration and activity metrics
- Enrollment statistics and completion rates
- API performance and error rates
- System resource usage

### Logging
- Structured JSON logging with correlation IDs
- Request/response logging with performance metrics
- Error tracking with stack traces
- Audit logging for sensitive operations

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- user.service.test.ts
```

### Test Categories
- **Unit Tests**: Service layer and utility functions
- **Integration Tests**: API endpoints and database operations
- **Performance Tests**: Load testing and benchmarking

## 🚀 Deployment

### Docker Production
```bash
# Build production image
docker build --target production -t user-service:latest .

# Run production container
docker run -d \
  --name user-service \
  -p 3002:3002 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  -e RABBITMQ_URL=amqp://... \
  user-service:latest
```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: user-service
  template:
    metadata:
      labels:
        app: user-service
    spec:
      containers:
      - name: user-service
        image: user-service:latest
        ports:
        - containerPort: 3002
        env:
        - name: NODE_ENV
          value: "production"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3002
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3002
          initialDelaySeconds: 5
          periodSeconds: 5
```

## 🔧 Development

### Code Structure
```
src/
├── config/           # Configuration management
├── database/         # Database connection and migrations
├── middleware/       # Authentication and validation middleware
├── models/           # Data access layer
├── rabbitmq/         # Message broker integration
├── redis/            # Cache layer
├── routes/           # API route handlers
├── services/         # Business logic layer
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
└── app.ts            # Application entry point
```

### Development Workflow
1. Create feature branch from `main`
2. Implement changes with tests
3. Run linting and tests locally
4. Submit pull request with description
5. Code review and approval
6. Merge to main and deploy

### Code Quality
- **ESLint**: Code linting and formatting
- **TypeScript**: Strict type checking
- **Prettier**: Code formatting
- **Husky**: Git hooks for quality checks

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation and API reference

## 🔄 Changelog

### v1.0.0
- Initial release with core user management functionality
- JWT authentication integration
- Course enrollment tracking
- User preference system
- Comprehensive API documentation
- Production-ready deployment configuration
