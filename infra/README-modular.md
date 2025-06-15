# Modular Docker Compose Infrastructure

This directory contains a modular Docker Compose infrastructure setup that organizes services into logical groups and directories.

## 📁 Directory Structure

```
infra/
├── docker-compose.yml              # Main orchestration file (uses includes)
├── docker-compose.dev.yml          # Development overrides
├── docker-compose.prod.yml         # Production overrides
│
├── networks/
│   └── networks.yml                # Network definitions
│
├── volumes/
│   └── volumes.yml                 # Volume definitions
│
├── databases/                      # Database services
│   ├── postgresql/
│   │   ├── docker-compose.yml
│   │   ├── postgresql.conf
│   │   └── init.sql
│   ├── redis/
│   │   ├── docker-compose.yml
│   │   ├── redis.conf
│   │   └── redis-replica.conf
│   ├── elasticsearch/
│   │   ├── docker-compose.yml
│   │   ├── elasticsearch.yml
│   │   └── mappings/
│   ├── clickhouse/
│   │   ├── docker-compose.yml
│   │   ├── config.xml
│   │   ├── users.xml
│   │   └── init.sql
│   └── mongodb/
│       ├── docker-compose.yml
│       ├── mongod.conf
│       └── init.js
│
├── messaging/                      # Message streaming services
│   ├── kafka/
│   │   ├── docker-compose.yml
│   │   └── server.properties
│   └── zookeeper/
│       ├── docker-compose.yml
│       └── zoo.cfg
│
├── observability/                  # Monitoring and tracing
│   ├── prometheus/
│   │   ├── docker-compose.yml
│   │   ├── prometheus.yml
│   │   ├── rules/
│   │   └── targets/
│   ├── grafana/
│   │   ├── docker-compose.yml
│   │   ├── grafana.ini
│   │   ├── provisioning/
│   │   └── dashboards/
│   └── jaeger/
│       ├── docker-compose.yml
│       └── jaeger.yml
│
├── storage/                        # Storage services
│   └── minio/
│       ├── docker-compose.yml
│       └── config/
│
├── llm/                           # LLM services
│   └── ollama/
│       ├── docker-compose.yml
│       ├── models/
│       └── config/
│
├── services/                      # Application services
│   ├── api-gateway/
│   │   └── docker-compose.yml
│   ├── auth-service/
│   │   └── docker-compose.yml
│   ├── user-service/
│   │   └── docker-compose.yml
│   └── ... (other services)
│
├── nginx/                         # Load balancer
│   ├── docker-compose.yml
│   ├── nginx.conf
│   ├── conf.d/
│   └── ssl/
│
└── backup/                        # Backup services
    ├── docker-compose.yml
    └── scripts/
```

## 🚀 Usage

### Basic Commands

```bash
# Start all services
docker-compose up -d

# Start specific service group
docker-compose up -d postgresql redis-master

# Start with development overrides
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Start with production overrides
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# View logs for specific service
docker-compose logs -f postgresql

# Scale specific service
docker-compose up -d --scale api-gateway=3
```

### Service Management

```bash
# Restart database services
docker-compose restart postgresql redis-master mongodb

# Stop observability stack
docker-compose stop prometheus grafana jaeger

# Update specific service
docker-compose pull elasticsearch
docker-compose up -d elasticsearch
```

## 🔧 Configuration Management

### Environment Variables
All services use the same `.env` file in the root `infra/` directory. Service-specific variables are prefixed appropriately.

### Service Dependencies
Dependencies are managed through Docker Compose `depends_on` directives within each service's compose file.

### Network Isolation
- `lms-network`: Public network for external access
- `lms-internal`: Internal network for service-to-service communication

## 📊 Benefits of Modular Structure

### 1. **Organization**
- Services are logically grouped by function
- Easy to locate and modify specific service configurations
- Clear separation of concerns

