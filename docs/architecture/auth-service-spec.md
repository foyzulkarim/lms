# Auth Service Technical Specification

## 🎯 **Service Overview**

The Auth Service is the centralized authentication and authorization hub for the LMS platform, providing secure user authentication, session management, OAuth integration, and role-based access control. It serves as the foundation for all security operations across the microservices ecosystem.

### **Core Responsibilities**
- User authentication and authorization
- JWT token issuance and validation
- OAuth2/OIDC integration (Google OAuth)
- Session management with Redis storage
- Password security and validation
- Multi-factor authentication support
- Role-based access control (RBAC)
- Security event publishing
- Account lifecycle management
- Rate limiting and security monitoring

### **Service Characteristics**
- **Technology Stack:** Node.js + Fastify + TypeScript
- **Port:** 3001
- **Database:** PostgreSQL for user data
- **Cache/Sessions:** Redis for session storage and caching
- **Message Broker:** RabbitMQ for event publishing
- **Authentication:** JWT + OAuth2 (Google)
- **Documentation:** OpenAPI 3.0 with Swagger UI

---

## 🏗️ **Architecture Design**

### **High-Level Architecture**
```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│   API Gateway   │────│   Auth Service       │────│   PostgreSQL    │
│   Client Apps   │    │   (Port 3001)        │    │   (User Data)   │
└─────────────────┘    └──────────────────────┘    └─────────────────┘
                              │                              │
                    ┌─────────┼─────────────┐                │
                    │         │             │                │
            ┌───────▼───┐ ┌──▼──▼────┐ ┌────▼─────────┐ ┌───▼────┐
            │   Redis   │ │RabbitMQ  │ │Google OAuth  │ │  JWT   │
            │(Sessions) │ │(Events)  │ │   Provider   │ │Service │
            └───────────┘ └──────────┘ └──────────────┘ └────────┘
```

### **Authentication Flow**
```
Client Request → OAuth/JWT Validation → User Lookup → Session Management → 
Role Verification → Event Publishing → Response Generation
```

### **Service Components**
- **Authentication Engine** - JWT and OAuth token processing
- **Session Manager** - Redis-backed session storage
- **User Management** - User CRUD operations and profile management
- **OAuth Integration** - Google OAuth 2.0 flow handling
- **Event Publisher** - RabbitMQ integration for auth events
- **Security Middleware** - Rate limiting, validation, and protection

---

## 📊 **Data Models**

### **User Models**
```typescript
interface User {
  id: string;                    // UUID
  email: string;                 // Unique email address
  username: string;              // Unique username
  firstName: string;
  lastName: string;
  isActive: boolean;             // Account status
  isEmailVerified: boolean;      // Email verification status
  lastLoginAt?: Date;            // Last login timestamp
  createdAt: Date;
  updatedAt: Date;
}

interface CreateUser {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  password: string;              // Min 8 characters
}

interface UpdateUser {
  firstName?: string;
  lastName?: string;
  username?: string;
}
```

### **Authentication Models**
```typescript
interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;             // Token expiration in seconds
}

interface RefreshTokenRequest {
  refreshToken: string;
}

interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;           // Min 8 characters
}

interface ResetPasswordRequest {
  email: string;
}

interface ResetPassword {
  token: string;
  newPassword: string;
}
```

### **Session Models**
```typescript
interface Session {
  id: string;                    // UUID
  userId: string;                // User ID
  deviceInfo: string;            // Device information
  ipAddress: string;             // Client IP address
  userAgent: string;             // Browser/client info
  isActive: boolean;             // Session status
  expiresAt: Date;               // Session expiration
  createdAt: Date;
  lastAccessedAt: Date;
}
```

### **OAuth Models**
```typescript
interface OAuthProvider {
  type: 'google';
}

interface OAuthCallback {
  code: string;
  state?: string;
}

interface OAuthProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  picture?: string;
  provider: 'google';
}
```

