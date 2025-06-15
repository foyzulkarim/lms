import axios, { AxiosInstance, AxiosResponse } from 'axios';
import retry from 'async-retry';
import { config } from '../config';
import { logger } from '../utils/logger';
import { 
  OllamaRequest, 
  OllamaResponse, 
  OllamaModel, 
  OllamaEmbeddingResponse,
  ProcessingError 
} from '../types';

export class OllamaClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;
  private retryDelay: number;

  constructor() {
    this.baseUrl = config.ollama.baseUrl;
    this.timeout = config.ollama.timeout;
    this.maxRetries = config.ollama.maxRetries;
    this.retryDelay = config.ollama.retryDelay;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `LMS-LLM-Worker/${config.worker.id}`,
      },
      maxRedirects: 0,
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('Ollama request', {
          method: config.method,
          url: config.url,
          timeout: config.timeout,
          workerId: config.worker?.id,
        });
        return config;
      },
      (error) => {
        logger.error('Ollama request setup error', { 
          error: error.message,
          workerId: config.worker.id 
        });
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Ollama response received', {
          status: response.status,
          url: response.config.url,
          responseTime: response.headers['x-response-time'],
          workerId: config.worker.id,
        });
        return response;
      },
      (error) => {
        logger.error('Ollama response error', {
          status: error.response?.status,
          url: error.config?.url,
          error: error.message,
          data: error.response?.data,
          workerId: config.worker.id,
        });
        return Promise.reject(error);
      }
    );
  }

  async chatCompletion(request: OllamaRequest): Promise<OllamaResponse> {
    const startTime = Date.now();
    
    try {
      const response = await retry(
        async () => {
          const result = await this.client.post('/api/chat', {
            model: request.model,
            messages: request.messages,
            stream: false,
            options: request.options,
          });
          return result;
        },
        {
          retries: this.maxRetries,
          minTimeout: this.retryDelay,
          maxTimeout: this.retryDelay * 4,
          onRetry: (error, attempt) => {
            logger.warn('Retrying Ollama chat request', {
              attempt,
              error: error.message,
              model: request.model,
              workerId: config.worker.id,
            });
          },
        }
      );

      const processingTime = Date.now() - startTime;
      logger.info('Chat completion successful', {
        model: request.model,
        processingTime,
        workerId: config.worker.id,
      });

      return response.data;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Chat completion failed', {
        model: request.model,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
      throw this.transformError(error);
    }
  }

  async embeddings(request: OllamaRequest): Promise<OllamaEmbeddingResponse> {
    const startTime = Date.now();
    
    try {
      const response = await retry(
        async () => {
          const result = await this.client.post('/api/embeddings', {
            model: request.model,
            prompt: request.prompt,
          });
          return result;
        },
        {
          retries: this.maxRetries,
          minTimeout: this.retryDelay,
          maxTimeout: this.retryDelay * 4,
          onRetry: (error, attempt) => {
            logger.warn('Retrying Ollama embeddings request', {
              attempt,
              error: error.message,
              model: request.model,
              workerId: config.worker.id,
            });
          },
        }
      );

      const processingTime = Date.now() - startTime;
      logger.info('Embeddings generation successful', {
        model: request.model,
        processingTime,
        workerId: config.worker.id,
      });

      return response.data;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Embeddings generation failed', {
        model: request.model,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
      throw this.transformError(error);
    }
  }

  async getModels(): Promise<OllamaModel[]> {
    try {
      const response = await this.client.get('/api/tags');
      return response.data.models || [];
    } catch (error) {
      logger.error('Failed to get models', {
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
      throw this.transformError(error);
    }
  }

  async pullModel(modelName: string): Promise<void> {
    try {
      logger.info('Pulling model', { 
        model: modelName,
        workerId: config.worker.id 
      });
      
      await this.client.post('/api/pull', {
        name: modelName,
        stream: false,
      }, {
        timeout: config.ollama.modelLoadTimeout,
      });

      logger.info('Model pulled successfully', { 
        model: modelName,
        workerId: config.worker.id 
      });
    } catch (error) {
      logger.error('Failed to pull model', {
        model: modelName,
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
      throw this.transformError(error);
    }
  }

  async deleteModel(modelName: string): Promise<void> {
    try {
      logger.info('Deleting model', { 
        model: modelName,
        workerId: config.worker.id 
      });
      
      await this.client.delete('/api/delete', {
        data: { name: modelName }
      });

      logger.info('Model deleted successfully', { 
        model: modelName,
        workerId: config.worker.id 
      });
    } catch (error) {
      logger.error('Failed to delete model', {
        model: modelName,
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
      throw this.transformError(error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/tags', { 
        timeout: 5000 
      });
      return response.status === 200;
    } catch (error) {
      logger.debug('Ollama health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
      return false;
    }
  }

  async getModelInfo(modelName: string): Promise<any> {
    try {
      const response = await this.client.post('/api/show', {
        name: modelName,
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to get model info', {
        model: modelName,
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
      throw this.transformError(error);
    }
  }

  // Streaming support for chat completions
  async *chatCompletionStream(request: OllamaRequest): AsyncGenerator<OllamaResponse, void, unknown> {
    try {
      const response = await this.client.post('/api/chat', {
        model: request.model,
        messages: request.messages,
        stream: true,
        options: request.options,
      }, {
        responseType: 'stream',
      });

      let buffer = '';
      
      for await (const chunk of response.data) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              yield data;
            } catch (parseError) {
              logger.warn('Failed to parse streaming response', {
                line,
                error: parseError instanceof Error ? parseError.message : 'Unknown error',
                workerId: config.worker.id,
              });
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          yield data;
        } catch (parseError) {
          logger.warn('Failed to parse final streaming response', {
            buffer,
            error: parseError instanceof Error ? parseError.message : 'Unknown error',
            workerId: config.worker.id,
          });
        }
      }
    } catch (error) {
      logger.error('Streaming chat completion failed', {
        model: request.model,
        error: error instanceof Error ? error.message : 'Unknown error',
        workerId: config.worker.id,
      });
      throw this.transformError(error);
    }
  }

  private transformError(error: any): ProcessingError {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error || error.message;
      
      switch (status) {
        case 400:
          return {
            type: 'validation',
            message: `Bad Request: ${message}`,
            retryable: false,
            fallbackAvailable: false,
          };
        case 404:
          return {
            type: 'model',
            message: `Model not found: ${message}`,
            retryable: false,
            fallbackAvailable: true,
          };
        case 429:
          return {
            type: 'network',
            message: `Rate limit exceeded: ${message}`,
            retryable: true,
            fallbackAvailable: false,
          };
        case 500:
        case 502:
        case 503:
          return {
            type: 'network',
            message: `Ollama server error (${status}): ${message}`,
            retryable: true,
            fallbackAvailable: true,
          };
        default:
          return {
            type: 'unknown',
            message: `Ollama error (${status}): ${message}`,
            retryable: status >= 500,
            fallbackAvailable: true,
          };
      }
    } else if (error.code === 'ECONNREFUSED') {
      return {
        type: 'network',
        message: 'Cannot connect to Ollama server',
        retryable: true,
        fallbackAvailable: false,
      };
    } else if (error.code === 'ETIMEDOUT') {
      return {
        type: 'timeout',
        message: 'Request to Ollama server timed out',
        retryable: true,
        fallbackAvailable: true,
      };
    } else if (error.code === 'ENOTFOUND') {
      return {
        type: 'network',
        message: 'Ollama server not found',
        retryable: false,
        fallbackAvailable: false,
      };
    } else {
      return {
        type: 'unknown',
        message: `Ollama error: ${error.message}`,
        retryable: false,
        fallbackAvailable: true,
      };
    }
  }

  // Utility methods
  estimateTokens(text: string): number {
    // Simple token estimation (roughly 4 characters per token)
    return Math.ceil(text.length / 4);
  }

  validateModel(modelName: string): boolean {
    return config.models.allowedModels.includes(modelName);
  }

  getDefaultModel(type: 'chat' | 'embeddings'): string {
    return type === 'chat' 
      ? config.models.defaultChatModel 
      : config.models.defaultEmbeddingModel;
  }
}
