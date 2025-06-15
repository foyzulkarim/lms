# Analytics Service

Real-time learning analytics, reporting, and business intelligence service for the LMS platform.

## 🎯 Overview

The Analytics Service provides comprehensive learning analytics capabilities including:

- **Real-time Dashboard Data** - Live metrics and KPIs
- **Learning Progress Tracking** - User learning journeys and outcomes  
- **Performance Metrics** - Course and assessment analytics
- **Custom Report Generation** - Automated report creation and delivery
- **Data Aggregation** - Materialized views for fast queries
- **Event Processing** - Real-time event stream processing

## 🏗️ Architecture

### Service Components

1. **Analytics Service** (Port 3007)
   - REST API for analytics queries
   - Real-time dashboard endpoints
   - Report management APIs

2. **Analytics Worker** (Port 3008)
   - Background job processing
   - Data aggregation tasks
   - Report generation
   - Scheduled cleanup jobs

### Dependencies

- **PostgreSQL** - Primary data storage for analytics
- **Redis** - Caching and job queues
- **Kafka** - Event stream processing
- **File Storage** - Report file storage

## 🚀 Quick Start

### Development Mode

```bash
# From project root
docker-compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d analytics-service analytics-worker

# View logs
docker-compose logs -f analytics-service
docker-compose logs -f analytics-worker
```

### Production Mode

```bash
# From project root
docker-compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml up -d analytics-service analytics-worker
```

## 🔧 Configuration

### Environment Variables

#### Core Configuration
```bash
NODE_ENV=development
PORT=3007
LOG_LEVEL=debug
```

#### Database Configuration
```bash
POSTGRES_URL=postgresql://user:pass@postgresql:5432/lms_db
REDIS_URL=redis://:password@redis-master:6379/3
```

#### Event Processing
```bash
KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
KAFKA_CLIENT_ID=analytics-service
KAFKA_GROUP_ID=analytics-group
```

#### Analytics-Specific Settings
```bash
# Caching
CACHE_TTL_SECONDS=300
DASHBOARD_CACHE_TTL_SECONDS=60

# Report Generation
REPORTS_STORAGE_PATH=/app/reports
MAX_REPORT_SIZE_MB=50
MAX_CONCURRENT_REPORTS=5

# Feature Flags
ENABLE_REAL_TIME_ANALYTICS=true
ENABLE_REPORT_GENERATION=true
ENABLE_ADVANCED_METRICS=true
```

### Volumes

- **analytics_reports** - Generated report files
- **analytics_temp** - Temporary processing files

## 📊 API Endpoints

### Health Check
```
GET /health
```

### Dashboard
```
GET /api/v1/dashboard?timeframe=30d&filters={}
```

### User Analytics
```
GET /api/v1/users/{userId}/analytics
```

### Course Analytics
```
GET /api/v1/courses/{courseId}/analytics
```

### Reports
```
GET /api/v1/reports
POST /api/v1/reports/{reportId}/generate
GET /api/v1/reports/{reportId}/status/{jobId}
```

### Learning Progress
```
GET /api/v1/learning-progress?userId={id}&courseId={id}
```

## 🎯 Event Processing

### Consumed Events

The service consumes events from multiple topics:

#### User Events (`user-events`)
- `UserCreated` - New user registration
- `UserEnrolled` - Course enrollment
- `UserCompletedCourse` - Course completion

#### Course Events (`course-events`)
- `CourseCreated` - New course creation
- `CoursePublished` - Course publication
- `ModuleCompleted` - Module completion

#### Assessment Events (`assessment-events`)
- `AssessmentStarted` - Assessment attempt started
- `AssessmentCompleted` - Assessment completion

### Published Events

#### Analytics Events (`analytics-events`)
- `AnalyticsUpdated` - Analytics data updated
- `ReportGenerated` - Report generation completed

## 🔄 Background Jobs

### Data Aggregation Jobs
- **Hourly Aggregation** - Real-time metrics rollup
- **Daily Aggregation** - Daily summary calculations
- **Weekly Aggregation** - Weekly trend analysis
- **Monthly Aggregation** - Monthly reporting data

