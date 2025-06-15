# Notification Service - Docker Compose Configuration

This directory contains the service-level Docker Compose configuration for the Notification Service, which provides multi-channel notification delivery with EMAIL-Dispatcher integration.

## 🚀 Quick Start

### Development Mode
```bash
# Run with development overrides
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Or from the root directory
docker-compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up notification-service
```

### Production Mode
```bash
# Run in production mode
docker-compose up

# Or from the root directory
docker-compose -f infra/docker-compose.yml up notification-service
```

## 📋 Service Configuration

### Core Features
- **Multi-Channel Delivery**: Email and web push notifications
- **EMAIL-Dispatcher Integration**: External email service integration
- **Template Management**: Dynamic template rendering with personalization
- **User Preferences**: Quiet hours and notification preferences
- **Delivery Tracking**: Open, click, and delivery analytics
- **Bulk Messaging**: Campaign and bulk notification support
- **Event-Driven Processing**: Kafka integration for real-time notifications

### Key Environment Variables

#### Server Configuration
- `PORT`: Service port (default: 3006)
- `NODE_ENV`: Environment mode (development/production)
- `LOG_LEVEL`: Logging level (info/debug/error)

#### Database Configuration
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection for caching and queues
- `DB_POOL_MIN/MAX`: Database connection pool settings

#### EMAIL-Dispatcher Integration
- `EMAIL_DISPATCHER_URL`: EMAIL-Dispatcher service URL
- `EMAIL_DISPATCHER_API_KEY`: API key for EMAIL-Dispatcher
- `DEFAULT_FROM_NAME`: Default sender name
- `DEFAULT_FROM_EMAIL`: Default sender email address
- `DEFAULT_REPLY_TO`: Default reply-to address

#### Web Push Configuration
- `VAPID_SUBJECT`: VAPID subject (mailto: format)
- `VAPID_PUBLIC_KEY`: VAPID public key for web push
- `VAPID_PRIVATE_KEY`: VAPID private key for web push
- `DEFAULT_PUSH_ICON`: Default notification icon
- `PUSH_TTL`: Push notification time-to-live

#### Queue Configuration
- `QUEUE_CONCURRENCY`: Number of concurrent workers (default: 10)
- `MAX_RETRY_ATTEMPTS`: Maximum retry attempts (default: 3)
- `BATCH_SIZE`: Batch processing size (default: 100)
- `BULK_THROTTLE_MS`: Throttling for bulk operations

#### Rate Limiting
- `EMAIL_RATE_LIMIT`: Email rate limit per hour per user (default: 1000)
- `PUSH_RATE_LIMIT`: Push notification rate limit (default: 500)
- `GLOBAL_RATE_LIMIT`: Global rate limit (default: 10000)

#### Template Configuration
- `TEMPLATE_CACHE_TTL`: Template cache time-to-live (default: 3600)
- `ENABLE_TEMPLATE_VALIDATION`: Enable template validation
- `MAX_TEMPLATE_SIZE`: Maximum template size in bytes
- `TEMPLATE_RENDER_TIMEOUT`: Template rendering timeout

#### Analytics Configuration
- `ENABLE_DELIVERY_TRACKING`: Enable delivery tracking
- `ENABLE_OPEN_TRACKING`: Enable email open tracking
- `ENABLE_CLICK_TRACKING`: Enable link click tracking
- `ANALYTICS_RETENTION_DAYS`: Analytics data retention period

#### Feature Flags
- `ENABLE_EMAIL_NOTIFICATIONS`: Enable email notifications
- `ENABLE_PUSH_NOTIFICATIONS`: Enable push notifications
- `ENABLE_BULK_MESSAGING`: Enable bulk messaging
- `ENABLE_SCHEDULED_NOTIFICATIONS`: Enable scheduled notifications

## 🔧 Development vs Production

### Development Mode Features
- Hot reloading with source code mounting
- Debug logging enabled
- Exposed service port (3006) and metrics port (9096)
- Lower resource limits
- Reduced rate limiting for testing
- Mock services support
- SQL query logging enabled

### Production Mode Features
- Optimized Docker image
- Resource limits and reservations
- Production logging configuration
- Full rate limiting enforcement
- Security hardening
- Automatic restart policies
- Comprehensive health checks

## 📊 Health Monitoring