### **Database Schema**
```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(50) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_email_verified BOOLEAN DEFAULT false,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OAuth providers table
CREATE TABLE oauth_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    provider_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(provider, provider_user_id)
);

-- Sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_info VARCHAR(500),
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Password reset tokens table
CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email verification tokens table
CREATE TABLE email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_oauth_providers_user_id ON oauth_providers(user_id);
```

---

## 🔌 **API Specification**

### **Authentication Endpoints**

#### **User Registration**
```http
POST /auth/register
Content-Type: application/json

Request Body:
{
  "email": "user@example.com",
  "username": "johndoe",
  "firstName": "John",
  "lastName": "Doe",
  "password": "securePassword123"
}

Response: 201 Created
{
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "firstName": "John",
    "lastName": "Doe",
    "isActive": true,
    "isEmailVerified": false,
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "refresh_token_here",
  "expiresIn": 86400
}

Error Response: 409 Conflict
{
  "error": "Conflict Error",
  "message": "Email or username already exists",
  "statusCode": 409
}
```

#### **User Login**
```http
POST /auth/login
Content-Type: application/json

Request Body:
{
  "email": "user@example.com",
  "password": "securePassword123",
  "rememberMe": true
}

Response: 200 OK
{
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "firstName": "John",
    "lastName": "Doe",
    "isActive": true,
    "isEmailVerified": true,
    "lastLoginAt": "2024-01-01T00:00:00Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "refresh_token_here",
  "expiresIn": 86400
}

Error Response: 401 Unauthorized
{
  "error": "Authentication Error",
  "message": "Invalid email or password",
  "statusCode": 401
}
```

#### **Token Refresh**
```http
POST /auth/refresh
Content-Type: application/json

Request Body:
{
  "refreshToken": "refresh_token_here"
}

Response: 200 OK
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "new_refresh_token_here",
  "expiresIn": 86400
}
```

#### **User Logout**
```http
POST /auth/logout
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### **Password Change**
```http
POST /auth/change-password
Authorization: Bearer <jwt-token>
Content-Type: application/json

Request Body:
{
  "currentPassword": "oldPassword123",
  "newPassword": "newSecurePassword456"
}

Response: 200 OK
{
  "success": true,
  "message": "Password changed successfully"
}
```

#### **Password Reset Request**
```http
POST /auth/forgot-password
Content-Type: application/json

Request Body:
{
  "email": "user@example.com"
}

Response: 200 OK
{
  "success": true,
  "message": "Password reset instructions sent to your email"
}
```

#### **Password Reset Confirmation**
```http
POST /auth/reset-password
Content-Type: application/json

Request Body:
{
  "token": "reset_token_here",
  "newPassword": "newSecurePassword789"
}

Response: 200 OK
{
  "success": true,
  "message": "Password reset successful"
}
```

### **OAuth Endpoints**

#### **Google OAuth Initiation**
```http
GET /oauth/google
Query Parameters:
- redirect_uri?: string (optional callback URL)

Response: 302 Redirect
Location: https://accounts.google.com/oauth/authorize?client_id=...
```

#### **Google OAuth Callback**
```http
GET /oauth/google/callback
Query Parameters:
- code: string (authorization code from Google)
- state?: string (optional state parameter)

Response: 302 Redirect (Success)
Location: http://frontend.com/dashboard
Set-Cookie: session=...; HttpOnly; Secure

Response: 302 Redirect (Error)
Location: http://frontend.com/login?error=oauth_failed
```

### **User Management Endpoints**

#### **Get Current User**
```http
GET /users/me
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "id": "user-uuid",
  "email": "user@example.com",
  "username": "johndoe",
  "firstName": "John",
  "lastName": "Doe",
  "isActive": true,
  "isEmailVerified": true,
  "lastLoginAt": "2024-01-01T00:00:00Z",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

