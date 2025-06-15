import { OllamaClient } from '../ollama/client';
import { ModelManager } from '../models/manager';
import { CircuitBreaker } from '../fallback/circuit-breaker';
import { config } from '../config';
import { logger, createJobLogger } from '../utils/logger';
import { QueueJobData, QueueJobResult, ProcessingError } from '../types';
import { EventEmitter } from 'eventemitter3';

export abstract class BaseProcessor extends EventEmitter {
  protected ollamaClient: OllamaClient;
  protected modelManager: ModelManager;
  protected circuitBreaker: CircuitBreaker;

  constructor(
    ollamaClient: OllamaClient,
    modelManager: ModelManager,
    circuitBreaker: CircuitBreaker
  ) {
    super();
    this.ollamaClient = ollamaClient;
    this.modelManager = modelManager;
    this.circuitBreaker = circuitBreaker;
  }

  abstract process(job: QueueJobData): Promise<QueueJobResult>;

  protected createJobLogger(jobId: string, jobType: string) {
    return createJobLogger(jobId, jobType);
  }

  protected async ensureModelLoaded(modelName: string): Promise<void> {
    if (!this.ollamaClient.validateModel(modelName)) {
      throw {
        type: 'validation',
        message: `Model '${modelName}' is not allowed`,
        retryable: false,
        fallbackAvailable: false,
      } as ProcessingError;
    }

    if (!this.modelManager.isModelLoaded(modelName)) {
      logger.info('Loading model for job', {
        model: modelName,
        workerId: config.worker.id,
      });

      try {
        await this.modelManager.loadModel(modelName, 'normal');
      } catch (error) {
        throw {
          type: 'model',
          message: `Failed to load model '${modelName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
          retryable: true,
          fallbackAvailable: true,
        } as ProcessingError;
      }
    }
  }

  protected async publishEvent(eventType: string, data: any): Promise<void> {
    try {
      // This would integrate with Kafka or other event system
      this.emit('event', {
        type: eventType,
        workerId: config.worker.id,
        timestamp: new Date(),
        data,
      });

      logger.debug('Event published', {
        eventType,
        workerId: config.worker.id,
        data,
      });
    } catch (error) {
      logger.error('Failed to publish event', {
        eventType,
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
    }
  }

  protected validateJobData(job: QueueJobData): void {
    if (!job.id) {
      throw {
        type: 'validation',
        message: 'Job ID is required',
        retryable: false,
        fallbackAvailable: false,
      } as ProcessingError;
    }

    if (!job.userId) {
      throw {
        type: 'validation',
        message: 'User ID is required',
        retryable: false,
        fallbackAvailable: false,
      } as ProcessingError;
    }

    if (!job.model) {
      throw {
        type: 'validation',
        message: 'Model is required',
        retryable: false,
        fallbackAvailable: false,
      } as ProcessingError;
    }

    if (!job.request) {
      throw {
        type: 'validation',
        message: 'Request data is required',
        retryable: false,
        fallbackAvailable: false,
      } as ProcessingError;
    }

    if (!job.correlationId) {
      throw {
        type: 'validation',
        message: 'Correlation ID is required',
        retryable: false,
        fallbackAvailable: false,
      } as ProcessingError;
    }
  }

  protected handleProcessingError(error: any, job: QueueJobData): ProcessingError {
    if (error.type && error.message && error.retryable !== undefined) {
      // Already a ProcessingError
      return error as ProcessingError;
    }

    // Transform generic errors
    if (error.code === 'ETIMEDOUT') {
      return {
        type: 'timeout',
        message: 'Request timed out',
        retryable: true,
        fallbackAvailable: true,
        context: { jobId: job.id, model: job.model },
      };
    }

    if (error.code === 'ECONNREFUSED') {
      return {
        type: 'network',
        message: 'Connection refused',
        retryable: true,
        fallbackAvailable: false,
        context: { jobId: job.id, model: job.model },
      };
    }

    if (error.message?.includes('memory') || error.message?.includes('Memory')) {
      return {
        type: 'memory',
        message: 'Insufficient memory',
        retryable: true,
        fallbackAvailable: true,
        context: { jobId: job.id, model: job.model },
      };
    }

    // Default unknown error
    return {
      type: 'unknown',
      message: error.message || 'Unknown processing error',
      retryable: false,
      fallbackAvailable: true,
      context: { jobId: job.id, model: job.model },
    };
  }

  protected shouldRetry(error: ProcessingError, attemptCount: number): boolean {
    if (!error.retryable) {
      return false;
    }

    if (attemptCount >= config.errors.retryAttempts) {
      return false;
    }

    // Don't retry validation errors
    if (error.type === 'validation') {
      return false;
    }

    return true;
  }

  protected calculateRetryDelay(attemptCount: number): number {
    // Exponential backoff with jitter
    const baseDelay = config.errors.retryDelay;
    const exponentialDelay = baseDelay * Math.pow(2, attemptCount - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    
    return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
  }

  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected estimateTokens(text: string): number {
    // Simple token estimation (roughly 4 characters per token)
    return Math.ceil(text.length / 4);
  }

  protected validateTimeout(job: QueueJobData): void {
    const now = Date.now();
    const jobAge = now - job.createdAt.getTime();
    const timeout = job.timeout || config.worker.timeout;

    if (jobAge > timeout) {
      throw {
        type: 'timeout',
        message: `Job expired (age: ${jobAge}ms, timeout: ${timeout}ms)`,
        retryable: false,
        fallbackAvailable: false,
        context: { jobId: job.id, jobAge, timeout },
      } as ProcessingError;
    }
  }

  protected async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string = 'Operation timed out'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject({
          type: 'timeout',
          message: timeoutMessage,
          retryable: true,
          fallbackAvailable: true,
        } as ProcessingError);
      }, timeoutMs);

      operation()
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  protected logJobStart(job: QueueJobData): void {
    logger.info('Starting job processing', {
      jobId: job.id,
      jobType: job.type,
      userId: job.userId,
      model: job.model,
      correlationId: job.correlationId,
      workerId: config.worker.id,
      retryCount: job.retryCount || 0,
    });
  }

  protected logJobComplete(job: QueueJobData, result: QueueJobResult): void {
    logger.info('Job processing completed', {
      jobId: job.id,
      jobType: job.type,
      userId: job.userId,
      model: result.model,
      success: result.success,
      processingTime: result.processingTime,
      tokensUsed: result.tokensUsed,
      correlationId: job.correlationId,
      workerId: config.worker.id,
      retryCount: result.retryCount || 0,
      fallbackUsed: result.fallbackUsed || false,
    });
  }

  protected logJobError(job: QueueJobData, error: ProcessingError): void {
    logger.error('Job processing failed', {
      jobId: job.id,
      jobType: job.type,
      userId: job.userId,
      model: job.model,
      error: error.message,
      errorType: error.type,
      retryable: error.retryable,
      fallbackAvailable: error.fallbackAvailable,
      correlationId: job.correlationId,
      workerId: config.worker.id,
      retryCount: job.retryCount || 0,
      context: error.context,
    });
  }

  // Health check for processor
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    try {
      const ollamaHealthy = await this.ollamaClient.healthCheck();
      const circuitBreakerStatus = this.circuitBreaker.getHealthStatus();
      const modelStats = this.modelManager.getAllLoadedModels();

      const unhealthyModels = modelStats.filter(model => !model.isHealthy);
      const openCircuits = circuitBreakerStatus.openCircuits;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      if (!ollamaHealthy) {
        status = 'unhealthy';
      } else if (unhealthyModels.length > 0 || openCircuits > 0) {
        status = 'degraded';
      }

      return {
        status,
        details: {
          ollama: ollamaHealthy,
          loadedModels: modelStats.length,
          unhealthyModels: unhealthyModels.length,
          circuitBreakers: {
            total: circuitBreakerStatus.totalCircuits,
            open: circuitBreakerStatus.openCircuits,
            halfOpen: circuitBreakerStatus.halfOpenCircuits,
            closed: circuitBreakerStatus.closedCircuits,
          },
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}
