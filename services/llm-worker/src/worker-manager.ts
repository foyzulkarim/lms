import Redis from 'ioredis';
import { OllamaClient } from './ollama/client';
import { ModelManager } from './models/manager';
import { CircuitBreaker } from './fallback/circuit-breaker';
import { ChatConsumer } from './consumers/chat-consumer';
import { config } from './config';
import { logger } from './utils/logger';
import { EventEmitter } from 'eventemitter3';

export class WorkerManager extends EventEmitter {
  private redis?: Redis;
  private ollamaClient?: OllamaClient;
  private modelManager?: ModelManager;
  private circuitBreaker?: CircuitBreaker;
  private chatConsumer?: ChatConsumer;
  private isInitialized: boolean = false;
  private isRunning: boolean = false;

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Worker manager already initialized', {
        workerId: config.worker.id,
      });
      return;
    }

    logger.info('Initializing Worker Manager', {
      workerId: config.worker.id,
      concurrency: config.worker.concurrency,
      ollamaUrl: config.ollama.baseUrl,
    });

    try {
      // Initialize Redis connection
      await this.initializeRedis();

      // Initialize Ollama client
      this.initializeOllamaClient();

      // Initialize circuit breaker
      this.initializeCircuitBreaker();

      // Initialize model manager
      await this.initializeModelManager();

      // Initialize consumers
      await this.initializeConsumers();

      this.isInitialized = true;
      
      logger.info('Worker Manager initialized successfully', {
        workerId: config.worker.id,
      });

    } catch (error) {
      logger.error('Failed to initialize Worker Manager', {
        workerId: config.worker.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async initializeRedis(): Promise<void> {
    logger.info('Initializing Redis connection', {
      workerId: config.worker.id,
      host: config.redis.host,
      port: config.redis.port,
    });

    const redisConfig = config.redis.url 
      ? { url: config.redis.url }
      : {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db,
        };

    this.redis = new Redis({
      ...redisConfig,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.redis.on('connect', () => {
      logger.info('Redis connected', { workerId: config.worker.id });
    });

    this.redis.on('error', (error) => {
      logger.error('Redis error', { 
        workerId: config.worker.id,
        error: error.message 
      });
    });

    // Test connection
    await this.redis.ping();
    logger.info('Redis connection established', {
      workerId: config.worker.id,
    });
  }

  private initializeOllamaClient(): void {
    logger.info('Initializing Ollama client', {
      workerId: config.worker.id,
      baseUrl: config.ollama.baseUrl,
    });

    this.ollamaClient = new OllamaClient();
  }

  private initializeCircuitBreaker(): void {
    logger.info('Initializing Circuit Breaker', {
      workerId: config.worker.id,
      enabled: config.fallback.enableCircuitBreaker,
    });

    this.circuitBreaker = new CircuitBreaker();

    this.circuitBreaker.on('stateChanged', (event) => {
      logger.info('Circuit breaker state changed', {
        workerId: config.worker.id,
        key: event.key,
        state: event.state,
        previousState: event.previousState,
      });
    });
  }

  private async initializeModelManager(): Promise<void> {
    if (!this.ollamaClient) {
      throw new Error('Ollama client not initialized');
    }

    logger.info('Initializing Model Manager', {
      workerId: config.worker.id,
    });

    this.modelManager = new ModelManager(this.ollamaClient);
    
    this.modelManager.on('modelLoaded', (event) => {
      logger.info('Model loaded', {
        workerId: config.worker.id,
        model: event.model,
        loadTime: event.loadTime,
      });
    });

    this.modelManager.on('modelUnloaded', (event) => {
      logger.info('Model unloaded', {
        workerId: config.worker.id,
        model: event.model,
      });
    });

    await this.modelManager.initialize();
  }

  private async initializeConsumers(): Promise<void> {
    if (!this.redis || !this.ollamaClient || !this.modelManager || !this.circuitBreaker) {
      throw new Error('Dependencies not initialized');
    }

    logger.info('Initializing consumers', {
      workerId: config.worker.id,
    });

    // Initialize chat consumer
    this.chatConsumer = new ChatConsumer(
      this.redis,
      this.ollamaClient,
      this.modelManager,
      this.circuitBreaker
    );
  }

  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Worker manager not initialized');
    }

    if (this.isRunning) {
      logger.warn('Worker manager already running', {
        workerId: config.worker.id,
      });
      return;
    }

    logger.info('Starting Worker Manager', {
      workerId: config.worker.id,
    });

    try {
      // Start consumers
      if (this.chatConsumer) {
        await this.chatConsumer.start();
      }

      this.isRunning = true;
      
      logger.info('Worker Manager started successfully', {
        workerId: config.worker.id,
      });

      this.emit('started');

    } catch (error) {
      logger.error('Failed to start Worker Manager', {
        workerId: config.worker.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping Worker Manager', {
      workerId: config.worker.id,
    });

    try {
      // Stop consumers
      if (this.chatConsumer) {
        await this.chatConsumer.stop();
      }

      // Shutdown model manager
      if (this.modelManager) {
        await this.modelManager.shutdown();
      }

      // Close Redis connection
      if (this.redis) {
        await this.redis.quit();
      }

      this.isRunning = false;
      
      logger.info('Worker Manager stopped successfully', {
        workerId: config.worker.id,
      });

      this.emit('stopped');

    } catch (error) {
      logger.error('Error stopping Worker Manager', {
        workerId: config.worker.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    try {
      const checks = await Promise.allSettled([
        this.redis?.ping(),
        this.ollamaClient?.healthCheck(),
        this.chatConsumer?.healthCheck(),
      ]);

      const redisHealthy = checks[0]?.status === 'fulfilled';
      const ollamaHealthy = checks[1]?.status === 'fulfilled' && checks[1]?.value === true;
      const consumerHealth = checks[2]?.status === 'fulfilled' ? checks[2]?.value : null;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      if (!redisHealthy || !ollamaHealthy) {
        status = 'unhealthy';
      } else if (consumerHealth?.status !== 'healthy') {
        status = consumerHealth?.status || 'degraded';
      }

      return {
        status,
        details: {
          redis: redisHealthy,
          ollama: ollamaHealthy,
          consumer: consumerHealth,
          isRunning: this.isRunning,
          isInitialized: this.isInitialized,
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

  getStats(): {
    workerId: string;
    isInitialized: boolean;
    isRunning: boolean;
    uptime: number;
    consumers: Record<string, any>;
    models: any[];
    circuitBreakers: any;
  } {
    return {
      workerId: config.worker.id,
      isInitialized: this.isInitialized,
      isRunning: this.isRunning,
      uptime: process.uptime(),
      consumers: {
        chat: this.chatConsumer?.getStats(),
      },
      models: this.modelManager?.getAllLoadedModels() || [],
      circuitBreakers: this.circuitBreaker?.getHealthStatus(),
    };
  }
}