### Maintenance Jobs
- **Data Cleanup** - Remove old temporary data
- **Report Cleanup** - Archive old report files
- **Cache Warming** - Pre-populate frequently accessed data

### Report Generation Jobs
- **CSV Export** - Generate CSV reports
- **Excel Export** - Generate Excel reports
- **PDF Reports** - Generate formatted PDF reports
- **Email Delivery** - Send reports via email

## 📈 Performance Features

### Caching Strategy
- **Dashboard Metrics** - 60-second cache
- **User Analytics** - 5-minute cache
- **Course Analytics** - 5-minute cache
- **Report Data** - 30-minute cache

### Query Optimization
- **Materialized Views** - Pre-aggregated data
- **Database Indexes** - Optimized query performance
- **Connection Pooling** - Efficient database connections
- **Batch Processing** - Efficient bulk operations

## 🧪 Testing

### Unit Tests
```bash
npm test
npm run test:coverage
```

### Integration Tests
```bash
npm run test:integration
```

### Load Testing
```bash
# Test dashboard performance
curl -w "@curl-format.txt" -s -o /dev/null "http://localhost:3007/api/v1/dashboard"

# Test concurrent report generation
for i in {1..10}; do
  curl -X POST "http://localhost:3007/api/v1/reports/user-progress/generate" &
done
```

## 📊 Monitoring

### Health Checks
- **Service Health** - `/health` endpoint
- **Database Connectivity** - PostgreSQL connection test
- **Cache Connectivity** - Redis connection test
- **Event Processing** - Kafka consumer status

### Metrics
- API response times
- Event processing latency
- Database query performance
- Cache hit rates
- Report generation times
- Memory and CPU usage

### Logging
- Structured JSON logging
- Request/response logging
- Event processing logs
- Error tracking with stack traces
- Performance metrics

## 🔒 Security

### Authentication
- JWT token validation
- Service-to-service API keys
- Role-based access control

### Data Protection
- No PII in logs
- Encrypted data at rest
- Audit trail for report access
- GDPR-compliant data handling

## 🚀 Deployment

### Docker Build
```bash
# Build main service
docker build -t lms/analytics-service .

# Build worker
docker build -f Dockerfile.worker -t lms/analytics-worker .
```

### Health Checks
```bash
# Check service health
curl http://localhost:3007/health

# Check worker health
curl http://localhost:3008/health
```

### Scaling
```bash
# Scale analytics workers
docker-compose up -d --scale analytics-worker=3
```

## 📝 Development

### Project Structure
```
src/
├── controllers/          # HTTP request handlers
├── services/            # Business logic
├── models/              # Data models
├── events/              # Event handlers and publishers
├── repositories/        # Data access layer
├── jobs/                # Background job definitions
├── utils/               # Utility functions
├── config/              # Configuration
├── main.ts              # Service entry point
└── worker.ts            # Worker entry point
```

### Adding New Analytics
1. Define data model in `models/`
2. Create repository in `repositories/`
3. Implement service logic in `services/`
4. Add API endpoints in `controllers/`
5. Create event handlers in `events/handlers/`
6. Add background jobs if needed in `jobs/`

### Adding New Reports
1. Define report schema in `models/reports.model.ts`
2. Implement generation logic in `services/reports.service.ts`
3. Add API endpoints in `controllers/reports.controller.ts`
4. Create background job in `jobs/report-generation.job.ts`

## 🐛 Troubleshooting

### Common Issues

**Service won't start:**
```bash
# Check logs
docker-compose logs analytics-service

# Check dependencies
docker-compose ps postgresql redis-master kafka-1
```

**Event processing issues:**
```bash
# Check Kafka consumer status
docker-compose exec analytics-service npm run kafka:status

# Check event processing logs
docker-compose logs analytics-service | grep "event"
```

**Report generation failures:**
```bash
# Check worker logs
docker-compose logs analytics-worker

# Check report storage
docker-compose exec analytics-service ls -la /app/reports
```

**Performance issues:**
```bash
# Check resource usage
docker stats lms-analytics-service lms-analytics-worker

# Check database performance
docker-compose exec postgresql pg_stat_activity
```

This service provides comprehensive analytics capabilities while maintaining high performance and reliability standards for the LMS platform.
