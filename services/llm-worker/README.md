# LLM Worker Service

The LLM Worker Service is a high-performance background processing service that consumes LLM requests from Redis queues, interfaces directly with Ollama, and processes AI model requests asynchronously with comprehensive fallback strategies, circuit breaker patterns, and intelligent model management.

## 🎯 **Overview**

This service handles the actual processing of LLM requests in the background, providing robust model management, fault tolerance, and system monitoring capabilities for the LMS platform's AI operations.

### **Key Features**

- **Asynchronous Processing**: BullMQ-based queue processing for chat completions and embeddings
- **Dynamic Model Management**: Automatic model loading, unloading, and lifecycle management
- **Circuit Breaker Patterns**: Fault tolerance with automatic recovery and fallback strategies
- **System Monitoring**: Comprehensive resource monitoring with alerts and optimization
- **Intelligent Fallback**: Alternative model routing when primary models fail
- **Performance Optimization**: Memory management and resource optimization
- **Scalable Architecture**: Horizontal scaling with multiple worker instances

## 🏗️ **Architecture**

```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│   LLM Gateway   │────│   Redis Queue        │────│   LLM Worker    │
│   (Producer)    │    │   (BullMQ)           │    │   (Consumer)    │
└─────────────────┘    └──────────────────────┘    └─────────────────┘
                                                            │
                    ┌───────────────────────────────────────┼───────────────────────────────────────┐
                    │                                       │                                       │
            ┌───────▼───────┐                   ┌──────────▼──────────┐                   ┌───────▼───────┐
            │   Ollama      │                   │   Model Manager     │                   │ Circuit       │
            │   Client      │                   │   (Dynamic Loading) │                   │ Breaker       │
            └───────────────┘                   └─────────────────────┘                   └───────────────┘
                    │                                       │                                       │
            ┌───────▼───────┐                   ┌──────────▼──────────┐                   ┌───────▼───────┐
            │   Ollama      │                   │   System Metrics    │                   │ Fallback      │
            │   Server      │                   │   (CPU/Memory/GPU)  │                   │ Strategies    │
            │ (Port 11434)  │                   └─────────────────────┘                   └───────────────┘
            └───────────────┘
```

### **Request Processing Pipeline**

```
Queue Job → Job Validation → Model Loading → Circuit Breaker Check → 
Ollama Request → Response Processing → Result Publishing → Metrics Update
```

## 🚀 **Getting Started**

### **Prerequisites**

- Docker 20.10+
- Docker Compose v2.0+
- Node.js 20+ (for development)
- Redis 7+
- Ollama (for LLM execution)

### **Environment Variables**

Copy the environment template and configure:

```bash
cp .env.example .env
```

Key configuration variables:

```bash
# Worker Configuration
WORKER_ID=llm-worker-1
WORKER_CONCURRENCY=5
WORKER_BATCH_SIZE=10
WORKER_TIMEOUT=300000

# Redis Configuration
REDIS_URL=redis://redis:6379/9
REDIS_PASSWORD=your-redis-password

# Ollama Configuration
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_TIMEOUT=300000
OLLAMA_MAX_RETRIES=3

# Model Configuration
ALLOWED_MODELS=llama2,codellama,mistral,phi
MODEL_PRELOAD_ENABLED=true
MODEL_PRELOAD_LIST=llama2,mistral

# Fallback Configuration
ENABLE_MODEL_FALLBACK=true
FALLBACK_MODELS=llama2,mistral,phi
ENABLE_CIRCUIT_BREAKER=true
```

### **Development Setup**

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development environment:**
   ```bash
   # Start infrastructure services
   docker-compose -f ../../infra/docker-compose.yml -f ../../infra/docker-compose.dev.yml up -d redis-master ollama kafka-1

   # Start the worker in development mode
   npm run dev
   ```

3. **Start additional services (optional):**
   ```bash
   # Model manager
   npm run manager:dev
   
   # System monitor
   npm run monitor:dev
   ```

