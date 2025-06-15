# LLM Worker Service - Docker Compose Configuration

This directory contains the service-level Docker Compose configuration for the LLM Worker service, which provides background processing for LLM requests with Ollama integration.

## 🚀 Quick Start

### Development Mode
```bash
# Run with development overrides
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Or from the root directory
docker-compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up llm-worker
```

### Production Mode
```bash
# Run in production mode
docker-compose up

# Or from the root directory
docker-compose -f infra/docker-compose.yml up llm-worker
```

## 📋 Service Configuration

### Core Features
- **Background LLM Processing**: Consumes jobs from Redis queues
- **Ollama Integration**: Direct integration with Ollama for model execution
- **Dynamic Model Management**: Automatic model loading and unloading
- **Circuit Breaker Pattern**: Fault tolerance and resilience
- **Intelligent Fallbacks**: Alternative model routing on failures
- **System Monitoring**: Resource usage tracking and optimization

### Key Environment Variables

#### Worker Configuration
- `WORKER_ID`: Unique worker identifier (default: llm-worker-1)
- `WORKER_CONCURRENCY`: Number of concurrent jobs (default: 5)
- `WORKER_BATCH_SIZE`: Batch processing size (default: 10)
- `WORKER_TIMEOUT`: Job processing timeout (default: 300000ms)

#### Ollama Configuration
- `OLLAMA_BASE_URL`: Ollama server URL (default: http://ollama:11434)
- `OLLAMA_TIMEOUT`: Request timeout (default: 300000ms)
- `OLLAMA_MAX_RETRIES`: Maximum retry attempts (default: 3)

#### Model Configuration
- `ALLOWED_MODELS`: Comma-separated list of allowed models
- `MODEL_PRELOAD_ENABLED`: Enable model preloading (default: true)
- `MODEL_PRELOAD_LIST`: Models to preload on startup
- `MODEL_MEMORY_THRESHOLD`: Memory threshold for cleanup (default: 0.8)

#### Circuit Breaker Configuration
- `ENABLE_CIRCUIT_BREAKER`: Enable circuit breaker (default: true)
- `CIRCUIT_BREAKER_THRESHOLD`: Failure threshold (default: 5)
- `CIRCUIT_BREAKER_TIMEOUT`: Circuit open timeout (default: 60000ms)

## 🔧 Development vs Production

### Development Mode Features
- Hot reloading with source code mounting
- Debug logging enabled
- Exposed health check port (3008)
- Lower resource limits
- More lenient circuit breaker settings
- Enhanced performance monitoring

### Production Mode Features
- Optimized Docker image
- Resource limits and reservations
- Comprehensive health checks
- Production logging configuration
- Security hardening
- Automatic restart policies

## 📊 Health Monitoring

### Health Check Endpoints
- `GET /health` - Basic health status
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe
- `GET /metrics` - Prometheus metrics

### Key Metrics
- Request processing time and throughput
- Model loading and usage statistics
- System resource utilization (CPU, memory, GPU)
- Circuit breaker state and failure rates
- Queue depth and processing rates

## 🔗 Dependencies

### Required Services
- **Redis**: Queue management and caching
- **Ollama**: LLM model execution backend

### Optional Services
- **Kafka**: Event streaming (if enabled)
- **Prometheus**: Metrics collection
- **Jaeger**: Distributed tracing

## 📁 Volume Mounts

### Production Volumes
- `llm_worker_logs`: Service logs
- `ollama_models`: Shared model storage (read-only)
- `./config`: Configuration files (read-only)

### Development Volumes
- `./src`: Source code (hot reloading)
- `./logs`: Development logs
- `./config`: Configuration files

## 🚨 Troubleshooting

### Common Issues

1. **Ollama Connection Failed**
   ```bash
   # Check Ollama service status
   docker-compose logs ollama
   
   # Verify Ollama health
   curl http://localhost:11434/api/tags
   ```

2. **Model Loading Issues**
   ```bash
   # Check available models
   docker-compose exec llm-worker curl http://ollama:11434/api/tags
   
   # Check worker logs
   docker-compose logs llm-worker
   ```

3. **Memory Issues**
   ```bash
   # Check resource usage
   docker stats lms-llm-worker
   
   # Adjust memory threshold
   export MODEL_MEMORY_THRESHOLD=0.7
   ```

4. **Queue Processing Stuck**
   ```bash
   # Check Redis connection
   docker-compose exec redis-master redis-cli ping
   
   # Check queue status
   docker-compose exec redis-master redis-cli LLEN llm-chat
   ```

### Debug Mode
```bash
# Enable debug logging
export LOG_LEVEL=debug
export ENABLE_DEBUG_MODE=true
export PERFORMANCE_SAMPLE_RATE=1.0

# Start with debug configuration
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up llm-worker
```

## 🔒 Security Considerations

- Non-root user execution in containers
- Resource limits to prevent resource exhaustion
- Input validation and content filtering options
- Request timeout enforcement
- Circuit breaker protection against cascade failures

## 📈 Scaling

The LLM Worker service supports horizontal scaling:

```bash
# Scale to multiple worker instances
docker-compose up --scale llm-worker=3

# Or use the infrastructure-level scaling
docker-compose -f infra/docker-compose.yml up --scale llm-worker=3
```

Each worker instance will:
- Have a unique `WORKER_ID`
- Share the same Redis queues
- Share the same Ollama models
- Process jobs independently
- Report metrics separately

## 🔄 Integration

The LLM Worker integrates with:
- **LLM Gateway**: Receives jobs via Redis queues
- **Analytics Service**: Publishes processing metrics
- **Notification Service**: Sends error notifications
- **Content Ingestion**: Processes embedding requests

For more detailed information, see the [LLM Worker Service Technical Specification](../../docs/architecture/llm-worker-service-spec.md).
