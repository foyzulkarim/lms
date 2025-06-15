import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import { env } from '@/config/environment';
import { logger } from './logger';

// Enable default metrics collection
if (env.METRICS_ENABLED) {
  collectDefaultMetrics({
    prefix: 'analytics_service_',
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  });
}

// ============================================================================
// HTTP Metrics
// ============================================================================

export const httpRequestsTotal = new Counter({
  name: 'analytics_service_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const httpRequestDuration = new Histogram({
  name: 'analytics_service_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

export const httpRequestSize = new Histogram({
  name: 'analytics_service_http_request_size_bytes',
  help: 'Size of HTTP requests in bytes',
  labelNames: ['method', 'route'],
  buckets: [100, 1000, 10000, 100000, 1000000],
});

export const httpResponseSize = new Histogram({
  name: 'analytics_service_http_response_size_bytes',
  help: 'Size of HTTP responses in bytes',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [100, 1000, 10000, 100000, 1000000],
});

// ============================================================================
// Database Metrics
// ============================================================================

export const dbConnectionsActive = new Gauge({
  name: 'analytics_service_db_connections_active',
  help: 'Number of active database connections',
});

export const dbConnectionsIdle = new Gauge({
  name: 'analytics_service_db_connections_idle',
  help: 'Number of idle database connections',
});

export const dbQueriesTotal = new Counter({
  name: 'analytics_service_db_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'table', 'status'],
});

export const dbQueryDuration = new Histogram({
  name: 'analytics_service_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
});

export const dbTransactionsTotal = new Counter({
  name: 'analytics_service_db_transactions_total',
  help: 'Total number of database transactions',
  labelNames: ['status'],
});

export const dbTransactionDuration = new Histogram({
  name: 'analytics_service_db_transaction_duration_seconds',
  help: 'Duration of database transactions in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

// ============================================================================
// Cache Metrics
// ============================================================================

export const cacheOperationsTotal = new Counter({
  name: 'analytics_service_cache_operations_total',
  help: 'Total number of cache operations',
  labelNames: ['operation', 'status'],
});

export const cacheHitRate = new Gauge({
  name: 'analytics_service_cache_hit_rate',
  help: 'Cache hit rate as a percentage',
});

export const cacheMemoryUsage = new Gauge({
  name: 'analytics_service_cache_memory_usage_bytes',
  help: 'Cache memory usage in bytes',
});

export const cacheKeyCount = new Gauge({
  name: 'analytics_service_cache_keys_total',
  help: 'Total number of keys in cache',
});

// ============================================================================
// Event Processing Metrics
// ============================================================================

export const eventsProcessedTotal = new Counter({
  name: 'analytics_service_events_processed_total',
  help: 'Total number of events processed',
  labelNames: ['event_type', 'status'],
});

export const eventProcessingDuration = new Histogram({
  name: 'analytics_service_event_processing_duration_seconds',
  help: 'Duration of event processing in seconds',
  labelNames: ['event_type'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

export const eventQueueSize = new Gauge({
  name: 'analytics_service_event_queue_size',
  help: 'Number of events in processing queue',
  labelNames: ['queue_name'],
});

export const eventRetries = new Counter({
  name: 'analytics_service_event_retries_total',
  help: 'Total number of event processing retries',
  labelNames: ['event_type', 'reason'],
});

// ============================================================================
// Analytics Metrics
// ============================================================================

export const analyticsCalculationsTotal = new Counter({
  name: 'analytics_service_calculations_total',
  help: 'Total number of analytics calculations',
  labelNames: ['calculation_type', 'status'],
});

export const analyticsCalculationDuration = new Histogram({
  name: 'analytics_service_calculation_duration_seconds',
  help: 'Duration of analytics calculations in seconds',
  labelNames: ['calculation_type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
});

export const analyticsRecordsProcessed = new Counter({
  name: 'analytics_service_records_processed_total',
  help: 'Total number of records processed for analytics',
  labelNames: ['record_type', 'operation'],
});

export const analyticsAggregationLag = new Gauge({
  name: 'analytics_service_aggregation_lag_seconds',
  help: 'Lag between event occurrence and aggregation in seconds',
  labelNames: ['aggregation_type'],
});

// ============================================================================
// Report Generation Metrics
// ============================================================================

export const reportsGeneratedTotal = new Counter({
  name: 'analytics_service_reports_generated_total',
  help: 'Total number of reports generated',
  labelNames: ['report_type', 'status'],
});

export const reportGenerationDuration = new Histogram({
  name: 'analytics_service_report_generation_duration_seconds',
  help: 'Duration of report generation in seconds',
  labelNames: ['report_type'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
});

export const reportQueueSize = new Gauge({
  name: 'analytics_service_report_queue_size',
  help: 'Number of reports in generation queue',
});

export const reportFileSize = new Histogram({
  name: 'analytics_service_report_file_size_bytes',
  help: 'Size of generated report files in bytes',
  labelNames: ['report_type', 'format'],
  buckets: [1000, 10000, 100000, 1000000, 10000000, 100000000],
});

// ============================================================================
// Business Metrics
// ============================================================================

export const totalUsers = new Gauge({
  name: 'analytics_service_total_users',
  help: 'Total number of users in the system',
});

export const activeUsers = new Gauge({
  name: 'analytics_service_active_users',
  help: 'Number of active users',
  labelNames: ['timeframe'],
});

export const totalCourses = new Gauge({
  name: 'analytics_service_total_courses',
  help: 'Total number of courses',
});

export const totalEnrollments = new Gauge({
  name: 'analytics_service_total_enrollments',
  help: 'Total number of course enrollments',
});

export const completionRate = new Gauge({
  name: 'analytics_service_completion_rate',
  help: 'Overall course completion rate as a percentage',
});

export const averageScore = new Gauge({
  name: 'analytics_service_average_score',
  help: 'Average assessment score',
  labelNames: ['course_id', 'assessment_id'],
});

export const learningHours = new Gauge({
  name: 'analytics_service_learning_hours_total',
  help: 'Total learning hours across all users',
});

// ============================================================================
// System Health Metrics
// ============================================================================

export const healthCheckStatus = new Gauge({
  name: 'analytics_service_health_check_status',
  help: 'Health check status (1 = healthy, 0 = unhealthy)',
  labelNames: ['component'],
});

export const healthCheckDuration = new Histogram({
  name: 'analytics_service_health_check_duration_seconds',
  help: 'Duration of health checks in seconds',
  labelNames: ['component'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

// ============================================================================
// Utility Functions
// ============================================================================

export const recordHttpRequest = (
  method: string,
  route: string,
  statusCode: number,
  duration: number,
  requestSize?: number,
  responseSize?: number
) => {
  if (!env.METRICS_ENABLED) return;

  httpRequestsTotal.inc({ method, route, status_code: statusCode.toString() });
  httpRequestDuration.observe({ method, route, status_code: statusCode.toString() }, duration / 1000);
  
  if (requestSize) {
    httpRequestSize.observe({ method, route }, requestSize);
  }
  
  if (responseSize) {
    httpResponseSize.observe({ method, route, status_code: statusCode.toString() }, responseSize);
  }
};

export const recordDatabaseQuery = (
  operation: string,
  table: string,
  duration: number,
  success: boolean
) => {
  if (!env.METRICS_ENABLED) return;

  const status = success ? 'success' : 'error';
  dbQueriesTotal.inc({ operation, table, status });
  dbQueryDuration.observe({ operation, table }, duration / 1000);
};

export const recordDatabaseTransaction = (duration: number, success: boolean) => {
  if (!env.METRICS_ENABLED) return;

  const status = success ? 'success' : 'error';
  dbTransactionsTotal.inc({ status });
  dbTransactionDuration.observe(duration / 1000);
};

export const recordCacheOperation = (operation: string, success: boolean) => {
  if (!env.METRICS_ENABLED) return;

  const status = success ? 'hit' : 'miss';
  cacheOperationsTotal.inc({ operation, status });
};

export const updateCacheStats = (hitRate: number, memoryUsage: number, keyCount: number) => {
  if (!env.METRICS_ENABLED) return;

  cacheHitRate.set(hitRate);
  cacheMemoryUsage.set(memoryUsage);
  cacheKeyCount.set(keyCount);
};

export const recordEventProcessing = (
  eventType: string,
  duration: number,
  success: boolean,
  retryCount?: number
) => {
  if (!env.METRICS_ENABLED) return;

  const status = success ? 'success' : 'error';
  eventsProcessedTotal.inc({ event_type: eventType, status });
  eventProcessingDuration.observe({ event_type: eventType }, duration / 1000);
  
  if (retryCount && retryCount > 0) {
    eventRetries.inc({ event_type: eventType, reason: 'processing_error' }, retryCount);
  }
};

export const updateEventQueueSize = (queueName: string, size: number) => {
  if (!env.METRICS_ENABLED) return;
  eventQueueSize.set({ queue_name: queueName }, size);
};

export const recordAnalyticsCalculation = (
  calculationType: string,
  duration: number,
  recordCount: number,
  success: boolean
) => {
  if (!env.METRICS_ENABLED) return;

  const status = success ? 'success' : 'error';
  analyticsCalculationsTotal.inc({ calculation_type: calculationType, status });
  analyticsCalculationDuration.observe({ calculation_type: calculationType }, duration / 1000);
  analyticsRecordsProcessed.inc({ record_type: calculationType, operation: 'process' }, recordCount);
};

export const updateAggregationLag = (aggregationType: string, lagSeconds: number) => {
  if (!env.METRICS_ENABLED) return;
  analyticsAggregationLag.set({ aggregation_type: aggregationType }, lagSeconds);
};

export const recordReportGeneration = (
  reportType: string,
  duration: number,
  fileSize: number,
  format: string,
  success: boolean
) => {
  if (!env.METRICS_ENABLED) return;

  const status = success ? 'success' : 'error';
  reportsGeneratedTotal.inc({ report_type: reportType, status });
  reportGenerationDuration.observe({ report_type: reportType }, duration / 1000);
  reportFileSize.observe({ report_type: reportType, format }, fileSize);
};

export const updateReportQueueSize = (size: number) => {
  if (!env.METRICS_ENABLED) return;
  reportQueueSize.set(size);
};

export const updateBusinessMetrics = (metrics: {
  totalUsers?: number;
  activeUsers?: { timeframe: string; count: number }[];
  totalCourses?: number;
  totalEnrollments?: number;
  completionRate?: number;
  learningHours?: number;
}) => {
  if (!env.METRICS_ENABLED) return;

  if (metrics.totalUsers !== undefined) {
    totalUsers.set(metrics.totalUsers);
  }
  
  if (metrics.activeUsers) {
    metrics.activeUsers.forEach(({ timeframe, count }) => {
      activeUsers.set({ timeframe }, count);
    });
  }
  
  if (metrics.totalCourses !== undefined) {
    totalCourses.set(metrics.totalCourses);
  }
  
  if (metrics.totalEnrollments !== undefined) {
    totalEnrollments.set(metrics.totalEnrollments);
  }
  
  if (metrics.completionRate !== undefined) {
    completionRate.set(metrics.completionRate);
  }
  
  if (metrics.learningHours !== undefined) {
    learningHours.set(metrics.learningHours);
  }
};

export const recordHealthCheck = (component: string, duration: number, healthy: boolean) => {
  if (!env.METRICS_ENABLED) return;

  healthCheckStatus.set({ component }, healthy ? 1 : 0);
  healthCheckDuration.observe({ component }, duration / 1000);
};

// Metrics collection utility
export const collectMetrics = async (): Promise<string> => {
  try {
    return await register.metrics();
  } catch (error) {
    logger.error('Failed to collect metrics:', error);
    throw error;
  }
};

// Clear all metrics (useful for testing)
export const clearMetrics = () => {
  register.clear();
};

// Get metric registry
export const getRegistry = () => register;

export default {
  register,
  collectMetrics,
  clearMetrics,
  getRegistry,
  recordHttpRequest,
  recordDatabaseQuery,
  recordDatabaseTransaction,
  recordCacheOperation,
  updateCacheStats,
  recordEventProcessing,
  updateEventQueueSize,
  recordAnalyticsCalculation,
  updateAggregationLag,
  recordReportGeneration,
  updateReportQueueSize,
  updateBusinessMetrics,
  recordHealthCheck,
};
