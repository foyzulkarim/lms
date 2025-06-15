#!/bin/bash

# LMS Infrastructure Health Check Script
# Performs comprehensive health checks on all services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    ((PASSED_CHECKS++))
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
    ((WARNING_CHECKS++))
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
    ((FAILED_CHECKS++))
}

# Helper function to check HTTP endpoint
check_http() {
    local url=$1
    local service_name=$2
    local timeout=${3:-10}
    
    ((TOTAL_CHECKS++))
    
    if curl -f -s --max-time "$timeout" "$url" > /dev/null 2>&1; then
        log_success "$service_name is healthy"
        return 0
    else
        log_error "$service_name is not responding"
        return 1
    fi
}

# Helper function to check TCP port
check_tcp() {
    local host=$1
    local port=$2
    local service_name=$3
    local timeout=${4:-5}
    
    ((TOTAL_CHECKS++))
    
    if timeout "$timeout" bash -c "</dev/tcp/$host/$port" 2>/dev/null; then
        log_success "$service_name port $port is open"
        return 0
    else
        log_error "$service_name port $port is not accessible"
        return 1
    fi
}

# Helper function to check Docker container
check_container() {
    local container_name=$1
    local service_name=$2
    
    ((TOTAL_CHECKS++))
    
    if docker ps --filter "name=$container_name" --filter "status=running" --format "{{.Names}}" | grep -q "$container_name"; then
        log_success "$service_name container is running"
        return 0
    else
        log_error "$service_name container is not running"
        return 1
    fi
}

# Function to check database connectivity
check_database() {
    local db_type=$1
    local connection_string=$2
    local service_name=$3
    
    ((TOTAL_CHECKS++))
    
    case $db_type in
        postgresql)
            if docker exec lms-postgresql pg_isready -U lms_user -d lms_db > /dev/null 2>&1; then
                log_success "$service_name database is ready"
                return 0
            else
                log_error "$service_name database is not ready"
                return 1
            fi
            ;;
        redis)
            if docker exec lms-redis-master redis-cli ping > /dev/null 2>&1; then
                log_success "$service_name is responding to ping"
                return 0
            else
                log_error "$service_name is not responding to ping"
                return 1
            fi
            ;;
        elasticsearch)
            if curl -f -s "http://localhost:9200/_cluster/health" > /dev/null 2>&1; then
                local health_status=$(curl -s "http://localhost:9200/_cluster/health" | jq -r '.status' 2>/dev/null)
                case $health_status in
                    green)
                        log_success "$service_name cluster is healthy (green)"
                        return 0
                        ;;
                    yellow)
                        log_warning "$service_name cluster is functional but degraded (yellow)"
                        return 1
                        ;;
                    red)
                        log_error "$service_name cluster is unhealthy (red)"
                        return 1
                        ;;
                    *)
                        log_error "$service_name cluster status unknown"
                        return 1
                        ;;
                esac
            else
                log_error "$service_name is not accessible"
                return 1
            fi
            ;;
        *)
            log_error "Unknown database type: $db_type"
            return 1
            ;;
    esac
}

