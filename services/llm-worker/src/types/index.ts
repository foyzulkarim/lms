// Job Types
export interface QueueJobData {
  id: string;
  type: 'chat' | 'embeddings' | 'batch';
  userId: string;
  model: string;
  request: any;
  priority?: number;
  correlationId: string;
  createdAt: Date;
  timeout?: number;
  retryCount?: number;
  maxRetries?: number;
}

export interface QueueJobResult {
  success: boolean;
  response?: any;
  error?: string;
  processingTime: number;
  model: string;
  tokensUsed?: number;
  retryCount?: number;
  fallbackUsed?: boolean;
  cacheHit?: boolean;
}

// Ollama Types
export interface OllamaRequest {
  model: string;
  messages?: Array<{
    role: string;
    content: string;
  }>;
  prompt?: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
  };
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  message?: {
    role: string;
    content: string;
  };
  response?: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaEmbeddingResponse {
  embedding: number[];
}

// Model Management Types
export interface ModelInfo {
  name: string;
  isLoaded: boolean;
  loadedAt?: Date;
  lastUsed?: Date;
  memoryUsage?: number;
  requestCount: number;
  errorCount: number;
  avgResponseTime: number;
  isHealthy: boolean;
  lastHealthCheck?: Date;
}

export interface ModelLoadRequest {
  model: string;
  priority: 'low' | 'normal' | 'high';
  timeout?: number;
}

export interface ModelLoadResult {
  success: boolean;
  model: string;
  loadTime: number;
  error?: string;
}

// Circuit Breaker Types
export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
  successCount: number;
}

// Performance Monitoring Types
export interface PerformanceMetrics {
  requestsProcessed: number;
  requestsSuccessful: number;
  requestsFailed: number;
  avgProcessingTime: number;
  totalProcessingTime: number;
  memoryUsage: number;
  cpuUsage: number;
  gpuUsage?: number;
  queueDepth: number;
  modelsLoaded: number;
  cacheHitRate: number;
}

export interface SystemMetrics {
  timestamp: Date;
  workerId: string;
  cpu: {
    usage: number;
    load: number[];
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  gpu?: {
    usage: number;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
  };
  network: {
    rx: number;
    tx: number;
  };
}

// Error Types
export interface ProcessingError {
  type: 'validation' | 'model' | 'timeout' | 'memory' | 'network' | 'unknown';
  message: string;
  code?: string;
  retryable: boolean;
  fallbackAvailable: boolean;
  context?: Record<string, any>;
}

// Batch Processing Types
export interface BatchRequest {
  id: string;
  requests: QueueJobData[];
  batchSize: number;
  timeout: number;
  priority: number;
}

export interface BatchResult {
  id: string;
  results: QueueJobResult[];
  processingTime: number;
  successCount: number;
  failureCount: number;
}

// Health Check Types
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services: {
    ollama: ServiceHealth;
    redis: ServiceHealth;
    database: ServiceHealth;
    queue: ServiceHealth;
  };
  metrics: {
    uptime: number;
    requestsProcessed: number;
    errorRate: number;
    avgResponseTime: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  lastCheck: Date;
  error?: string;
}

// Configuration Types
export interface WorkerConfig {
  id: string;
  concurrency: number;
  batchSize: number;
  timeout: number;
  queues: string[];
  models: string[];
  fallbackEnabled: boolean;
  circuitBreakerEnabled: boolean;
}

// Event Types
export interface WorkerEvent {
  type: string;
  workerId: string;
  timestamp: Date;
  data: Record<string, any>;
}

export interface JobEvent extends WorkerEvent {
  jobId: string;
  jobType: string;
  userId: string;
  model: string;
}

export interface ModelEvent extends WorkerEvent {
  model: string;
  action: 'load' | 'unload' | 'error' | 'health_check';
}

export interface SystemEvent extends WorkerEvent {
  level: 'info' | 'warn' | 'error' | 'critical';
  component: string;
}

// Streaming Types
export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
}

export interface StreamHandler {
  onChunk: (chunk: StreamChunk) => void;
  onComplete: (result: QueueJobResult) => void;
  onError: (error: ProcessingError) => void;
}

// Fallback Strategy Types
export interface FallbackStrategy {
  name: string;
  enabled: boolean;
  models: string[];
  maxAttempts: number;
  backoffMultiplier: number;
  conditions: {
    errorTypes: string[];
    maxResponseTime?: number;
    minSuccessRate?: number;
  };
}

export interface FallbackResult {
  success: boolean;
  originalModel: string;
  fallbackModel?: string;
  attempts: number;
  totalTime: number;
  error?: string;
}

// Cache Types
export interface CacheEntry {
  key: string;
  value: any;
  createdAt: Date;
  expiresAt: Date;
  accessCount: number;
  lastAccessed: Date;
  size: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  memoryUsage: number;
  evictions: number;
}

// Resource Management Types
export interface ResourceLimits {
  maxMemory: number;
  maxCpu: number;
  maxGpuMemory?: number;
  maxConcurrentRequests: number;
  maxQueueSize: number;
}

export interface ResourceUsage {
  memory: number;
  cpu: number;
  gpuMemory?: number;
  concurrentRequests: number;
  queueSize: number;
  timestamp: Date;
}