### **Production Deployment**

```bash
# Deploy with Docker Compose
docker-compose -f ../../infra/docker-compose.yml -f ../../infra/docker-compose.prod.yml up -d llm-worker

# Or build and run locally
npm run build
npm start
```

## 📊 **Service Components**

### **Main Worker (Port 3008)**
- Queue job processing for chat completions and embeddings
- Direct Ollama integration with retry logic
- Circuit breaker implementation for fault tolerance
- Dynamic model loading and management
- System resource monitoring
- Health checks and metrics

### **Model Manager (Port 3009)**
- Automatic model downloading and updates
- Model usage tracking and analytics
- Unused model cleanup and optimization
- Model health monitoring
- Scheduled maintenance tasks

### **System Monitor (Port 3010)**
- Real-time system resource monitoring
- CPU, memory, GPU, disk, and network metrics
- Alert generation for resource thresholds
- Performance optimization recommendations
- System health reporting

## 🔌 **Health Check Endpoints**

### **Worker Health Checks**

#### **Basic Health Check**
```http
GET /health

Response: 200 OK
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 3600,
  "workerId": "llm-worker-1",
  "version": "1.0.0"
}
```

#### **Liveness Probe**
```http
GET /health/live

Response: 200 OK
{
  "status": "alive",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 3600,
  "workerId": "llm-worker-1"
}
```

#### **Readiness Probe**
```http
GET /health/ready

Response: 200 OK
{
  "status": "ready",
  "timestamp": "2024-01-15T10:30:00Z",
  "workerId": "llm-worker-1",
  "services": {
    "redis": "healthy",
    "ollama": "healthy",
    "queue": "healthy"
  }
}
```

### **Prometheus Metrics**

```http
GET /metrics

Response: 200 OK (text/plain)
# HELP llm_worker_uptime_seconds Worker uptime in seconds
# TYPE llm_worker_uptime_seconds counter
llm_worker_uptime_seconds{worker_id="llm-worker-1"} 3600

# HELP llm_worker_requests_total Total processed requests
# TYPE llm_worker_requests_total counter
llm_worker_requests_total{worker_id="llm-worker-1",model="llama2",status="success"} 150

# HELP llm_worker_request_duration_seconds Request processing duration
# TYPE llm_worker_request_duration_seconds histogram
llm_worker_request_duration_seconds_bucket{worker_id="llm-worker-1",model="llama2",le="5"} 120

# HELP llm_worker_models_loaded Number of loaded models
# TYPE llm_worker_models_loaded gauge
llm_worker_models_loaded{worker_id="llm-worker-1"} 3

# HELP llm_worker_memory_usage_bytes Worker memory usage
# TYPE llm_worker_memory_usage_bytes gauge
llm_worker_memory_usage_bytes{worker_id="llm-worker-1"} 536870912

# HELP llm_worker_circuit_breaker_state Circuit breaker state
# TYPE llm_worker_circuit_breaker_state gauge
llm_worker_circuit_breaker_state{worker_id="llm-worker-1",circuit="chat:llama2",state="closed"} 1
```

## 🔄 **Queue Processing**

### **Supported Job Types**

- **Chat Completions**: Process chat completion requests from LLM Gateway
- **Embeddings**: Generate text embeddings for semantic search
- **Batch Processing**: Handle multiple requests efficiently
- **Priority Jobs**: High-priority requests with expedited processing

### **Job Processing Flow**

1. **Job Pickup**: Worker picks up jobs from Redis queue
2. **Validation**: Validate job data and parameters
3. **Model Loading**: Ensure required model is loaded
4. **Circuit Breaker Check**: Verify service health
5. **Processing**: Execute request via Ollama
6. **Result Publishing**: Return results and update metrics
7. **Cleanup**: Clean up resources and update statistics

### **Error Handling**

