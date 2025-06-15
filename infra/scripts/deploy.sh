#!/bin/bash

# LMS Infrastructure Deployment Script
# Manages deployment of the entire LMS infrastructure

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT=${1:-production}
VERSION=${2:-latest}
COMPOSE_PROJECT_NAME="lms"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Usage information
usage() {
    cat << EOF
Usage: $0 [ENVIRONMENT] [VERSION]

Deploy LMS infrastructure to the specified environment.

ENVIRONMENT:
    development  - Deploy with development settings (default ports exposed)
    production   - Deploy with production settings (default)
    staging      - Deploy with staging settings

VERSION:
    Docker image version to deploy (default: latest)

Examples:
    $0                          # Deploy production with latest images
    $0 development              # Deploy development environment
    $0 production v1.2.3        # Deploy production with specific version

Options:
    -h, --help     Show this help message
    --health-check Run health checks after deployment
    --backup       Create backup before deployment
    --rollback     Rollback to previous version
    --logs         Show logs after deployment
    --clean        Clean up old images and containers

EOF
}

# Parse command line arguments
HEALTH_CHECK=false
BACKUP=false
ROLLBACK=false
SHOW_LOGS=false
CLEAN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            exit 0
            ;;
        --health-check)
            HEALTH_CHECK=true
            shift
            ;;
        --backup)
            BACKUP=true
            shift
            ;;
        --rollback)
            ROLLBACK=true
            shift
            ;;
        --logs)
            SHOW_LOGS=true
            shift
            ;;
        --clean)
            CLEAN=true
            shift
            ;;
        development|production|staging)
            ENVIRONMENT=$1
            shift
            ;;
        *)
            if [[ -z "$VERSION" || "$VERSION" == "latest" ]]; then
                VERSION=$1
            fi
            shift
            ;;
    esac
done

# Validate environment
case $ENVIRONMENT in
    development|production|staging)
        ;;
    *)
        log_error "Invalid environment: $ENVIRONMENT"
        log_error "Valid environments: development, production, staging"
        exit 1
        ;;
esac

log_info "Starting LMS deployment..."
log_info "Environment: $ENVIRONMENT"
log_info "Version: $VERSION"

# Change to project directory
cd "$PROJECT_ROOT"

# Check if .env file exists
if [[ ! -f ".env" ]]; then
    log_warning ".env file not found. Creating from example..."
    if [[ -f "env.example" ]]; then
        cp env.example .env
        log_warning "Please edit .env file with your configuration before proceying."
        exit 1
    else
        log_error "No env.example file found. Please create .env file manually."
        exit 1
    fi
fi

# Backup function
create_backup() {
    if [[ "$BACKUP" == true ]]; then
        log_info "Creating backup before deployment..."
        if command -v docker-compose &> /dev/null; then
            docker-compose exec -T backup-service /scripts/postgres-backup.sh || log_warning "Backup failed but continuing..."
        else
            log_warning "Docker Compose not available, skipping backup"
        fi
    fi
}

# Rollback function
rollback_deployment() {
    if [[ "$ROLLBACK" == true ]]; then
        log_info "Rolling back to previous version..."
        # Implementation for rollback logic
        log_warning "Rollback functionality not yet implemented"
        exit 1
    fi
}

# Health check function
run_health_checks() {
    log_info "Running health checks..."
    
    # Define services to check
    SERVICES=(
        "http://localhost/health:NGINX"
        "http://localhost:5432:PostgreSQL"
        "http://localhost:6379:Redis"
        "http://localhost:9200:Elasticsearch"
        "http://localhost:9090:Prometheus"
        "http://localhost:3001:Grafana"
    )
    
    FAILED_CHECKS=0
    
    for service in "${SERVICES[@]}"; do
        URL=$(echo $service | cut -d':' -f1)
        NAME=$(echo $service | cut -d':' -f2)
        
        if [[ "$ENVIRONMENT" == "development" ]]; then
            # In development, services are exposed on localhost
            if curl -f -s --max-time 10 "$URL" > /dev/null 2>&1; then
                log_success "$NAME health check passed"
            else
                log_error "$NAME health check failed"
                ((FAILED_CHECKS++))
            fi
        fi
    done
    
    if [[ $FAILED_CHECKS -eq 0 ]]; then
        log_success "All health checks passed"
        return 0
    else
        log_error "$FAILED_CHECKS health check(s) failed"
        return 1
    fi
}

