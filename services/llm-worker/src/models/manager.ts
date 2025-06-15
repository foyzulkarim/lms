import { EventEmitter } from 'eventemitter3';
import { OllamaClient } from '../ollama/client';
import { config } from '../config';
import { logger } from '../utils/logger';
import { ModelInfo, ModelLoadRequest, ModelLoadResult, SystemMetrics } from '../types';
import * as si from 'systeminformation';

export class ModelManager extends EventEmitter {
  private ollamaClient: OllamaClient;
  private loadedModels: Map<string, ModelInfo>;
  private loadingQueue: ModelLoadRequest[];
  private isProcessingQueue: boolean;
  private healthCheckInterval?: NodeJS.Timeout;
  private memoryCleanupInterval?: NodeJS.Timeout;

  constructor(ollamaClient: OllamaClient) {
    super();
    this.ollamaClient = ollamaClient;
    this.loadedModels = new Map();
    this.loadingQueue = [];
    this.isProcessingQueue = false;
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Model Manager', {
      workerId: config.worker.id,
      preloadEnabled: config.models.preloadEnabled,
      preloadList: config.models.preloadList,
    });

    // Get currently loaded models from Ollama
    await this.syncLoadedModels();

    // Preload models if enabled
    if (config.models.preloadEnabled) {
      await this.preloadModels();
    }

    // Start health check interval
    this.startHealthChecks();

    // Start memory cleanup interval
    this.startMemoryCleanup();

    logger.info('Model Manager initialized successfully', {
      workerId: config.worker.id,
      loadedModels: Array.from(this.loadedModels.keys()),
    });
  }

  async syncLoadedModels(): Promise<void> {
    try {
      const models = await this.ollamaClient.getModels();
      
      // Clear current loaded models
      this.loadedModels.clear();

      // Add models from Ollama
      for (const model of models) {
        this.loadedModels.set(model.name, {
          name: model.name,
          isLoaded: true,
          loadedAt: new Date(),
          lastUsed: new Date(),
          memoryUsage: model.size,
          requestCount: 0,
          errorCount: 0,
          avgResponseTime: 0,
          isHealthy: true,
          lastHealthCheck: new Date(),
        });
      }

      logger.info('Synced loaded models', {
        workerId: config.worker.id,
        modelCount: this.loadedModels.size,
        models: Array.from(this.loadedModels.keys()),
      });
    } catch (error) {
      logger.error('Failed to sync loaded models', {
        workerId: config.worker.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async preloadModels(): Promise<void> {
    logger.info('Preloading models', {
      workerId: config.worker.id,
      models: config.models.preloadList,
    });

    const preloadPromises = config.models.preloadList.map(async (modelName) => {
      try {
        await this.loadModel(modelName, 'normal');
        logger.info('Model preloaded successfully', {
          workerId: config.worker.id,
          model: modelName,
        });
      } catch (error) {
        logger.error('Failed to preload model', {
          workerId: config.worker.id,
          model: modelName,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    await Promise.allSettled(preloadPromises);
  }

  async loadModel(modelName: string, priority: 'low' | 'normal' | 'high' = 'normal', timeout?: number): Promise<ModelLoadResult> {
    const startTime = Date.now();

    // Check if model is already loaded
    const existingModel = this.loadedModels.get(modelName);
    if (existingModel?.isLoaded) {
      existingModel.lastUsed = new Date();
      return {
        success: true,
        model: modelName,
        loadTime: 0,
      };
    }

    // Add to loading queue
    const loadRequest: ModelLoadRequest = {
      model: modelName,
      priority,
      timeout: timeout || config.ollama.modelLoadTimeout,
    };

    this.loadingQueue.push(loadRequest);
    this.processLoadingQueue();

    // Wait for model to be loaded
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const model = this.loadedModels.get(modelName);
        if (model?.isLoaded) {
          clearInterval(checkInterval);
          resolve({
            success: true,
            model: modelName,
            loadTime: Date.now() - startTime,
          });
        }
      }, 1000);

      // Timeout handling
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error(`Model loading timeout: ${modelName}`));
      }, loadRequest.timeout);
    });
  }

  private async processLoadingQueue(): Promise<void> {
    if (this.isProcessingQueue || this.loadingQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      // Sort queue by priority
      this.loadingQueue.sort((a, b) => {
        const priorityOrder = { high: 3, normal: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });

      while (this.loadingQueue.length > 0) {
        const request = this.loadingQueue.shift()!;
        await this.performModelLoad(request);
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async performModelLoad(request: ModelLoadRequest): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info('Loading model', {
        workerId: config.worker.id,
        model: request.model,
        priority: request.priority,
      });

      // Check memory before loading
      const memoryInfo = await this.getMemoryInfo();
      if (memoryInfo.percentage > config.models.memoryThreshold) {
        await this.unloadLeastUsedModel();
      }

      // Pull model if not available
      try {
        await this.ollamaClient.pullModel(request.model);
      } catch (error) {
        // Model might already exist, continue
        logger.debug('Model pull failed, might already exist', {
          workerId: config.worker.id,
          model: request.model,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Update model info
      const modelInfo: ModelInfo = {
        name: request.model,
        isLoaded: true,
        loadedAt: new Date(),
        lastUsed: new Date(),
        memoryUsage: 0, // Will be updated by health checks
        requestCount: 0,
        errorCount: 0,
        avgResponseTime: 0,
        isHealthy: true,
        lastHealthCheck: new Date(),
      };

      this.loadedModels.set(request.model, modelInfo);

      const loadTime = Date.now() - startTime;
      logger.info('Model loaded successfully', {
        workerId: config.worker.id,
        model: request.model,
        loadTime,
      });

      this.emit('modelLoaded', { model: request.model, loadTime });
    } catch (error) {
      const loadTime = Date.now() - startTime;
      logger.error('Failed to load model', {
        workerId: config.worker.id,
        model: request.model,
        loadTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      this.emit('modelLoadFailed', { 
        model: request.model, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  async unloadModel(modelName: string): Promise<void> {
    try {
      logger.info('Unloading model', {
        workerId: config.worker.id,
        model: modelName,
      });

      await this.ollamaClient.deleteModel(modelName);
      this.loadedModels.delete(modelName);

      logger.info('Model unloaded successfully', {
        workerId: config.worker.id,
        model: modelName,
      });

      this.emit('modelUnloaded', { model: modelName });
    } catch (error) {
      logger.error('Failed to unload model', {
        workerId: config.worker.id,
        model: modelName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async unloadLeastUsedModel(): Promise<void> {
    if (this.loadedModels.size <= 1) {
      return; // Keep at least one model loaded
    }

    let leastUsedModel: string | null = null;
    let oldestLastUsed = new Date();

    for (const [modelName, modelInfo] of this.loadedModels) {
      if (modelInfo.lastUsed && modelInfo.lastUsed < oldestLastUsed) {
        oldestLastUsed = modelInfo.lastUsed;
        leastUsedModel = modelName;
      }
    }

    if (leastUsedModel) {
      await this.unloadModel(leastUsedModel);
    }
  }

  isModelLoaded(modelName: string): boolean {
    const model = this.loadedModels.get(modelName);
    return model?.isLoaded || false;
  }

  getModelInfo(modelName: string): ModelInfo | null {
    return this.loadedModels.get(modelName) || null;
  }

  getAllLoadedModels(): ModelInfo[] {
    return Array.from(this.loadedModels.values());
  }

  updateModelStats(modelName: string, responseTime: number, success: boolean): void {
    const model = this.loadedModels.get(modelName);
    if (!model) return;

    model.lastUsed = new Date();
    model.requestCount++;
    
    if (!success) {
      model.errorCount++;
    }

    // Update average response time
    const totalTime = model.avgResponseTime * (model.requestCount - 1) + responseTime;
    model.avgResponseTime = totalTime / model.requestCount;

    // Update health status based on error rate
    const errorRate = model.errorCount / model.requestCount;
    model.isHealthy = errorRate < 0.1; // Consider unhealthy if error rate > 10%
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, config.ollama.healthCheckInterval);
  }

  private async performHealthChecks(): Promise<void> {
    logger.debug('Performing model health checks', {
      workerId: config.worker.id,
      modelCount: this.loadedModels.size,
    });

    for (const [modelName, modelInfo] of this.loadedModels) {
      try {
        // Simple health check - try to get model info
        await this.ollamaClient.getModelInfo(modelName);
        modelInfo.isHealthy = true;
        modelInfo.lastHealthCheck = new Date();
      } catch (error) {
        logger.warn('Model health check failed', {
          workerId: config.worker.id,
          model: modelName,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        modelInfo.isHealthy = false;
        modelInfo.lastHealthCheck = new Date();
      }
    }
  }

  private startMemoryCleanup(): void {
    this.memoryCleanupInterval = setInterval(async () => {
      await this.performMemoryCleanup();
    }, config.resources.memoryCleanupInterval);
  }

  private async performMemoryCleanup(): Promise<void> {
    try {
      const memoryInfo = await this.getMemoryInfo();
      
      if (memoryInfo.percentage > config.models.memoryThreshold) {
        logger.info('Memory threshold exceeded, cleaning up', {
          workerId: config.worker.id,
          memoryUsage: memoryInfo.percentage,
          threshold: config.models.memoryThreshold,
        });

        // Unload models that haven't been used recently
        const now = new Date();
        const unloadThreshold = config.models.unloadTimeout;

        for (const [modelName, modelInfo] of this.loadedModels) {
          if (modelInfo.lastUsed) {
            const timeSinceLastUse = now.getTime() - modelInfo.lastUsed.getTime();
            if (timeSinceLastUse > unloadThreshold) {
              await this.unloadModel(modelName);
            }
          }
        }
      }
    } catch (error) {
      logger.error('Memory cleanup failed', {
        workerId: config.worker.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async getMemoryInfo(): Promise<{ used: number; total: number; percentage: number }> {
    try {
      const memory = await si.mem();
      return {
        used: memory.used,
        total: memory.total,
        percentage: (memory.used / memory.total) * 100,
      };
    } catch (error) {
      logger.error('Failed to get memory info', {
        workerId: config.worker.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { used: 0, total: 1, percentage: 0 };
    }
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      const [cpu, memory, disk, networkStats] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
      ]);

      let gpu;
      try {
        const gpuData = await si.graphics();
        if (gpuData.controllers.length > 0) {
          const controller = gpuData.controllers[0];
          gpu = {
            usage: 0, // Not available in systeminformation
            memory: {
              used: controller.memoryUsed || 0,
              total: controller.memoryTotal || 0,
              percentage: controller.memoryTotal 
                ? (controller.memoryUsed || 0) / controller.memoryTotal * 100 
                : 0,
            },
          };
        }
      } catch {
        // GPU info not available
      }

      return {
        timestamp: new Date(),
        workerId: config.worker.id,
        cpu: {
          usage: cpu.currentLoad,
          load: cpu.avgLoad ? [cpu.avgLoad] : [0],
        },
        memory: {
          used: memory.used,
          total: memory.total,
          percentage: (memory.used / memory.total) * 100,
        },
        gpu,
        disk: {
          used: disk[0]?.used || 0,
          total: disk[0]?.size || 0,
          percentage: disk[0] ? (disk[0].used / disk[0].size) * 100 : 0,
        },
        network: {
          rx: networkStats[0]?.rx_bytes || 0,
          tx: networkStats[0]?.tx_bytes || 0,
        },
      };
    } catch (error) {
      logger.error('Failed to get system metrics', {
        workerId: config.worker.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        timestamp: new Date(),
        workerId: config.worker.id,
        cpu: { usage: 0, load: [0] },
        memory: { used: 0, total: 1, percentage: 0 },
        disk: { used: 0, total: 1, percentage: 0 },
        network: { rx: 0, tx: 0 },
      };
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Model Manager', {
      workerId: config.worker.id,
    });

    // Clear intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval);
    }

    // Clear loading queue
    this.loadingQueue = [];

    logger.info('Model Manager shutdown complete', {
      workerId: config.worker.id,
    });
  }
}