- **Retry Logic**: Automatic retry with exponential backoff
- **Dead Letter Queue**: Failed jobs moved to dead letter queue
- **Fallback Models**: Alternative models when primary fails
- **Circuit Breaker**: Prevent cascade failures
- **Graceful Degradation**: Continue operation with reduced functionality

## 🧠 **Model Management**

### **Dynamic Model Loading**

- **On-Demand Loading**: Models loaded when first requested
- **Preloading**: Critical models loaded at startup
- **Memory Management**: Automatic unloading when memory threshold exceeded
- **Load Balancing**: Distribute model usage across workers

### **Model Health Monitoring**

- **Response Time Tracking**: Monitor model performance
- **Error Rate Monitoring**: Track model reliability
- **Usage Analytics**: Analyze model usage patterns
- **Health Scoring**: Composite health score for each model

### **Model Lifecycle**

```bash
# List available models
npm run models:list

# Preload models
npm run models:preload

# Cleanup unused models
npm run models:cleanup
```

## 🛡️ **Circuit Breaker & Fallback**

### **Circuit Breaker States**

- **Closed**: Normal operation, requests pass through
- **Open**: Service unavailable, requests fail fast
- **Half-Open**: Testing recovery, limited requests allowed

### **Fallback Strategies**

1. **Model Fallback**: Use alternative models when primary fails
2. **Parameter Adjustment**: Reduce complexity for retry attempts
3. **Timeout Fallback**: Shorter timeouts for fallback requests
4. **Cache Fallback**: Return cached responses when available

### **Circuit Breaker Management**

```bash
# Reset circuit breakers
npm run circuit:reset

# Check circuit breaker status
curl http://localhost:3008/metrics | grep circuit_breaker
```

## 📊 **System Monitoring**

### **Resource Monitoring**

- **CPU Usage**: Real-time CPU utilization tracking
- **Memory Usage**: Memory consumption and optimization
- **GPU Metrics**: GPU utilization and memory usage (if available)
- **Disk I/O**: Disk usage and performance metrics
- **Network**: Network bandwidth and latency monitoring

### **Performance Metrics**

- **Request Processing Time**: Average and percentile response times
- **Throughput**: Requests processed per minute
- **Queue Depth**: Current queue size and processing rate
- **Model Performance**: Per-model performance statistics
- **Error Rates**: Success/failure rates by model and operation

### **Alerting**

- **Resource Thresholds**: CPU, memory, disk usage alerts
- **Performance Degradation**: Response time and error rate alerts
- **Model Health**: Model availability and performance alerts
- **Queue Backlog**: Queue depth and processing delay alerts

## 🛠️ **Development**

### **Project Structure**

```
src/
├── main.ts                     # Application entry point
├── worker-manager.ts           # Main worker orchestration
├── health-server.ts            # Health check HTTP server
├── consumers/                  # Queue consumers
│   ├── chat-consumer.ts       # Chat completion consumer
│   ├── embeddings-consumer.ts # Embeddings consumer
│   └── batch-consumer.ts      # Batch processing consumer
├── processors/                 # Job processors
│   ├── base-processor.ts      # Base processor class
│   ├── chat-processor.ts      # Chat completion processor
│   └── embeddings-processor.ts # Embeddings processor
├── ollama/                     # Ollama integration
│   ├── client.ts              # Ollama HTTP client
│   └── types.ts               # Ollama type definitions
├── models/                     # Model management
│   ├── manager.ts             # Model lifecycle manager
│   └── health-checker.ts      # Model health monitoring
├── fallback/                   # Fallback and circuit breaker
│   ├── circuit-breaker.ts     # Circuit breaker implementation
│   └── fallback-strategy.ts   # Fallback logic
├── monitoring/                 # System monitoring
│   ├── system-monitor.ts      # System resource monitoring
│   └── metrics-collector.ts   # Metrics collection
├── utils/                      # Utility functions
│   ├── logger.ts              # Logging configuration
│   ├── config.ts              # Configuration management
│   └── validation.ts          # Input validation
└── types/                      # TypeScript type definitions
    ├── index.ts               # Main type definitions
    ├── queue.ts               # Queue-related types
    └── monitoring.ts          # Monitoring types
```