#### **Update User Profile**
```http
PATCH /users/me
Authorization: Bearer <jwt-token>
Content-Type: application/json

Request Body:
{
  "firstName": "John",
  "lastName": "Smith",
  "username": "johnsmith"
}

Response: 200 OK
{
  "id": "user-uuid",
  "email": "user@example.com",
  "username": "johnsmith",
  "firstName": "John",
  "lastName": "Smith",
  "isActive": true,
  "isEmailVerified": true,
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

### **Session Management Endpoints**

#### **Get Active Sessions**
```http
GET /sessions
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "sessions": [
    {
      "id": "session-uuid",
      "deviceInfo": "Chrome on Windows",
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00Z",
      "lastAccessedAt": "2024-01-01T12:00:00Z"
    }
  ]
}
```

#### **Revoke Session**
```http
DELETE /sessions/{sessionId}
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "success": true,
  "message": "Session revoked successfully"
}
```

#### **Revoke All Sessions**
```http
DELETE /sessions/all
Authorization: Bearer <jwt-token>

Response: 200 OK
{
  "success": true,
  "message": "All sessions revoked successfully"
}
```

### **Health Check Endpoints**

#### **Basic Health Check**
```http
GET /health

Response: 200 OK
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
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
  "timestamp": "2024-01-01T00:00:00Z",
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

## 🛡️ **Security Architecture**

### **Authentication Mechanisms**

#### **JWT Token Strategy**
```typescript
interface JWTPayload {
  sub: string;                   // User ID
  email: string;                 // User email
  username: string;              // Username
  roles: string[];               // User roles
  iat: number;                   // Issued at
  exp: number;                   // Expires at
  jti: string;                   // JWT ID
}

const jwtConfig = {
  secret: process.env.JWT_SECRET,
  expiresIn: '24h',
  algorithm: 'HS256',
  issuer: 'lms-auth-service',
  audience: 'lms-platform'
};
```

#### **OAuth2 Integration**
```typescript
const googleOAuthConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_CALLBACK_URL,
  scope: ['openid', 'profile', 'email'],
  accessType: 'offline',
  prompt: 'consent'
};
```

### **Session Management**
```typescript
interface SessionConfig {
  secret: string;                // Session signing secret
  maxAge: number;                // 24 hours default
  secure: boolean;               // HTTPS only in production
  httpOnly: boolean;             // Prevent XSS
  sameSite: 'strict' | 'lax';    // CSRF protection
  rolling: boolean;              // Extend on activity
}

// Redis session storage
const sessionStore = {
  prefix: 'sess:',
  ttl: 86400,                    // 24 hours
  serializer: JSON
};
```

### **Password Security**
```typescript
const passwordPolicy = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false,
  preventCommonPasswords: true,
  preventUserInfoInPassword: true
};

const bcryptConfig = {
  rounds: 12,                    // Adaptive cost factor
  maxBytes: 72                   // bcrypt limitation
};
```

### **Rate Limiting Strategy**
```typescript
const rateLimitConfig = {
  // Global rate limit
  global: {
    max: 100,                    // requests
    timeWindow: 60000            // 1 minute
  },
  
  // Authentication endpoints
  auth: {
    max: 20,                     // requests
    timeWindow: 60000,           // 1 minute
    skipSuccessfulRequests: true
  },
  
  // Password reset
  passwordReset: {
    max: 5,                      // requests
    timeWindow: 300000           // 5 minutes
  }
};
```

### **Security Middleware Pipeline**
```typescript
// Security middleware order
const securityMiddleware = [
  helmet(),                      // Security headers
  cors(corsConfig),             // CORS protection
  rateLimit(rateLimitConfig),   // Rate limiting
  requestLogger(),              // Request logging
  authenticate(),               // JWT validation
  attachSession(),              // Session attachment
  errorHandler()                // Error handling
];
```

---

## 🔄 **Event Integration**

### **Published Events**
```typescript
enum AuthEventType {
  USER_REGISTERED = 'user.registered',
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
  USER_PASSWORD_CHANGED = 'user.password_changed',
  USER_EMAIL_VERIFIED = 'user.email_verified',
  USER_PROFILE_UPDATED = 'user.profile_updated',
  USER_DEACTIVATED = 'user.deactivated',
  USER_REACTIVATED = 'user.reactivated',
  OAUTH_LINKED = 'user.oauth_linked',
  SESSION_CREATED = 'session.created',
  SESSION_EXPIRED = 'session.expired',
  FAILED_LOGIN_ATTEMPT = 'auth.failed_login'
}

interface AuthEvent {
  type: AuthEventType;
  userId: string;
  timestamp: Date;
  data: Record<string, any>;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  };
}
```