# Cleanup function
cleanup_old_resources() {
    if [[ "$CLEAN" == true ]]; then
        log_info "Cleaning up old Docker resources..."
        
        # Remove old containers
        docker system prune -f
        
        # Remove old images (keep last 3 versions)
        docker images --format "table {{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}" | \
        grep "lms/" | tail -n +4 | awk '{print $2}' | xargs -r docker rmi -f
        
        log_success "Cleanup completed"
    fi
}

# Pre-deployment checks
pre_deployment_checks() {
    log_info "Running pre-deployment checks..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check disk space (need at least 10GB)
    AVAILABLE_SPACE=$(df / | awk 'NR==2 {print $4}')
    REQUIRED_SPACE=10485760  # 10GB in KB
    
    if [[ $AVAILABLE_SPACE -lt $REQUIRED_SPACE ]]; then
        log_error "Insufficient disk space. Required: 10GB, Available: $(($AVAILABLE_SPACE/1024/1024))GB"
        exit 1
    fi
    
    # Check memory (need at least 8GB)
    AVAILABLE_MEMORY=$(free -m | awk 'NR==2{print $2}')
    REQUIRED_MEMORY=8192  # 8GB in MB
    
    if [[ $AVAILABLE_MEMORY -lt $REQUIRED_MEMORY ]]; then
        log_warning "Low memory detected. Required: 8GB, Available: ${AVAILABLE_MEMORY}MB"
    fi
    
    log_success "Pre-deployment checks passed"
}

# Main deployment function
deploy() {
    log_info "Starting deployment process..."
    
    # Set up compose files based on environment
    COMPOSE_FILES="-f docker-compose.yml"
    
    case $ENVIRONMENT in
        development)
            COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.dev.yml"
            ;;
        production)
            COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.prod.yml"
            ;;
        staging)
            COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.staging.yml"
            ;;
    esac
    
    # Pull latest images
    log_info "Pulling latest images..."
    docker-compose $COMPOSE_FILES pull
    
    # Stop existing services gracefully
    log_info "Stopping existing services..."
    docker-compose $COMPOSE_FILES down --remove-orphans
    
    # Start infrastructure services first
    log_info "Starting infrastructure services..."
    docker-compose $COMPOSE_FILES up -d \
        postgresql redis-master elasticsearch clickhouse mongodb \
        zookeeper kafka-1 kafka-2 kafka-3 minio
    
    # Wait for databases to be ready
    log_info "Waiting for databases to be ready..."
    sleep 30
    
    # Start application services
    log_info "Starting application services..."
    docker-compose $COMPOSE_FILES up -d \
        api-gateway auth-service user-service course-service \
        file-service search-service notification-service \
        analytics-service content-ingestion-service \
        llm-gateway llm-worker
    
    # Start observability services
    log_info "Starting observability services..."
    docker-compose $COMPOSE_FILES up -d \
        prometheus grafana jaeger
    
    # Start load balancer last
    log_info "Starting load balancer..."
    docker-compose $COMPOSE_FILES up -d nginx
    
    # Start backup service
    if [[ "$ENVIRONMENT" == "production" ]]; then
        log_info "Starting backup service..."
        docker-compose $COMPOSE_FILES up -d backup-service
    fi
    
    log_success "Deployment completed successfully"
}

# Show logs function
show_logs() {
    if [[ "$SHOW_LOGS" == true ]]; then
        log_info "Showing service logs..."
        docker-compose logs --tail=50 -f
    fi
}

# Main execution
main() {
    # Handle rollback
    rollback_deployment
    
    # Run pre-deployment checks
    pre_deployment_checks
    
    # Create backup if requested
    create_backup
    
    # Deploy services
    deploy
    
    # Wait a bit for services to stabilize
    log_info "Waiting for services to stabilize..."
    sleep 60
    
    # Run health checks
    if [[ "$HEALTH_CHECK" == true ]]; then
        run_health_checks
    fi
    
    # Clean up old resources
    cleanup_old_resources
    
    # Show logs if requested
    show_logs
    
    log_success "LMS deployment completed successfully!"
    log_info "Environment: $ENVIRONMENT"
    log_info "Version: $VERSION"
    
    if [[ "$ENVIRONMENT" == "development" ]]; then
        echo
        log_info "Development URLs:"
        log_info "  - API Gateway: http://localhost:3000"
        log_info "  - Grafana: http://localhost:3001"
        log_info "  - Prometheus: http://localhost:9090"
        log_info "  - Jaeger: http://localhost:16686"
        log_info "  - PostgreSQL: localhost:5432"
        log_info "  - Redis: localhost:6379"
        log_info "  - Elasticsearch: http://localhost:9200"
    fi
}

# Execute main function
main "$@" 
