export interface QueueJobData {
  id: string;
  type: 'chat' | 'embeddings';
  userId: string;
  model: string;
  request: any;
  priority?: number;
  correlationId: string;
  createdAt: Date;
  timeout?: number;
}

export interface QueueJobResult {
  success: boolean;
  response?: any;
  error?: string;
  processingTime: number;
  model: string;
  tokensUsed?: number;
}

export interface QueueOptions {
  concurrency: number;
  maxAttempts: number;
  delay: number;
  backoffType: 'fixed' | 'exponential';
  removeOnComplete: number;
  removeOnFail: number;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export enum JobPriority {
  LOW = 1,
  NORMAL = 5,
  HIGH = 10,
  CRITICAL = 20,
}

export enum JobStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELAYED = 'delayed',
  PAUSED = 'paused',
}
