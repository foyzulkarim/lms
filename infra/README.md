# LMS Infrastructure

This directory contains the complete infrastructure configuration for the Learning Management System (LMS) using Docker Compose.

## 📋 Overview

The LMS infrastructure consists of:
- **13 microservices** for application logic
- **5 database systems** for different data types
- **3 Kafka brokers** for event streaming
- **Observability stack** with Prometheus, Grafana, and Jaeger
- **Load balancer** with NGINX
- **Automated backup system**

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────────────────────────┐
│   NGINX         │    │            Application Services       │
│   Load Balancer │────┤  API Gateway, Auth, User, Course,    │
└─────────────────┘    │  File, Search, Notification, etc.   │
                       └──────────────────────────────────────┘
                                         │
                       ┌─────────────────────────────────────────┐
                       │               Data Layer                │
                       │  PostgreSQL, Redis, Elasticsearch,     │
                       │  ClickHouse, MongoDB                   │
                       └─────────────────────────────────────────┘
                                         │
                       ┌─────────────────────────────────────────┐
                       │          Message Streaming              │
                       │     Kafka Cluster + Zookeeper          │
                       └─────────────────────────────────────────┘
                                         │
                       ┌─────────────────────────────────────────┐
                       │           Observability                 │
                       │   Prometheus, Grafana, Jaeger          │
                       └─────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Docker 20.10+
- Docker Compose v2.0+
- At least 16GB RAM
- At least 50GB free disk space

### Environment Setup

1. **Copy environment configuration:**
   ```bash
   cp env.example .env
   ```

2. **Edit the .env file with your configuration:**
   ```bash
   nano .env
   ```

3. **Generate secure passwords for all services**

### Deployment

#### Development Environment
```bash
# Deploy with development settings (ports exposed)
./scripts/deploy.sh development

# Or using docker-compose directly
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

#### Production Environment
```bash
# Deploy with production settings
./scripts/deploy.sh production --backup --health-check

# Or using docker-compose directly
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## 🔧 Service Configuration

### Core Services

| Service | Port | Description |
|---------|------|-------------|
| NGINX | 80, 443 | Load balancer and reverse proxy |
| API Gateway | 3000 | Main application entry point |
| Auth Service | 3003 | Authentication and authorization |
| User Service | 3001 | User management |
| Course Service | 3002 | Course and curriculum management |
| File Service | 3004 | File storage and processing |
| Search Service | 3005 | Search functionality |
| Notification Service | 3006 | Notifications and messaging |
| Analytics Service | 3007 | Analytics and reporting |
| Content Ingestion | 3008 | Content processing pipeline |
| LLM Gateway | 3009 | LLM service coordination |
| LLM Worker | - | Background LLM processing |

### Infrastructure Services

| Service | Port | Description |
|---------|------|-------------|
| PostgreSQL | 5432 | Primary database |
| Redis Master | 6379 | Caching and sessions |
| Redis Replica 1 | - | Redis read replica |
| Redis Replica 2 | - | Redis read replica |
| Elasticsearch | 9200 | Search engine |
| ClickHouse | 8123 | Analytics database |
| MongoDB | 27017 | Document storage |
| Kafka 1-3 | 9092 | Event streaming brokers |
| Zookeeper | 2181 | Kafka coordination |
| MinIO | 9000 | Object storage |

### Observability Services

| Service | Port | Description |
|---------|------|-------------|
| Prometheus | 9090 | Metrics collection |
| Grafana | 3001 | Visualization and dashboards |
| Jaeger | 16686 | Distributed tracing |

## 📊 Monitoring & Observability

### Accessing Dashboards

In development mode, access the monitoring tools at:

- **Grafana:** http://localhost:3001 (admin/admin)
- **Prometheus:** http://localhost:9090
- **Jaeger:** http://localhost:16686

### Key Metrics

The system monitors:
- Application performance and errors
- Database performance and connectivity
- Resource usage (CPU, memory, disk)
- Business metrics (user registrations, course completions)
- Infrastructure health (container status, network connectivity)

### Alerts

Configured alerts for:
- Service downtime
- High error rates
- Resource exhaustion
- Database connectivity issues
- Performance degradation