### **Management Scripts**

```bash
# Health check
npm run health:check

# Queue management
npm run queue:stats
npm run queue:clear

# Model management
npm run models:list
npm run models:preload
npm run models:cleanup

# Circuit breaker management
npm run circuit:reset
```

### **Testing**

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Run load tests
npm run test:load
```

### **Code Quality**

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Type checking
npm run typecheck

# Generate documentation
npm run docs:generate
```

## 🔧 **Configuration**

### **Worker Settings**

```bash
# Worker Configuration
WORKER_CONCURRENCY=5            # Concurrent job processing
WORKER_BATCH_SIZE=10            # Batch processing size
WORKER_TIMEOUT=300000           # Job timeout (5 minutes)
MAX_CONCURRENT_REQUESTS=10      # Max concurrent Ollama requests
```

### **Model Settings**

```bash
# Model Configuration
MODEL_PRELOAD_ENABLED=true      # Preload models at startup
MODEL_PRELOAD_LIST=llama2,mistral # Models to preload
MODEL_MEMORY_THRESHOLD=0.8      # Memory threshold for unloading
MODEL_UNLOAD_TIMEOUT=300000     # Unused model timeout
```

### **Performance Settings**

```bash
# Performance Configuration
ENABLE_BATCH_PROCESSING=true    # Enable batch processing
BATCH_TIMEOUT=5000              # Batch collection timeout
ENABLE_GPU_OPTIMIZATION=true    # Enable GPU optimization
MEMORY_CLEANUP_INTERVAL=60000   # Memory cleanup interval
```

### **Monitoring Settings**

```bash
# Monitoring Configuration
METRICS_ENABLED=true            # Enable metrics collection
PERFORMANCE_SAMPLE_RATE=0.1     # Performance sampling rate
CPU_ALERT_THRESHOLD=80          # CPU usage alert threshold
MEMORY_ALERT_THRESHOLD=85       # Memory usage alert threshold
```

## 🚨 **Troubleshooting**

### **Common Issues**

1. **Ollama connection errors:**
   ```bash
   # Check Ollama health
   curl http://localhost:11434/api/tags
   
   # Check worker connectivity
   docker-compose exec llm-worker curl -f http://ollama:11434/api/tags
   ```

2. **High memory usage:**
   ```bash
   # Check memory usage
   docker stats llm-worker
   
   # Check loaded models
   npm run models:list
   
   # Cleanup unused models
   npm run models:cleanup
   ```

3. **Queue processing stuck:**
   ```bash
   # Check queue status
   npm run queue:stats
   
   # Check Redis connectivity
   docker-compose exec llm-worker redis-cli -h redis-master ping
   ```

4. **Circuit breaker issues:**
   ```bash
   # Check circuit breaker status
   curl http://localhost:3008/metrics | grep circuit_breaker
   
   # Reset circuit breakers
   npm run circuit:reset
   ```

### **Performance Optimization**

1. **Increase worker concurrency for higher throughput**
2. **Tune model preloading based on usage patterns**
3. **Adjust memory thresholds for optimal model management**
4. **Enable GPU optimization if GPU is available**
5. **Monitor and adjust circuit breaker thresholds**

### **Scaling**

```bash
# Scale worker instances
docker-compose -f ../../infra/docker-compose.yml --profile scale up -d

# Monitor distributed processing
npm run queue:stats
```

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📞 **Support**

For issues and questions:
- Check the [troubleshooting guide](#-troubleshooting)
- Review service logs: `docker-compose logs llm-worker`
- Monitor health endpoints: `/health`
- Check metrics: `/metrics`
- Review queue statistics: `npm run queue:stats`