### 2. **Maintainability**
- Individual service configurations can be updated independently
- Easier to troubleshoot service-specific issues
- Simplified configuration management

### 3. **Scalability**
- Easy to add new services by creating new modules
- Service groups can be managed independently
- Selective deployment of service groups

### 4. **Development Workflow**
- Developers can work on specific service groups
- Faster iteration on individual components
- Reduced complexity for local development

### 5. **Production Management**
- Granular control over service deployment
- Better resource management per service group
- Easier rollback of specific components

## 🛠️ Adding New Services

To add a new service, follow this pattern:

1. **Create service directory:**
   ```bash
   mkdir -p infra/services/new-service
   ```

2. **Create docker-compose.yml:**
   ```yaml
   # infra/services/new-service/docker-compose.yml
   version: '3.8'
   
   services:
     new-service:
       image: lms/new-service:latest
       container_name: lms-new-service
       environment:
         - NODE_ENV=${NODE_ENV:-production}
         - PORT=3010
       networks:
         - lms-internal
       labels:
         - "lms.service.type=application"
         - "lms.service.name=new-service"
   ```

3. **Add to main compose file:**
   ```yaml
   # infra/docker-compose.yml
   include:
     # ... existing includes
     - ./services/new-service/docker-compose.yml
   ```

## 🔍 Service Discovery

Services can communicate using their container names as hostnames:
- `postgresql:5432` - PostgreSQL database
- `redis-master:6379` - Redis master
- `elasticsearch:9200` - Elasticsearch
- `kafka-1:9092` - Kafka broker 1

## 📋 Health Checks

All services include health checks that can be monitored:

```bash
# Check health of all services
docker-compose ps

# Check specific service health
docker-compose exec postgresql pg_isready -U lms_user
docker-compose exec redis-master redis-cli ping
```

## 🔒 Security Considerations

- Internal services are isolated on `lms-internal` network
- Only NGINX exposes ports to the host
- Service-to-service communication uses internal DNS
- Secrets are managed through environment variables

## 📈 Monitoring Integration

Each service includes labels for monitoring:
- `lms.service.type` - Service category
- `lms.service.name` - Service identifier
- `lms.service.description` - Human-readable description

These labels are used by Prometheus for service discovery and Grafana for dashboard organization.

## 🚨 Troubleshooting

### Common Issues

1. **Service won't start:**
   ```bash
   # Check service logs
   docker-compose logs service-name
   
   # Check dependencies
   docker-compose ps
   ```

2. **Network connectivity:**
   ```bash
   # Test service connectivity
   docker-compose exec api-gateway ping postgresql
   ```

3. **Volume issues:**
   ```bash
   # Check volume mounts
   docker volume ls | grep lms
   docker volume inspect lms_postgres_data
   ```

### Service-Specific Debugging

Each service directory contains configuration files that can be modified for debugging:
- Database configurations for performance tuning
- Logging configurations for detailed debugging
- Service-specific environment variables

This modular approach provides better organization, maintainability, and scalability while maintaining the simplicity of Docker Compose orchestration.
## 🔗 **Service Integration**

### **Business Logic Services**
Application services are located in the `../services/` directory and included in the main compose file:

```yaml
# infra/docker-compose.yml
include:
  # Infrastructure components
  - ./databases/postgresql/docker-compose.yml
  - ./messaging/kafka/docker-compose.yml
  # ...
  
  # Application services (from actual service directories)
  - ../services/api-gateway/docker-compose.yml
  - ../services/auth-service/docker-compose.yml
  - ../services/user-service/docker-compose.yml
  # ...
```

### **Service Structure**
Each service directory contains:
```
services/service-name/
├── src/                    # Source code
├── Dockerfile             # Multi-stage build
├── docker-compose.yml     # Service configuration
├── package.json           # Dependencies
└── README.md              # Service documentation
```

### **Development vs Production**
- **Development**: Services mount source code for hot reloading
- **Production**: Services use built images with resource limits
