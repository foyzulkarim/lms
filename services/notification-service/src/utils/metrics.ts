import { FastifyInstance } from 'fastify';
import promClient from 'prom-client';
import { config } from '@/config/env';

// Create metrics registry
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({
  register,
  prefix: 'notification_service_'
});

// Custom metrics
export const metrics = {
  notificationsSent: new promClient.Counter({
    name: 'notification_service_notifications_sent_total',
    help: 'Total number of notifications sent',
    labelNames: ['type', 'channel', 'status'],
    registers: [register]
  }),

  deliveryDuration: new promClient.Histogram({
    name: 'notification_service_delivery_duration_seconds',
    help: 'Notification delivery duration in seconds',
    labelNames: ['channel', 'status'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [register]
  }),

  templateRenderDuration: new promClient.Histogram({
    name: 'notification_service_template_render_duration_seconds',
    help: 'Template rendering duration in seconds',
    labelNames: ['template_id'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
    registers: [register]
  }),

  queueSize: new promClient.Gauge({
    name: 'notification_service_queue_size',
    help: 'Current notification queue size',
    labelNames: ['queue_type'],
    registers: [register]
  }),

  activeConnections: new promClient.Gauge({
    name: 'notification_service_active_connections',
    help: 'Number of active connections',
    registers: [register]
  }),

  httpRequests: new promClient.Counter({
    name: 'notification_service_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register]
  }),

  httpDuration: new promClient.Histogram({
    name: 'notification_service_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [register]
  }),

  emailDispatcherRequests: new promClient.Counter({
    name: 'notification_service_email_dispatcher_requests_total',
    help: 'Total requests to EMAIL-Dispatcher',
    labelNames: ['status'],
    registers: [register]
  }),

  pushNotificationsSent: new promClient.Counter({
    name: 'notification_service_push_notifications_sent_total',
    help: 'Total push notifications sent',
    labelNames: ['status'],
    registers: [register]
  }),

  templateCacheHits: new promClient.Counter({
    name: 'notification_service_template_cache_hits_total',
    help: 'Template cache hits',
    labelNames: ['hit_type'],
    registers: [register]
  }),

  rateLimitHits: new promClient.Counter({
    name: 'notification_service_rate_limit_hits_total',
    help: 'Rate limit hits',
    labelNames: ['type'],
    registers: [register]
  })
};

// Metrics plugin for Fastify
export async function metricsPlugin(fastify: FastifyInstance) {
  // Add request metrics middleware
  fastify.addHook('onRequest', async (request, reply) => {
    request.startTime = Date.now();
    metrics.activeConnections.inc();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const duration = (Date.now() - (request.startTime || Date.now())) / 1000;
    const route = request.routerPath || request.url;
    
    metrics.httpRequests.inc({
      method: request.method,
      route,
      status_code: reply.statusCode.toString()
    });

    metrics.httpDuration.observe(
      { method: request.method, route },
      duration
    );

    metrics.activeConnections.dec();
  });

  // Metrics endpoint
  fastify.get('/metrics', async (request, reply) => {
    reply.type('text/plain');
    return register.metrics();
  });

  // Health metrics endpoint
  fastify.get('/metrics/health', async (request, reply) => {
    const healthMetrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      version: process.version,
      platform: process.platform,
      arch: process.arch
    };

    return healthMetrics;
  });
}

// Utility functions for recording metrics
export const recordMetrics = {
  notificationSent: (type: string, channel: string, status: string) => {
    metrics.notificationsSent.inc({ type, channel, status });
  },

  deliveryCompleted: (channel: string, status: string, duration: number) => {
    metrics.deliveryDuration.observe({ channel, status }, duration);
  },

  templateRendered: (templateId: string, duration: number) => {
    metrics.templateRenderDuration.observe({ template_id: templateId }, duration);
  },

  queueSizeUpdated: (queueType: string, size: number) => {
    metrics.queueSize.set({ queue_type: queueType }, size);
  },

  emailDispatcherRequest: (status: string) => {
    metrics.emailDispatcherRequests.inc({ status });
  },

  pushNotificationSent: (status: string) => {
    metrics.pushNotificationsSent.inc({ status });
  },

  templateCacheHit: (hitType: 'hit' | 'miss') => {
    metrics.templateCacheHits.inc({ hit_type: hitType });
  },

  rateLimitHit: (type: string) => {
    metrics.rateLimitHits.inc({ type });
  }
};

export { register };
export default metrics;