# Main health check function
run_health_checks() {
    log_info "Starting LMS Infrastructure Health Checks..."
    echo "================================================"
    
    # Check Docker daemon
    log_info "Checking Docker daemon..."
    if docker info > /dev/null 2>&1; then
        log_success "Docker daemon is running"
    else
        log_error "Docker daemon is not running"
    fi
    
    echo
    log_info "Checking Container Status..."
    echo "----------------------------"
    
    # Check all containers
    CONTAINERS=(
        "lms-nginx:NGINX Load Balancer"
        "lms-api-gateway:API Gateway"
        "lms-auth-service:Auth Service"
        "lms-user-service:User Service"
        "lms-course-service:Course Service"
        "lms-file-service:File Service"
        "lms-search-service:Search Service"
        "lms-notification-service:Notification Service"
        "lms-analytics-service:Analytics Service"
        "lms-content-ingestion-service:Content Ingestion"
        "lms-llm-gateway:LLM Gateway"
        "lms-llm-worker:LLM Worker"
        "lms-postgresql:PostgreSQL"
        "lms-redis-master:Redis Master"
        "lms-redis-replica-1:Redis Replica 1"
        "lms-redis-replica-2:Redis Replica 2"
        "lms-elasticsearch:Elasticsearch"
        "lms-clickhouse:ClickHouse"
        "lms-mongodb:MongoDB"
        "lms-kafka-1:Kafka Broker 1"
        "lms-kafka-2:Kafka Broker 2"
        "lms-kafka-3:Kafka Broker 3"
        "lms-zookeeper:Zookeeper"
        "lms-minio:MinIO"
        "lms-prometheus:Prometheus"
        "lms-grafana:Grafana"
        "lms-jaeger:Jaeger"
    )
    
    for container in "${CONTAINERS[@]}"; do
        container_name=$(echo $container | cut -d':' -f1)
        service_name=$(echo $container | cut -d':' -f2)
        check_container "$container_name" "$service_name"
    done
    
    echo
    log_info "Checking Database Connectivity..."
    echo "---------------------------------"
    
    # Check databases
    check_database "postgresql" "" "PostgreSQL"
    check_database "redis" "" "Redis"
    check_database "elasticsearch" "" "Elasticsearch"
    
    echo
    log_info "Checking HTTP Endpoints..."
    echo "--------------------------"
    
    # Check HTTP endpoints (only if ports are exposed)
    if netstat -ln 2>/dev/null | grep -q ":80 "; then
        check_http "http://localhost/health" "NGINX Health"
    fi
    
    if netstat -ln 2>/dev/null | grep -q ":3000 "; then
        check_http "http://localhost:3000/health" "API Gateway"
    fi
    
    if netstat -ln 2>/dev/null | grep -q ":3001 "; then
        check_http "http://localhost:3001/api/health" "Grafana"
    fi
    
    if netstat -ln 2>/dev/null | grep -q ":9090 "; then
        check_http "http://localhost:9090/-/healthy" "Prometheus"
    fi
    
    if netstat -ln 2>/dev/null | grep -q ":16686 "; then
        check_http "http://localhost:16686/" "Jaeger UI"
    fi
    
    if netstat -ln 2>/dev/null | grep -q ":9200 "; then
        check_http "http://localhost:9200/_cluster/health" "Elasticsearch API"
    fi
    
    echo
    log_info "Checking Service Dependencies..."
    echo "--------------------------------"
    
    # Check critical TCP ports
    TCP_CHECKS=(
        "localhost:5432:PostgreSQL"
        "localhost:6379:Redis"
        "localhost:9092:Kafka"
        "localhost:2181:Zookeeper"
    )
    
    for tcp_check in "${TCP_CHECKS[@]}"; do
        host=$(echo $tcp_check | cut -d':' -f1)
        port=$(echo $tcp_check | cut -d':' -f2)
        service=$(echo $tcp_check | cut -d':' -f3)
        
        if netstat -ln 2>/dev/null | grep -q ":$port "; then
            check_tcp "$host" "$port" "$service"
        fi
    done
    
    echo
    log_info "Checking Resource Usage..."
    echo "--------------------------"
    
    # Check disk space
    ((TOTAL_CHECKS++))
    DISK_USAGE=$(df / | awk 'NR==2 {print int($5)}')
    if [[ $DISK_USAGE -lt 80 ]]; then
        log_success "Disk usage is healthy ($DISK_USAGE%)"
    elif [[ $DISK_USAGE -lt 90 ]]; then
        log_warning "Disk usage is high ($DISK_USAGE%)"
    else
        log_error "Disk usage is critical ($DISK_USAGE%)"
    fi
    
    # Check memory usage
    ((TOTAL_CHECKS++))
    MEMORY_USAGE=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    if [[ $MEMORY_USAGE -lt 80 ]]; then
        log_success "Memory usage is healthy ($MEMORY_USAGE%)"
    elif [[ $MEMORY_USAGE -lt 90 ]]; then
        log_warning "Memory usage is high ($MEMORY_USAGE%)"
    else
        log_error "Memory usage is critical ($MEMORY_USAGE%)"
    fi
    
    # Check Docker stats
    ((TOTAL_CHECKS++))
    if docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" > /dev/null 2>&1; then
        log_success "Docker stats accessible"
    else
        log_error "Cannot access Docker stats"
    fi
    
    echo
    log_info "Health Check Summary"
    echo "==================="
    echo "Total Checks: $TOTAL_CHECKS"
    echo -e "Passed: ${GREEN}$PASSED_CHECKS${NC}"
    echo -e "Warnings: ${YELLOW}$WARNING_CHECKS${NC}"
    echo -e "Failed: ${RED}$FAILED_CHECKS${NC}"
    echo
    
    # Calculate success rate
    SUCCESS_RATE=$(( (PASSED_CHECKS * 100) / TOTAL_CHECKS ))
    
    if [[ $FAILED_CHECKS -eq 0 && $WARNING_CHECKS -eq 0 ]]; then
        log_success "All health checks passed! System is healthy."
        exit 0
    elif [[ $FAILED_CHECKS -eq 0 ]]; then
        log_warning "System is functional with warnings. Success rate: $SUCCESS_RATE%"
        exit 1
    elif [[ $SUCCESS_RATE -ge 70 ]]; then
        log_warning "System is partially functional. Success rate: $SUCCESS_RATE%"
        exit 2
    else
        log_error "System is unhealthy. Success rate: $SUCCESS_RATE%"
        exit 3
    fi
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    run_health_checks "$@"
fi 