### Health Check Endpoints
- `GET /health` - Basic health status
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe
- `GET /metrics` - Prometheus metrics

### Key Metrics
- Notifications sent by type and channel
- Delivery success/failure rates
- Template rendering performance
- Queue depth and processing rates
- Rate limiting statistics
- External service response times

## 🔗 Dependencies

### Required Services
- **PostgreSQL**: Notification metadata and tracking
- **Redis**: Caching, queues, and rate limiting
- **EMAIL-Dispatcher**: External email delivery service

### Optional Services
- **Kafka**: Event streaming for real-time notifications
- **Prometheus**: Metrics collection
- **Jaeger**: Distributed tracing

## 📁 Volume Mounts

### Production Volumes
- `notification_logs`: Service logs
- `notification_templates`: Template storage

### Development Volumes
- `./src`: Source code (hot reloading)
- `./logs`: Development logs
- `./templates`: Development templates
- `./migrations`: Database migrations

## 🚨 Troubleshooting

### Common Issues

1. **EMAIL-Dispatcher Connection Failed**
   ```bash
   # Check EMAIL-Dispatcher service status
   curl http://email-dispatcher:3020/health
   
   # Verify API key configuration
   echo $EMAIL_DISPATCHER_API_KEY
   ```

2. **Database Connection Issues**
   ```bash
   # Check PostgreSQL connection
   docker-compose exec postgresql pg_isready
   
   # Check database migrations
   docker-compose exec notification-service npm run migrate:latest
   ```

3. **Redis Connection Issues**
   ```bash
   # Check Redis connection
   docker-compose exec redis-master redis-cli ping
   
   # Check notification queues
   docker-compose exec redis-master redis-cli KEYS "notification:*"
   ```

4. **Web Push Issues**
   ```bash
   # Verify VAPID keys are configured
   echo $VAPID_PUBLIC_KEY
   echo $VAPID_PRIVATE_KEY
   
   # Check push subscription format
   docker-compose logs notification-service | grep "push"
   ```

5. **Template Rendering Issues**
   ```bash
   # Check template cache
   docker-compose exec redis-master redis-cli KEYS "notification:template:*"
   
   # Verify template validation
   docker-compose logs notification-service | grep "template"
   ```

### Debug Mode
```bash
# Enable debug logging
export LOG_LEVEL=debug
export LOG_SQL_QUERIES=true
export ENABLE_REQUEST_LOGGING=true

# Enable mock services for testing
export MOCK_EMAIL_DISPATCHER=true
export MOCK_PUSH_SERVICE=true

# Start with debug configuration
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up notification-service
```

## 🔒 Security Considerations

- Non-root user execution in containers
- API key protection for EMAIL-Dispatcher integration
- VAPID key security for web push
- Rate limiting to prevent abuse
- Input validation for templates and content
- Unsubscribe token security
- CORS configuration for web push

## 📈 Scaling

The Notification Service supports horizontal scaling:

```bash
# Scale to multiple instances
docker-compose up --scale notification-service=3

# Or use the infrastructure-level scaling
docker-compose -f infra/docker-compose.yml up --scale notification-service=3
```

Each instance will:
- Share the same Redis queues
- Process notifications independently
- Share template cache
- Report metrics separately
- Handle different user segments

## 🔄 Integration

The Notification Service integrates with:
- **User Service**: User preferences and contact information
- **Course Service**: Course-related notifications
- **Auth Service**: Authentication for API access
- **Analytics Service**: Delivery and engagement metrics
- **EMAIL-Dispatcher**: External email delivery
- **Event Bus (Kafka)**: Real-time notification triggers

## 📧 Notification Types

### Supported Notification Types
- **Welcome**: User registration welcome messages
- **Course Enrolled**: Course enrollment confirmations
- **Assignment Due**: Assignment deadline reminders
- **Assignment Graded**: Grade notifications
- **Course Completed**: Course completion certificates
- **Discussion Reply**: Forum discussion notifications
- **System Announcement**: Platform-wide announcements
- **Password Reset**: Security-related notifications
- **Login Alert**: Security login notifications
- **Bulk Message**: Campaign and marketing messages

### Channel Support
- **Email**: Rich HTML emails via EMAIL-Dispatcher
- **Web Push**: Browser push notifications with actions

For more detailed information, see the [Notification Service Technical Specification](../../docs/architecture/notification-service-spec.md).