### **Event Publishing Examples**
```typescript
class AuthEventPublisher {
  async publishUserRegistered(user: User): Promise<void> {
    await publishAuthEvent('user.registered', {
      type: AuthEventType.USER_REGISTERED,
      userId: user.id,
      timestamp: new Date(),
      data: {
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  }
  
  async publishUserLogin(user: User, sessionInfo: any): Promise<void> {
    await publishAuthEvent('user.login', {
      type: AuthEventType.USER_LOGIN,
      userId: user.id,
      timestamp: new Date(),
      data: {
        email: user.email,
        loginMethod: sessionInfo.method // 'password' | 'oauth'
      },
      metadata: {
        ipAddress: sessionInfo.ipAddress,
        userAgent: sessionInfo.userAgent,
        sessionId: sessionInfo.sessionId
      }
    });
  }
}
```

---

## ⚙️ **Configuration Management**

### **Environment Variables**
```bash
# Server Configuration
PORT=3001
HOST=0.0.0.0
NODE_ENV=production

# Database Configuration
DATABASE_URL=postgresql://user:pass@postgres:5432/lms_auth
DB_HOST=postgres
DB_PORT=5432
DB_NAME=lms_auth
DB_USER=lms_user
DB_PASSWORD=secure_password

# Redis Configuration
REDIS_URL=redis://redis:6379
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=redis_password

# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-key-at-least-32-characters-long
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=your-super-secure-refresh-secret-key-at-least-32-characters-long
JWT_REFRESH_EXPIRES_IN=7d

# Session Configuration
SESSION_SECRET=your-super-secure-session-secret-key-at-least-32-characters-long
SESSION_MAX_AGE=86400000

# OAuth Configuration
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3001/oauth/google/callback

# RabbitMQ Configuration
RABBITMQ_URL=amqp://rabbitmq:5672
RABBITMQ_EXCHANGE=lms.events

# Security Configuration
PASSWORD_MIN_LENGTH=8
BCRYPT_ROUNDS=12

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
CORS_CREDENTIALS=true

# Logging Configuration
LOG_LEVEL=info
LOG_FORMAT=json
```

### **Service Configuration Schema**
```typescript
interface AuthServiceConfig {
  server: {
    port: number;
    host: string;
    nodeEnv: 'development' | 'production' | 'test';
  };
  database: {
    url: string;
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  redis: {
    url?: string;
    host: string;
    port: number;
    password?: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  session: {
    secret: string;
    maxAge: number;
  };
  oauth: {
    google: {
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
    };
  };
  security: {
    passwordMinLength: number;
    bcryptRounds: number;
  };
  rateLimit: {
    max: number;
    window: number;
  };
  cors: {
    origin: string;
    credentials: boolean;
  };
}
```

---

## 🚀 **Implementation Architecture**

### **Project Structure**
```
services/auth-service/
├── src/
│   ├── routes/
│   │   ├── auth.ts              # Authentication routes
│   │   ├── user.ts              # User management routes
│   │   ├── oauth.ts             # OAuth integration routes
│   │   ├── session.ts           # Session management routes
│   │   └── health.ts            # Health check routes
│   ├── middleware/
│   │   ├── auth.ts              # JWT authentication middleware
│   │   ├── error-handler.ts     # Global error handler
│   │   └── request-logger.ts    # Request logging middleware
│   ├── models/
│   │   ├── user.ts              # User data model
│   │   └── session.ts           # Session data model
│   ├── services/
│   │   ├── jwt.service.ts       # JWT token service
│   │   ├── oauth.service.ts     # OAuth integration service
│   │   └── session.service.ts   # Session management service
│   ├── types/
│   │   └── auth.ts              # TypeScript type definitions
│   ├── utils/
│   │   └── logger.ts            # Logging utilities
│   ├── database/
│   │   └── index.ts             # Database connection and setup
│   ├── redis/
│   │   └── index.ts             # Redis client and cache utilities
│   ├── rabbitmq/
│   │   ├── connection.ts        # RabbitMQ connection
│   │   └── publisher.ts         # Event publishing
│   ├── kafka/                   # Kafka integration (future)
│   ├── config/
│   │   └── index.ts             # Configuration management
│   ├── app.ts                   # Application setup
│   └── main.ts                  # Application entry point
├── openapi/
│   └── auth.yaml                # OpenAPI specification
├── migrations/                  # Database migrations
├── seeds/                       # Database seeds
├── tests/
│   ├── unit/                    # Unit tests
│   ├── integration/             # Integration tests
│   └── fixtures/                # Test data
├── Dockerfile                   # Container configuration
├── package.json                 # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── .env.example                # Environment template
└── README.md                   # Service documentation
```

