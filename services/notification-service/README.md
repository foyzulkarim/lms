# Notification Service v2.0

A comprehensive multi-channel notification service with EMAIL-Dispatcher integration and web push notifications for the LMS platform.

## 🚀 Features

### Multi-Channel Delivery
- **Email Notifications** - Integration with external EMAIL-Dispatcher service
- **Web Push Notifications** - Browser push notifications using Web Push API
- **Template Management** - Rich email and push notification templates with variables
- **User Preferences** - Comprehensive preference system with quiet hours

### Advanced Capabilities
- **Bulk Messaging** - Efficient batch processing for campaigns
- **Scheduled Notifications** - Support for delayed and scheduled delivery
- **Delivery Tracking** - Complete status tracking with retry logic
- **Analytics & Reporting** - Comprehensive delivery statistics and user engagement metrics
- **Event-Driven Processing** - Consumes events from other LMS services

### Production-Ready Features
- **Rate Limiting** - Prevents notification spam and respects user preferences
- **Queue Management** - BullMQ with Redis for reliable job processing
- **Circuit Breakers** - Protection against external service failures
- **Comprehensive Monitoring** - Prometheus metrics and health checks
- **Graceful Shutdown** - Proper cleanup of resources and connections

## 🏗️ Architecture

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

## 📦 Installation

### Prerequisites
- Node.js 18+
- PostgreSQL 13+
- Redis 6+
- EMAIL-Dispatcher service running

### Setup

1. **Clone and install dependencies**
```bash
cd services/notification-service
npm install
```

2. **Environment Configuration**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Database Setup**
```bash
# Create database
createdb lms_notifications

# Run migrations
npm run db:migrate

# Optional: Seed with sample data
npm run db:seed
```

4. **Generate VAPID Keys for Web Push**
```bash
npx web-push generate-vapid-keys
# Add keys to .env file
```

## 🚀 Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

### Docker
```bash
docker build -t lms/notification-service .
docker run -p 3006:3006 lms/notification-service
```

## 📡 API Endpoints

### Core Notification Endpoints

#### Send Single Notification
```http
POST /api/v1/notifications/send
Authorization: Bearer <jwt-token>

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
    "courseName": "Machine Learning Fundamentals"
  },
  "sourceService": "course-service"
}
```

#### Send Bulk Notification
```http
POST /api/v1/notifications/send/bulk
Authorization: Bearer <jwt-token>

{
  "type": "system_announcement",
  "channels": ["email"],
  "title": "System Maintenance Notice",
  "message": "The system will be down for maintenance...",
  "recipients": [...],
  "batchSize": 100,
  "sourceService": "admin-service"
}
```

#### Schedule Notification
```http
POST /api/v1/notifications/schedule
Authorization: Bearer <jwt-token>

{
  "type": "assignment_due",
  "scheduleAt": "2024-01-01T09:00:00Z",
  "channels": ["email", "web_push"],
  "recipients": [...],
  "title": "Assignment Due Reminder",
  "sourceService": "assignment-service"
}
```

### Template Management
```http
GET    /api/v1/notifications/templates
POST   /api/v1/notifications/templates
GET    /api/v1/notifications/templates/:id
PUT    /api/v1/notifications/templates/:id
DELETE /api/v1/notifications/templates/:id
```

### User Preferences
```http
GET /api/v1/notifications/preferences/:userId
PUT /api/v1/notifications/preferences/:userId
POST /api/v1/notifications/preferences/:userId/push/subscribe
```

### Analytics
```http
GET /api/v1/notifications/analytics/deliveries
GET /api/v1/notifications/deliveries/user/:userId
```

## 🔧 Configuration

### Key Environment Variables

```bash
# EMAIL-Dispatcher Integration
EMAIL_DISPATCHER_URL=http://email-dispatcher:3020
EMAIL_DISPATCHER_API_KEY=your-api-key

# Web Push Configuration
VAPID_SUBJECT=mailto:admin@lms.example.com
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key

# Database & Redis
DATABASE_URL=postgresql://user:pass@postgres:5432/lms_notifications
REDIS_URL=redis://redis:6379

# Queue Configuration
QUEUE_CONCURRENCY=10
MAX_RETRY_ATTEMPTS=3
BATCH_SIZE=100

# Feature Flags
ENABLE_EMAIL_NOTIFICATIONS=true
ENABLE_PUSH_NOTIFICATIONS=true
ENABLE_BULK_MESSAGING=true
```

## 🔄 Event Integration

### Consumed Events
- `UserEnrolled` → Welcome/enrollment notifications
- `AssignmentDue` → Due date reminders
- `CourseCompleted` → Completion certificates
- `DiscussionReply` → Forum notifications
- `SystemAnnouncement` → Broadcast messages

### Published Events
- `NotificationDelivered` → For analytics tracking
- `NotificationFailed` → For error monitoring
- `PreferencesUpdated` → For user management

## 📊 Monitoring

### Health Checks
```http
GET /health
GET /health/detailed
```

### Metrics
```http
GET /metrics          # Prometheus metrics
GET /metrics/health   # Service health metrics
```

### Key Metrics
- `notification_service_notifications_sent_total`
- `notification_service_delivery_duration_seconds`
- `notification_service_queue_size`
- `notification_service_template_render_duration_seconds`

## 🧪 Testing

### Run Tests
```bash
npm test
npm run test:coverage
npm run test:watch
```

### Integration Testing
```bash
# Test EMAIL-Dispatcher connection
curl -X POST http://localhost:3006/api/v1/notifications/send \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"type":"test","channels":["email"],...}'
```

## 🔒 Security

### Authentication
- JWT token authentication for API endpoints
- API key authentication for service-to-service calls
- Role-based access control

### Rate Limiting
- Per-user rate limits for email and push notifications
- Global rate limits for API endpoints
- Configurable time windows and limits

### Data Protection
- User preference encryption
- Secure unsubscribe mechanisms
- GDPR-compliant data handling

## 🚀 Deployment

### Docker Compose
```yaml
version: '3.8'
services:
  notification-service:
    build: .
    ports:
      - "3006:3006"
    environment:
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/lms_notifications
      - REDIS_URL=redis://redis:6379
      - EMAIL_DISPATCHER_URL=http://email-dispatcher:3020
    depends_on:
      - postgres
      - redis
      - email-dispatcher
```

### Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: notification-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: notification-service
  template:
    metadata:
      labels:
        app: notification-service
    spec:
      containers:
      - name: notification-service
        image: lms/notification-service:2.0.0
        ports:
        - containerPort: 3006
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: notification-secrets
              key: database-url
```

## 📚 Documentation

- **API Documentation**: Available at `/docs` when `ENABLE_SWAGGER=true`
- **Architecture Guide**: See `docs/architecture.md`
- **Integration Guide**: See `docs/integration.md`
- **Troubleshooting**: See `docs/troubleshooting.md`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

- **Issues**: GitHub Issues
- **Documentation**: `/docs` endpoint
- **Health Check**: `/health` endpoint
- **Metrics**: `/metrics` endpoint

---

**Notification Service v2.0** - Powering multi-channel communication for the LMS platform! 🚀