## 💾 Backup & Recovery

### Automated Backups

The backup service runs automated backups:
- **PostgreSQL:** Daily at 2:00 AM
- **MongoDB:** Daily at 2:30 AM
- **Elasticsearch:** Daily at 3:00 AM
- **Redis:** Daily at 3:30 AM

### Manual Backup

```bash
# Trigger manual backup
docker-compose exec backup-service /scripts/postgres-backup.sh
```

### Restore from Backup

```bash
# Restore PostgreSQL from latest backup
docker-compose exec postgresql psql -U lms_user -d lms_db < /backups/postgres/latest_backup.sql
```

## 🔒 Security

### Network Security
- Services run on isolated internal networks
- Only necessary ports are exposed
- NGINX handles SSL termination

### Authentication
- JWT-based authentication
- API key protection for service-to-service communication
- Redis for session management

### Data Protection
- Encrypted environment variables
- Database credentials rotation
- Audit logging for all operations

## 🛠️ Maintenance

### Health Checks

```bash
# Run comprehensive health checks
./scripts/health-check.sh
```

### Scaling Services

```bash
# Scale API Gateway to 3 replicas
docker-compose up -d --scale api-gateway=3
```

### Log Management

```bash
# View logs for specific service
docker-compose logs -f api-gateway

# View all logs
docker-compose logs -f

# Clean up old logs
docker system prune -f
```

### Updates

```bash
# Update to new version
./scripts/deploy.sh production v1.2.3 --backup --health-check
```

## 🐛 Troubleshooting

### Common Issues

1. **Services won't start:**
   ```bash
   # Check container logs
   docker-compose logs service-name
   
   # Check system resources
   docker stats
   ```

2. **Database connection errors:**
   ```bash
   # Check database status
   docker-compose exec postgresql pg_isready -U lms_user
   docker-compose exec redis-master redis-cli ping
   ```

3. **High memory usage:**
   ```bash
   # Check memory usage per container
   docker stats --format "table {{.Container}}\t{{.MemUsage}}"
   ```

4. **Network connectivity issues:**
   ```bash
   # Check network configuration
   docker network ls
   docker network inspect lms_lms-network
   ```

### Recovery Procedures

1. **Service Recovery:**
   ```bash
   # Restart specific service
   docker-compose restart service-name
   
   # Rebuild and restart
   docker-compose up -d --force-recreate service-name
   ```

2. **Full System Recovery:**
   ```bash
   # Complete restart
   docker-compose down
   docker-compose up -d
   ```

## 📁 Directory Structure

```
infra/
├── backup/                    # Backup scripts and configurations
│   └── scripts/              # Backup automation scripts
├── nginx/                    # NGINX configuration
│   ├── nginx.conf           # Main NGINX config
│   ├── rate-limits.conf     # Rate limiting rules
│   └── ssl/                 # SSL certificates
├── prometheus/               # Prometheus configuration
│   ├── prometheus.yml       # Main config
│   └── rules/               # Alert rules
├── grafana/                 # Grafana configuration
│   ├── provisioning/        # Data sources and dashboards
│   └── dashboards/          # Dashboard definitions
├── postgres/                # PostgreSQL configuration
│   ├── postgresql.conf      # DB configuration
│   └── init.sql            # Database initialization
├── redis/                   # Redis configuration
│   ├── redis.conf          # Master configuration
│   └── redis-replica.conf  # Replica configuration
├── scripts/                 # Utility scripts
│   ├── deploy.sh           # Deployment automation
│   └── health-check.sh     # Health monitoring
├── docker-compose.yml       # Base compose file
├── docker-compose.dev.yml   # Development overrides
├── docker-compose.prod.yml  # Production overrides
├── env.example              # Environment variables template
└── README.md               # This file
```

## 🤝 Contributing

1. Make changes to configuration files
2. Test in development environment
3. Update documentation
4. Submit pull request

## 📞 Support

For infrastructure issues:
1. Check logs: `docker-compose logs`
2. Run health checks: `./scripts/health-check.sh`
3. Review monitoring dashboards
4. Check resource usage: `docker stats`

## 📄 License

This infrastructure configuration is part of the LMS project and follows the same license terms. 
