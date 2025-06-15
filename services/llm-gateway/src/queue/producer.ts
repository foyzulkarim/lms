import { Queue, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { config } from '../config';
import { QueueJobData, QueueJobResult, JobPriority } from './types';
import { ChatCompletionRequest, EmbeddingsRequest } from '../types/llm';

export class QueueProducer {
  private chatQueue: Queue<QueueJobData, QueueJobResult>;
  private embeddingsQueue: Queue<QueueJobData, QueueJobResult>;
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
    
    const queueOptions = {
      connection: redis,
      defaultJobOptions: {
        attempts: config.queue.maxAttempts,
        backoff: {
          type: config.queue.backoffType,
          delay: config.queue.delay,
        },
        removeOnComplete: config.queue.removeOnComplete,
        removeOnFail: config.queue.removeOnFail,
      },
    };

    this.chatQueue = new Queue('llm-chat', queueOptions);
    this.embeddingsQueue = new Queue('llm-embeddings', queueOptions);

    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Chat queue events
    this.chatQueue.on('completed', (job: Job<QueueJobData, QueueJobResult>) => {
      logger.info('Chat job completed', {
        jobId: job.id,
        userId: job.data.userId,
        model: job.data.model,
        processingTime: job.returnvalue?.processingTime,
      });
    });

    this.chatQueue.on('failed', (job: Job<QueueJobData, QueueJobResult> | undefined, err: Error) => {
      logger.error('Chat job failed', {
        jobId: job?.id,
        userId: job?.data.userId,
        model: job?.data.model,
        error: err.message,
        attempts: job?.attemptsMade,
      });
    });

    // Embeddings queue events
    this.embeddingsQueue.on('completed', (job: Job<QueueJobData, QueueJobResult>) => {
      logger.info('Embeddings job completed', {
        jobId: job.id,
        userId: job.data.userId,
        model: job.data.model,
        processingTime: job.returnvalue?.processingTime,
      });
    });

    this.embeddingsQueue.on('failed', (job: Job<QueueJobData, QueueJobResult> | undefined, err: Error) => {
      logger.error('Embeddings job failed', {
        jobId: job?.id,
        userId: job?.data.userId,
        model: job?.data.model,
        error: err.message,
        attempts: job?.attemptsMade,
      });
    });
  }

  async addChatJob(
    userId: string,
    request: ChatCompletionRequest,
    correlationId: string,
    priority: JobPriority = JobPriority.NORMAL
  ): Promise<string> {
    const jobId = uuidv4();
    const jobData: QueueJobData = {
      id: jobId,
      type: 'chat',
      userId,
      model: request.model,
      request,
      priority,
      correlationId,
      createdAt: new Date(),
      timeout: config.ollama.timeout,
    };

    const job = await this.chatQueue.add('process-chat', jobData, {
      jobId,
      priority,
      delay: 0,
    });

    logger.debug('Chat job added to queue', {
      jobId,
      userId,
      model: request.model,
      priority,
      correlationId,
    });

    return jobId;
  }

  async addEmbeddingsJob(
    userId: string,
    request: EmbeddingsRequest,
    correlationId: string,
    priority: JobPriority = JobPriority.NORMAL
  ): Promise<string> {
    const jobId = uuidv4();
    const jobData: QueueJobData = {
      id: jobId,
      type: 'embeddings',
      userId,
      model: request.model,
      request,
      priority,
      correlationId,
      createdAt: new Date(),
      timeout: config.ollama.timeout,
    };

    const job = await this.embeddingsQueue.add('process-embeddings', jobData, {
      jobId,
      priority,
      delay: 0,
    });

    logger.debug('Embeddings job added to queue', {
      jobId,
      userId,
      model: request.model,
      priority,
      correlationId,
    });

    return jobId;
  }

  async getJobStatus(jobId: string, type: 'chat' | 'embeddings'): Promise<any> {
    const queue = type === 'chat' ? this.chatQueue : this.embeddingsQueue;
    const job = await queue.getJob(jobId);
    
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      status: await job.getState(),
      progress: job.progress,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts,
    };
  }

  async waitForJobCompletion(
    jobId: string, 
    type: 'chat' | 'embeddings',
    timeout: number = config.ollama.timeout
  ): Promise<QueueJobResult> {
    const queue = type === 'chat' ? this.chatQueue : this.embeddingsQueue;
    const job = await queue.getJob(jobId);
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Job ${jobId} timed out after ${timeout}ms`));
      }, timeout);

      const checkJob = async () => {
        try {
          const currentJob = await queue.getJob(jobId);
          if (!currentJob) {
            clearTimeout(timeoutId);
            reject(new Error(`Job ${jobId} not found`));
            return;
          }

          const state = await currentJob.getState();
          
          if (state === 'completed') {
            clearTimeout(timeoutId);
            resolve(currentJob.returnvalue);
          } else if (state === 'failed') {
            clearTimeout(timeoutId);
            reject(new Error(currentJob.failedReason || 'Job failed'));
          } else {
            // Job is still processing, check again
            setTimeout(checkJob, 1000);
          }
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
        }
      };

      checkJob();
    });
  }

  async getQueueStats() {
    const [chatStats, embeddingsStats] = await Promise.all([
      this.chatQueue.getJobCounts(),
      this.embeddingsQueue.getJobCounts(),
    ]);

    return {
      chat: chatStats,
      embeddings: embeddingsStats,
      total: {
        waiting: chatStats.waiting + embeddingsStats.waiting,
        active: chatStats.active + embeddingsStats.active,
        completed: chatStats.completed + embeddingsStats.completed,
        failed: chatStats.failed + embeddingsStats.failed,
        delayed: chatStats.delayed + embeddingsStats.delayed,
        paused: chatStats.paused + embeddingsStats.paused,
      },
    };
  }

  async pauseQueues() {
    await Promise.all([
      this.chatQueue.pause(),
      this.embeddingsQueue.pause(),
    ]);
    logger.info('All queues paused');
  }

  async resumeQueues() {
    await Promise.all([
      this.chatQueue.resume(),
      this.embeddingsQueue.resume(),
    ]);
    logger.info('All queues resumed');
  }

  async clearQueues() {
    await Promise.all([
      this.chatQueue.obliterate({ force: true }),
      this.embeddingsQueue.obliterate({ force: true }),
    ]);
    logger.info('All queues cleared');
  }

  async close() {
    await Promise.all([
      this.chatQueue.close(),
      this.embeddingsQueue.close(),
    ]);
    logger.info('Queue producer closed');
  }
}