### **Core Dependencies**
```json
{
  "dependencies": {
    "fastify": "^4.24.3",
    "@fastify/swagger": "^8.12.0",
    "@fastify/swagger-ui": "^2.1.0",
    "@fastify/cors": "^8.4.0",
    "@fastify/helmet": "^11.1.1",
    "@fastify/rate-limit": "^9.0.1",
    "@fastify/jwt": "^7.2.4",
    "@fastify/cookie": "^9.2.0",
    "@fastify/session": "^10.7.0",
    "joi": "^17.11.0",
    "knex": "^3.0.1",
    "pg": "^8.11.3",
    "redis": "^4.6.10",
    "amqplib": "^0.10.3",
    "winston": "^3.11.0",
    "uuid": "^9.0.1",
    "passport": "^0.7.0",
    "passport-google-oauth20": "^2.0.0",
    "dotenv": "^16.3.1",
    "zod": "^3.22.4"
  }
}
```

---

## 🔄 **Middleware Pipeline**

### **Authentication Middleware**
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

    // Get user from database
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    if (!user.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }

    // Attach user to request
    request.user = user;
    
    request.logger.debug('User authenticated', {
      userId: user.id,
      email: user.email,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError('Authentication failed');
  }
};
```

### **Session Attachment Middleware**
```typescript
export const attachSession = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  if (!request.user) {
    return;
  }

  const sessionId = request.headers['x-session-id'] as string;
  if (!sessionId) {
    return;
  }

  try {
    const session = await SessionModel.findById(sessionId);
    if (session && session.userId === request.user.id) {
      request.session = session;
      
      // Update last accessed time
      await SessionModel.updateLastAccessed(sessionId);
    }
  } catch (error) {
    request.logger.warn('Failed to attach session', {
      sessionId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
```

### **Error Handler Middleware**
```typescript
export const errorHandler: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.setErrorHandler(async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.correlationId;
    
    // Handle validation errors
    if (error.validation) {
      const errorResponse: ErrorResponse = {
        error: 'Validation Error',
        message: 'Invalid request data',
        statusCode: 400,
        correlationId,
      };
      
      request.logger.warn('Validation error', {
        error: error.message,
        validation: error.validation,
        correlationId,
      });
      
      return reply.status(400).send(errorResponse);
    }

    // Handle JWT errors
    if (error.code === 'FST_JWT_BAD_REQUEST' || error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
      const errorResponse: ErrorResponse = {
        error: 'Authentication Error',
        message: 'Invalid or missing authentication token',
        statusCode: 401,
        correlationId,
      };
      
      return reply.status(401).send(errorResponse);
    }

    // Handle custom application errors
    if (error instanceof AppError) {
      const errorResponse: ErrorResponse = {
        error: error.constructor.name,
        message: error.message,
        statusCode: error.statusCode,
        correlationId,
      };
      
      if (error.statusCode >= 500) {
        request.logger.error('Application error', {
          error: error.message,
          stack: error.stack,
          correlationId,
        });
      } else {
        request.logger.warn('Application error', {
          error: error.message,
          correlationId,
        });
      }
      
      return reply.status(error.statusCode).send(errorResponse);
    }

    // Handle unexpected errors
    const errorResponse: ErrorResponse = {
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      statusCode: 500,
      correlationId,
    };
    
    request.logger.error('Unexpected error', {
      error: error.message,
      stack: error.stack,
      correlationId,
    });
    
    return reply.status(500).send(errorResponse);
  });
};
```

---

## 🔧 **Processing Logic**

### **User Model Implementation**
```typescript
export class UserModel {
  static async create(userData: CreateUser): Promise<User> {
    const db = getDatabase();
    const hashedPassword = await bcrypt.hash(userData.password, config.security.bcryptRounds);
    
    const [user] = await db(TABLE_NAME)
      .insert({
        id: uuidv4(),
        email: userData.email.toLowerCase(),
        username: userData.username,
        firstName: userData.firstName,
        lastName: userData.lastName,
        passwordHash: hashedPassword,
        isActive: true,
        isEmailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning('*');

    // Remove password hash from response
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }

  static async verifyPassword(email: string, password: string): Promise<User | null> {
    const user = await this.findByEmailWithPassword(email);
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return null;

    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }

  static async updatePassword(id: string, newPassword: string): Promise<boolean> {
    const db = getDatabase();
    const hashedPassword = await bcrypt.hash(newPassword, config.security.bcryptRounds);
    
    const result = await db(TABLE_NAME)
      .where({ id })
      .update({
        passwordHash: hashedPassword,
        updatedAt: new Date(),
      });

    return result > 0;
  }
}
```

### **Redis Cache Service**
```typescript
export class CacheService {
  private static client = () => getRedisClient();

  static async setRefreshToken(userId: string, token: string, ttlSeconds: number): Promise<void> {
    await this.set(`refresh_token:${userId}`, token, ttlSeconds);
  }

  static async getRefreshToken(userId: string): Promise<string | null> {
    return await this.get<string>(`refresh_token:${userId}`);
  }

  static async deleteRefreshToken(userId: string): Promise<boolean> {
    return await this.del(`refresh_token:${userId}`);
  }

  static async setPasswordResetToken(email: string, token: string, ttlSeconds: number): Promise<void> {
    await this.set(`password_reset:${email}`, token, ttlSeconds);
  }

  static async incrementFailedLoginAttempts(email: string, ttlSeconds: number): Promise<number> {
    const key = `failed_login:${email}`;
    const attempts = await this.incr(key);
    if (attempts === 1) {
      await this.expire(key, ttlSeconds);
    }
    return attempts;
  }
}
```

### **Event Publishing**
```typescript
export const publishAuthEvent = async (
  routingKey: string,
  event: AuthEvent
): Promise<void> => {
  try {
    const channel = getChannel();
    const message = Buffer.from(JSON.stringify(event));

    await channel.publish('auth.events', routingKey, message, {
      persistent: true,
      timestamp: Date.now(),
      messageId: `${event.userId}-${Date.now()}`,
    });

    logger.info(`Published auth event: ${routingKey}`, {
      userId: event.userId,
      type: event.type,
    });
  } catch (error) {
    logger.error('Failed to publish auth event:', error);
    throw error;
  }
};
```

---

## 📊 **Monitoring & Observability**

### **Health Checks**
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
```typescript
import winston from 'winston';

export const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    config.logging.format === 'json' 
      ? winston.format.json()
      : winston.format.simple()
  ),
  defaultMeta: { 
    service: 'auth-service',
    version: process.env.npm_package_version 
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Add file transport in production
if (config.nodeEnv === 'production') {
  logger.add(new winston.transports.File({
    filename: 'logs/auth-service.log',
    maxsize: 10485760, // 10MB
    maxFiles: 5,
    tailable: true
  }));
}
```

### **Metrics Collection**
```typescript
import promClient from 'prom-client';

const metrics = {
  authAttempts: new promClient.Counter({
    name: 'auth_service_login_attempts_total',
    help: 'Total login attempts',
    labelNames: ['method', 'status']
  }),
  
  tokenGeneration: new promClient.Counter({
    name: 'auth_service_tokens_generated_total',
    help: 'Total tokens generated',
    labelNames: ['type']
  }),
  
  sessionDuration: new promClient.Histogram({
    name: 'auth_service_session_duration_seconds',
    help: 'Session duration in seconds',
    buckets: [300, 900, 1800, 3600, 7200, 14400, 28800, 86400]
  }),
  
  oauthRequests: new promClient.Counter({
    name: 'auth_service_oauth_requests_total',
    help: 'OAuth requests',
    labelNames: ['provider', 'status']
  })
};

// Metrics endpoint
fastify.get('/metrics', async (request, reply) => {
  reply.type('text/plain');
  return promClient.register.metrics();
});
```

---

## 🧪 **Testing Strategy**

### **Unit Tests**
```typescript
describe('UserModel', () => {
  describe('create', () => {
    it('should create user with hashed password', async () => {
      const userData: CreateUser = {
        email: 'test@example.com',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        password: 'password123'
      };

      const user = await UserModel.create(userData);

      expect(user.id).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.isActive).toBe(true);
      expect(user.isEmailVerified).toBe(false);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const email = 'test@example.com';
      const password = 'password123';

      const user = await UserModel.verifyPassword(email, password);

      expect(user).toBeTruthy();
      expect(user?.email).toBe(email);
    });

    it('should reject incorrect password', async () => {
      const email = 'test@example.com';
      const password = 'wrongpassword';

      const user = await UserModel.verifyPassword(email, password);

      expect(user).toBeNull();
    });
  });
});
```

### **Integration Tests**
```typescript
describe('Auth Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('should register new user', async () => {
      const userData = {
        email: 'newuser@example.com',
        username: 'newuser',
        firstName: 'New',
        lastName: 'User',
        password: 'password123'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: userData
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toHaveProperty('user');
      expect(response.json()).toHaveProperty('accessToken');
    });

    it('should reject duplicate email', async () => {
      const userData = {
        email: 'existing@example.com',
        username: 'newuser2',
        firstName: 'New',
        lastName: 'User',
        password: 'password123'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: userData
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: loginData
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('accessToken');
      expect(response.json()).toHaveProperty('refreshToken');
    });

    it('should reject invalid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: loginData
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
```

### **Load Testing**
```typescript
// Artillery configuration for load testing
const loadTestConfig = {
  config: {
    target: 'http://localhost:3001',
    phases: [
      { duration: 60, arrivalRate: 10 },   // Warm up
      { duration: 120, arrivalRate: 50 },  // Ramp up
      { duration: 300, arrivalRate: 100 }, // Sustained load
      { duration: 60, arrivalRate: 200 }   // Peak load
    ],
    processor: './load-test-processor.js'
  },
  scenarios: [
    {
      name: 'User Registration',
      weight: 20,
      flow: [
        {
          post: {
            url: '/auth/register',
            json: {
              email: '{{ $randomEmail }}',
              username: '{{ $randomString }}',
              firstName: 'Test',
              lastName: 'User',
              password: 'password123'
            }
          }
        }
      ]
    },
    {
      name: 'User Login',
      weight: 60,
      flow: [
        {
          post: {
            url: '/auth/login',
            json: {
              email: 'test@example.com',
              password: 'password123'
            },
            capture: {
              json: '$.accessToken',
              as: 'token'
            }
          }
        }
      ]
    },
    {
      name: 'Protected Endpoints',
      weight: 20,
      flow: [
        {
          get: {
            url: '/users/me',
            headers: {
              authorization: 'Bearer {{ token }}'
            }
          }
        }
      ]
    }
  ]
};
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
    adduser -S authuser -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=authuser:nodejs /app/dist ./dist
COPY --from=builder --chown=authuser:nodejs /app/migrations ./migrations

# Switch to non-root user
USER authuser

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start the application
CMD ["node", "dist/main.js"]
```

### **Docker Compose Integration**
```yaml
version: '3.8'

services:
  auth-service:
    build:
      context: ./services/auth-service
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - DATABASE_URL=postgresql://lms_user:${DB_PASSWORD}@postgres:5432/lms_auth
      - REDIS_URL=redis://redis:6379
      - RABBITMQ_URL=amqp://rabbitmq:5672
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
      - SESSION_SECRET=${SESSION_SECRET}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
      - CORS_ORIGIN=${FRONTEND_URL}
    depends_on:
      - postgres
      - redis
      - rabbitmq
    networks:
      - lms-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M

networks:
  lms-network:
    driver: bridge
```

### **Kubernetes Deployment** (Optional)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
  labels:
    app: auth-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
    spec:
      containers:
      - name: auth-service
        image: lms/auth-service:latest
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: database-url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: jwt-secret
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: auth-service
spec:
  selector:
    app: auth-service
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3001
  type: ClusterIP
```

---

## 📈 **Performance Requirements**

### **Response Time Targets**
- **Authentication endpoints:** < 200ms (95th percentile)
- **User profile operations:** < 100ms (average)
- **Session management:** < 50ms (average)
- **Health checks:** < 25ms
- **OAuth flow:** < 500ms total

### **Throughput Requirements**
- **Peak load:** 500 requests/second
- **Sustained load:** 200 requests/second
- **Concurrent sessions:** 10,000 active sessions
- **Daily authentications:** 100,000 logins

### **Resource Utilization**
- **Memory usage:** < 512MB under normal load
- **CPU usage:** < 50% under peak load
- **Database connections:** 2-10 pool size
- **Redis connections:** 1-5 pool size

### **Scalability Targets**
- **Horizontal scaling:** Support 5+ instances
- **Load balancing:** Round-robin with health checks
- **Auto-scaling:** Based on CPU and memory metrics
- **Geographic distribution:** Multi-region deployment ready

---

## 🔒 **Security Requirements**

### **Authentication & Authorization**
- **JWT validation:** RS256 or HS256 algorithms
- **Token expiration:** Configurable (default 24 hours)
- **Refresh tokens:** Secure rotation mechanism
- **Session security:** HttpOnly, Secure, SameSite cookies
- **OAuth integration:** Google OAuth 2.0 with PKCE

### **Input Validation**
- **Request validation:** TypeBox schema validation
- **Parameter sanitization:** SQL injection prevention
- **Rate limiting:** Per-IP and per-user limits
- **CORS protection:** Configurable origins

### **Security Headers**
```typescript
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};
```

### **Audit Logging**
```typescript
interface AuditLog {
  timestamp: string;
  userId?: string;
  action: string;
  resource: string;
  clientIp: string;
  userAgent: string;
  success: boolean;
  details?: Record<string, any>;
}
```

---

## 🎯 **Success Criteria**

### **Functional Requirements**
- ✅ Successfully authenticate users with JWT tokens
- ✅ Support Google OAuth 2.0 integration
- ✅ Manage user sessions with Redis storage
- ✅ Publish authentication events to RabbitMQ
- ✅ Provide comprehensive user management
- ✅ Handle password reset and email verification
- ✅ Support role-based access control

### **Non-Functional Requirements**
- ✅ **Availability:** 99.9% uptime SLA
- ✅ **Performance:** < 200ms authentication response time
- ✅ **Scalability:** Handle 500 concurrent requests
- ✅ **Security:** Zero security vulnerabilities
- ✅ **Monitoring:** Comprehensive health checks and metrics
- ✅ **Documentation:** Complete API documentation
- ✅ **Maintainability:** Clean, testable codebase

### **Operational Requirements**
- ✅ **Deployment:** Containerized with Docker
- ✅ **Configuration:** Environment-based configuration
- ✅ **Monitoring:** Prometheus metrics integration
- ✅ **Logging:** Structured JSON logging
- ✅ **Health checks:** Kubernetes-ready probes
- ✅ **Error handling:** Graceful degradation
- ✅ **Recovery:** Automatic service recovery

---

This specification provides a complete blueprint for building a production-ready Auth Service that serves as the security foundation for the LMS microservices architecture, ensuring secure authentication, authorization, and session management while maintaining high performance and reliability standards.
