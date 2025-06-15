# LMS Auth Service

A sophisticated authentication and authorization service for the Learning Management System, featuring Google OAuth integration, session management, and event-driven architecture.

## Features

- **Google OAuth Integration**: Secure authentication via Google OAuth 2.0
- **Hybrid Authentication**: JWT tokens for API access + Redis sessions for web interface
- **Session Management**: Secure cookie-based sessions with Redis storage
- **Event-Driven Architecture**: RabbitMQ integration for publishing auth events
- **Role-Based Access Control**: Admin, Instructor, and Student roles
- **Security Features**: Rate limiting, CORS, security headers, input validation
- **Production Ready**: Comprehensive logging, error handling, and monitoring

## Architecture

### Core Components

- **Authentication Routes**: Google OAuth flow and session management
- **Session Management**: Redis-backed sessions with cookie support
- **JWT Service**: Token generation and validation
- **Event Publishing**: RabbitMQ integration for auth events
- **User Management**: User profile and role management

### Technology Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Fastify
- **Database**: PostgreSQL
- **Cache/Sessions**: Redis
- **Message Broker**: RabbitMQ
- **Authentication**: Google OAuth 2.0 + JWT
- **Documentation**: OpenAPI/Swagger

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL
- Redis
- RabbitMQ
- Google OAuth credentials

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment**:
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Set up database**:
   ```bash
   npm run migrate
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

### Environment Configuration

Key environment variables (see `env.example` for complete list):

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/lms_auth

# Redis
REDIS_URL=redis://localhost:6379

# JWT Secrets (generate secure keys)
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long
JWT_REFRESH_SECRET=your-super-secret-refresh-key-at-least-32-characters-long
SESSION_SECRET=your-super-secret-session-key-at-least-32-characters-long

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672
```

## API Documentation

Once running, visit:
- **Swagger UI**: http://localhost:3001/docs
- **OpenAPI Spec**: http://localhost:3001/docs/json

## Authentication Flow

### Google OAuth Flow

1. **Initiate OAuth**: `GET /oauth/google`
2. **Handle Callback**: `GET /oauth/google/callback`
3. **Session Created**: User session stored in Redis
4. **JWT Issued**: Access token for API calls

### Session Management

- **Cookie-based sessions** for web interface
- **JWT tokens** for API authentication
- **Redis storage** for session persistence
- **Automatic cleanup** of expired sessions

## Event Publishing

The service publishes events to RabbitMQ:

### Auth Events
- `user.login` - User successful login
- `user.logout` - User logout
- `user.register` - New user registration

### User Events
- `user.created` - User profile created
- `user.updated` - User profile updated
- `user.role_changed` - User role modified

## Security Features

- **Rate Limiting**: Configurable per-endpoint limits
- **CORS Protection**: Configurable origins
- **Security Headers**: Helmet.js integration
- **Input Validation**: Comprehensive request validation
- **Session Security**: HttpOnly, Secure cookies
- **JWT Security**: Signed tokens with refresh mechanism

## Development

### Scripts

```bash
npm run dev          # Start development server
npm run build        # Build TypeScript
npm run start        # Start production server
npm run test         # Run tests
npm run lint         # Lint code
npm run migrate      # Run database migrations
```

### Project Structure

```
src/
├── routes/          # API route handlers
├── services/        # Business logic services
├── middleware/      # Custom middleware
├── models/          # Database models
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
├── config/          # Configuration management
├── database/        # Database setup and migrations
├── redis/           # Redis client and utilities
├── rabbitmq/        # RabbitMQ integration
└── app.ts           # Application setup
```

## Deployment

### Docker

```bash
# Build image
docker build -t lms-auth-service .

# Run container
docker run -p 3001:3001 --env-file .env lms-auth-service
```

### Production Considerations

- Use strong, unique secrets for JWT and sessions
- Configure proper CORS origins
- Set up SSL/TLS termination
- Monitor RabbitMQ and Redis connections
- Implement proper logging and monitoring
- Set up database connection pooling

## Contributing

1. Follow TypeScript best practices
2. Add tests for new features
3. Update documentation
4. Follow conventional commit messages
5. Ensure all linting passes

## License

MIT License 
