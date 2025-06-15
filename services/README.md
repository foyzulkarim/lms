# LMS Services

This directory contains all the business logic microservices for the LMS platform. Each service is self-contained with its own Docker Compose configuration.

## 📁 Service Structure

Each service directory should follow this structure:

```
service-name/
├── src/                           # Source code
├── tests/                         # Unit and integration tests
├── docs/                          # Service-specific documentation
├── Dockerfile                     # Multi-stage Docker build
├── docker-compose.yml             # Service-specific compose file
├── package.json                   # Dependencies and scripts
├── .env.example                   # Environment variables template
└── README.md                      # Service documentation
```

## 🚀 Development Workflow

### Running Individual Services

Each service can be developed and tested independently:

```bash
# Navigate to service directory
cd services/api-gateway

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Build Docker image
docker build -t lms/api-gateway:dev .
```

### Running with Infrastructure

From the project root, run the full stack with development overrides:

```bash
# Start all services in development mode
docker-compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d

# Start specific services
docker-compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d api-gateway user-service

# View logs for specific service
docker-compose -f infra/docker-compose.yml logs -f api-gateway
```

## 📋 Service List

| Service | Port | Description | Status |
|---------|------|-------------|--------|
| **api-gateway** | 3000 | Main API gateway and request router | ✅ Configured |
| **auth-service** | 3003 | Authentication and authorization | ✅ Configured |
| **user-service** | 3001 | User management and profiles | ✅ Configured |
| **course-service** | 3002 | Course and curriculum management | 🔄 Pending |
| **file-service** | 3004 | File storage and processing | 🔄 Pending |
| **search-service** | 3005 | Search functionality | 🔄 Pending |
| **notification-service** | 3006 | Notifications and messaging | 🔄 Pending |
| **analytics-service** | 3007 | Analytics and reporting | 🔄 Pending |
| **content-ingestion-service** | 3008 | Content processing pipeline | 🔄 Pending |
| **llm-gateway** | 3009 | LLM service coordination | 🔄 Pending |
| **llm-worker** | - | Background LLM processing | 🔄 Pending |

## 🔧 Docker Compose Configuration

Each service's `docker-compose.yml` file should include:

### Basic Structure
```yaml
version: '3.8'

services:
  service-name:
    build:
      context: .
      dockerfile: Dockerfile
      target: ${BUILD_TARGET:-production}
    image: lms/service-name:${VERSION:-latest}
    container_name: lms-service-name
    environment:
      - NODE_ENV=${NODE_ENV:-production}
      - PORT=3001
      - LOG_LEVEL=${LOG_LEVEL:-info}
      # ... other environment variables
    depends_on:
      - postgresql
      - redis-master
    networks:
      - lms-internal
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    labels:
      - "lms.service.type=application"
      - "lms.service.name=service-name"
      - "lms.service.description=Service description"
```

### Environment Variables
Each service should define:
- **Database connections**: PostgreSQL, Redis, etc.
- **Service URLs**: For inter-service communication
- **Configuration**: Service-specific settings
- **Monitoring**: Prometheus, Jaeger endpoints

### Networks
- **lms-internal**: For service-to-service communication
- **lms-network**: Only for services that need external access (like API Gateway)

### Health Checks
All services must implement:
- `/health` endpoint for basic health check
- Proper HTTP status codes (200 for healthy, 503 for unhealthy)
- Database connectivity checks

## 🏗️ Multi-Stage Dockerfile

Each service should use a multi-stage Dockerfile:

```dockerfile
# Development stage
FROM node:18-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3001
CMD ["npm", "run", "dev"]

# Build stage
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine AS production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
EXPOSE 3001
USER node
CMD ["npm", "start"]
```

## 🔍 Service Communication

### Internal Communication
Services communicate using container names as hostnames:
- `http://user-service:3001`
- `http://course-service:3002`
- `http://auth-service:3003`

### Event-Driven Communication
Services use Kafka for asynchronous communication:
- **Topics**: `user-events`, `course-events`, `notification-requests`
- **Patterns**: Event sourcing, CQRS, Saga orchestration

## 📊 Monitoring & Observability

Each service should implement:

### Metrics
```typescript
// Prometheus metrics
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status']
});
```

### Tracing
```typescript
// OpenTelemetry tracing
const tracer = trace.getTracer('service-name', '1.0.0');
```

### Logging
```typescript
// Structured logging
logger.info('User created', {
  userId: user.id,
  traceId: req.traceId,
  timestamp: new Date().toISOString()
});
```

## 🧪 Testing Strategy

### Unit Tests
```bash
npm test                    # Run unit tests
npm run test:coverage      # Run with coverage
npm run test:watch         # Watch mode
```

### Integration Tests
```bash
npm run test:integration   # Integration tests
npm run test:e2e          # End-to-end tests
```

### Service Tests
```bash
# Test service in isolation
docker-compose -f docker-compose.yml up -d postgresql redis-master
npm run test:service
```

## 🚀 Deployment

### Development
```bash
# From project root
docker-compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d
```

### Production
```bash
# From project root
docker-compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml up -d
```

## 📝 Adding New Services

1. **Create service directory:**
   ```bash
   mkdir services/new-service
   cd services/new-service
   ```

2. **Initialize service:**
   ```bash
   npm init -y
   # Add dependencies, create src/, etc.
   ```

3. **Create docker-compose.yml** (use existing services as template)

4. **Add to main infrastructure:**
   ```yaml
   # In infra/docker-compose.yml
   include:
     - ../services/new-service/docker-compose.yml
   ```

5. **Add development overrides:**
   ```yaml
   # In infra/docker-compose.dev.yml
   new-service:
     build:
       target: development
     volumes:
       - ../services/new-service/src:/app/src:ro
     command: npm run dev
   ```

This structure provides clear separation between business logic (services) and infrastructure (infra), making the codebase more maintainable and allowing teams to work independently on different services.
