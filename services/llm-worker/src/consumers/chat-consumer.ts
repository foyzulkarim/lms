import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { OllamaClient } from '../ollama/client';
import { ModelManager } from '../models/manager';
import { CircuitBreaker } from '../fallback/circuit-breaker';
import { ChatProcessor } from '../processors/chat-processor';
import { config } from '../config';
import { logger } from '../utils/logger';
import { QueueJobData, QueueJobResult } from '../types';

export class ChatConsumer {
  private worker: Worker<QueueJobData, QueueJobResult>;
  private processor: ChatProcessor;
  private isRunning: boolean = false;

  constructor(
    redis: Redis,
    ollamaClient: OllamaClient,
    modelManager: ModelManager,
    circuitBreaker: CircuitBreaker
  ) {
    this.processor = new ChatProcessor(ollamaClient, modelManager, circuitBreaker);
    
    this.worker = new Worker<QueueJobData, QueueJobResult>(
      config.queue.chatName,
      async (job: Job<QueueJobData, QueueJobResult>) => {
        return await this.processJob(job);
      },
      {
        connection: redis,
        concurrency: config.worker.concurrency,
        removeOnComplete: config.queue.removeOnComplete,
        removeOnFail: config.queue.removeOnFail,
        settings: {
          stalledInterval: 30000,
          maxStalledCount: 1,
        },
      }
    );

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.worker.on('ready', () => {
      logger.info('Chat consumer ready', {
        workerId: config.worker.id,
        queueName: config.queue.chatName,
        concurrency: config.worker.concurrency,
      });
    });

    this.worker.on('active', (job: Job<QueueJobData, QueueJobResult>) => {
      logger.debug('Chat job started', {
        jobId: job.id,
        userId: job.data.userId,
        model: job.data.model,
        workerId: config.worker.id,
      });
    });

    this.worker.on('completed', (job: Job<QueueJobData, QueueJobResult>, result: QueueJobResult) => {
      logger.info('Chat job completed', {
        jobId: job.id,
        userId: job.data.userId,
        model: job.data.model,
        processingTime: result.processingTime,
        tokensUsed: result.tokensUsed,
        workerId: config.worker.id,
      });
    });

    this.worker.on('failed', (job: Job<QueueJobData, QueueJobResult> | undefined, error: Error) => {
      logger.error('Chat job failed', {
        jobId: job?.id,
        userId: job?.data.userId,
        model: job?.data.model,
        error: error.message,
        attempts: job?.attemptsMade,
        workerId: config.worker.id,
      });
    });

    this.worker.on('stalled', (jobId: string) => {
      logger.warn('Chat job stalled', {
        jobId,
        workerId: config.worker.id,
      });
    });

    this.worker.on('error', (error: Error) => {
      logger.error('Chat consumer error', {
        error: error.message,
        workerId: config.worker.id,
      });
    });

    // Forward processor events
    this.processor.on('event', (event) => {
      logger.debug('Processor event', {
        eventType: event.type,
        workerId: config.worker.id,
        data: event.data,
      });
    });
  }

  private async processJob(job: Job<QueueJobData, QueueJobResult>): Promise<QueueJobResult> {
    const startTime = Date.now();
    
    try {
      // Validate job data
      if (!job.data) {
        throw new Error('Job data is missing');
      }

      // Add retry count to job data
      job.data.retryCount = job.attemptsMade;

      // Process the job
      const result = await this.processor.process(job.data);
      
      // Add processing metadata
      result.retryCount = job.attemptsMade;
      
      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Job processing error', {
        jobId: job.id,
        userId: job.data?.userId,
        model: job.data?.model,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });

      // Return error result
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime,
        model: job.data?.model || 'unknown',
        retryCount: job.attemptsMade,
      };
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Chat consumer is already running', {
        workerId: config.worker.id,
      });
      return;
    }

    try {
      await this.worker.waitUntilReady();
      this.isRunning = true;
      
      logger.info('Chat consumer started', {
        workerId: config.worker.id,
        queueName: config.queue.chatName,
        concurrency: config.worker.concurrency,
      });
    } catch (error) {
      logger.error('Failed to start chat consumer', {
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      logger.info('Stopping chat consumer', {
        workerId: config.worker.id,
      });

      await this.worker.close();
      this.isRunning = false;
      
      logger.info('Chat consumer stopped', {
        workerId: config.worker.id,
      });
    } catch (error) {
      logger.error('Error stopping chat consumer', {
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
      throw error;
    }
  }

  async pause(): Promise<void> {
    try {
      await this.worker.pause();
      logger.info('Chat consumer paused', {
        workerId: config.worker.id,
      });
    } catch (error) {
      logger.error('Error pausing chat consumer', {
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
      throw error;
    }
  }

  async resume(): Promise<void> {
    try {
      await this.worker.resume();
      logger.info('Chat consumer resumed', {
        workerId: config.worker.id,
      });
    } catch (error) {
      logger.error('Error resuming chat consumer', {
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
      throw error;
    }
  }

  getStats(): {
    isRunning: boolean;
    isPaused: boolean;
    concurrency: number;
    queueName: string;
  } {
    return {
      isRunning: this.isRunning,
      isPaused: this.worker.isPaused(),
      concurrency: config.worker.concurrency,
      queueName: config.queue.chatName,
    };
  }

  async getJobCounts(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  }> {
    try {
      const queue = this.worker.opts.connection;
      // This would need to be implemented with proper queue stats
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0,
      };
    } catch (error) {
      logger.error('Error getting job counts', {
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
      throw error;
    }
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    try {
      const processorHealth = await this.processor.healthCheck();
      const workerStats = this.getStats();

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      if (!this.isRunning) {
        status = 'unhealthy';
      } else if (processorHealth.status !== 'healthy') {
        status = processorHealth.status;
      }

      return {
        status,
        details: {
          worker: workerStats,
          processor: processorHealth.details,
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
