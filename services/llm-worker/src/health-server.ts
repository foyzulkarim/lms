import http from 'http';
import { config } from './config';
import { logger } from './utils/logger';

export class HealthServer {
  private server?: http.Server;
  private isRunning: boolean = false;

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(config.health.port, (error?: Error) => {
        if (error) {
          logger.error('Failed to start health server', {
            error: error.message,
            port: config.health.port,
            workerId: config.worker.id,
          });
          reject(error);
        } else {
          this.isRunning = true;
          logger.info('Health server started', {
            port: config.health.port,
            workerId: config.worker.id,
          });
          resolve();
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.isRunning = false;
        logger.info('Health server stopped', {
          workerId: config.worker.id,
        });
        resolve();
      });
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '';
    const method = req.method || 'GET';

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (method !== 'GET') {
      this.sendResponse(res, 405, { error: 'Method not allowed' });
      return;
    }

    switch (url) {
      case '/health':
      case '/':
        this.handleBasicHealth(res);
        break;
      case '/health/live':
        this.handleLiveness(res);
        break;
      case '/health/ready':
        this.handleReadiness(res);
        break;
      case '/metrics':
        this.handleMetrics(res);
        break;
      default:
        this.sendResponse(res, 404, { error: 'Not found' });
    }
  }

  private handleBasicHealth(res: http.ServerResponse): void {
    const response = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      workerId: config.worker.id,
      version: '1.0.0',
    };

    this.sendResponse(res, 200, response);
  }

  private handleLiveness(res: http.ServerResponse): void {
    // Liveness probe - just check if the process is running
    const response = {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      workerId: config.worker.id,
    };

    this.sendResponse(res, 200, response);
  }

  private handleReadiness(res: http.ServerResponse): void {
    // Readiness probe - check if the worker is ready to process jobs
    // This would need to be connected to the WorkerManager
    const response = {
      status: 'ready',
      timestamp: new Date().toISOString(),
      workerId: config.worker.id,
    };

    this.sendResponse(res, 200, response);
  }

  private handleMetrics(res: http.ServerResponse): void {
    // Basic metrics in Prometheus format
    const metrics = [
      `# HELP llm_worker_uptime_seconds Worker uptime in seconds`,
      `# TYPE llm_worker_uptime_seconds counter`,
      `llm_worker_uptime_seconds{worker_id="${config.worker.id}"} ${process.uptime()}`,
      '',
      `# HELP llm_worker_memory_usage_bytes Worker memory usage in bytes`,
      `# TYPE llm_worker_memory_usage_bytes gauge`,
      `llm_worker_memory_usage_bytes{worker_id="${config.worker.id}"} ${process.memoryUsage().heapUsed}`,
      '',
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain');
    this.sendResponse(res, 200, metrics, false);
  }

  private sendResponse(
    res: http.ServerResponse, 
    statusCode: number, 
    data: any, 
    isJson: boolean = true
  ): void {
    if (isJson) {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(statusCode);
      res.end(JSON.stringify(data, null, 2));
    } else {
      res.writeHead(statusCode);
      res.end(data);
    }
  }
}
