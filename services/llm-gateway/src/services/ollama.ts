import axios, { AxiosInstance, AxiosResponse } from 'axios';
import retry from 'async-retry';
import { config } from '../config';
import { logger } from '../utils/logger';
import { 
  ChatCompletionRequest, 
  ChatCompletionResponse, 
  EmbeddingsRequest, 
  EmbeddingsResponse,
  Model,
  ModelsResponse 
} from '../types/llm';

export class OllamaService {
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
        'User-Agent': 'LMS-LLM-Gateway/1.0',
      },
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
          data: config.data ? JSON.stringify(config.data).substring(0, 500) : undefined,
        });
        return config;
      },
      (error) => {
        logger.error('Ollama request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Ollama response', {
          status: response.status,
          url: response.config.url,
          responseSize: JSON.stringify(response.data).length,
        });
        return response;
      },
      (error) => {
        logger.error('Ollama response error', {
          status: error.response?.status,
          url: error.config?.url,
          error: error.message,
          data: error.response?.data,
        });
        return Promise.reject(error);
      }
    );
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const startTime = Date.now();
    
    try {
      const response = await retry(
        async () => {
          const ollamaRequest = this.transformChatRequest(request);
          const result = await this.client.post('/api/chat', ollamaRequest);
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
            });
          },
        }
      );

      const processingTime = Date.now() - startTime;
      const transformedResponse = this.transformChatResponse(response.data, request.model, processingTime);

      logger.info('Chat completion successful', {
        model: request.model,
        processingTime,
        tokensUsed: transformedResponse.usage.total_tokens,
      });

      return transformedResponse;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Chat completion failed', {
        model: request.model,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw this.transformError(error);
    }
  }

  async embeddings(request: EmbeddingsRequest): Promise<EmbeddingsResponse> {
    const startTime = Date.now();
    
    try {
      const inputs = Array.isArray(request.input) ? request.input : [request.input];
      const embeddings = [];

      // Process embeddings in parallel for better performance
      const promises = inputs.map(async (input, index) => {
        const ollamaRequest = {
          model: request.model,
          prompt: input,
        };

        const response = await retry(
          async () => {
            const result = await this.client.post('/api/embeddings', ollamaRequest);
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
                index,
              });
            },
          }
        );

        return {
          object: 'embedding' as const,
          embedding: response.data.embedding,
          index,
        };
      });

      const results = await Promise.all(promises);
      embeddings.push(...results);

      const processingTime = Date.now() - startTime;
      const totalTokens = inputs.reduce((sum, input) => sum + this.estimateTokens(input), 0);

      const transformedResponse: EmbeddingsResponse = {
        object: 'list',
        data: embeddings,
        model: request.model,
        usage: {
          prompt_tokens: totalTokens,
          total_tokens: totalTokens,
        },
      };

      logger.info('Embeddings generation successful', {
        model: request.model,
        processingTime,
        inputCount: inputs.length,
        tokensUsed: totalTokens,
      });

      return transformedResponse;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Embeddings generation failed', {
        model: request.model,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw this.transformError(error);
    }
  }

  async getModels(): Promise<ModelsResponse> {
    try {
      const response = await this.client.get('/api/tags');
      const models = response.data.models || [];

      const transformedModels: Model[] = models.map((model: any) => ({
        id: model.name,
        object: 'model' as const,
        created: Math.floor(new Date(model.modified_at || Date.now()).getTime() / 1000),
        owned_by: 'ollama',
        permission: [{
          id: `perm-${model.name}`,
          object: 'model_permission' as const,
          created: Math.floor(Date.now() / 1000),
          allow_create_engine: false,
          allow_sampling: true,
          allow_logprobs: true,
          allow_search_indices: false,
          allow_view: true,
          allow_fine_tuning: false,
          organization: 'ollama',
          is_blocking: false,
        }],
        root: model.name,
        parent: model.parent_model || undefined,
      }));

      return {
        object: 'list',
        data: transformedModels,
      };
    } catch (error) {
      logger.error('Failed to get models', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw this.transformError(error);
    }
  }

  async getModelInfo(modelId: string): Promise<Model | null> {
    try {
      const modelsResponse = await this.getModels();
      return modelsResponse.data.find(model => model.id === modelId) || null;
    } catch (error) {
      logger.error('Failed to get model info', {
        modelId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/tags', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      logger.error('Ollama health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  private transformChatRequest(request: ChatCompletionRequest): any {
    return {
      model: request.model,
      messages: request.messages,
      stream: false, // We'll handle streaming separately
      options: {
        temperature: request.temperature,
        num_predict: request.max_tokens,
        top_p: request.top_p,
        frequency_penalty: request.frequency_penalty,
        presence_penalty: request.presence_penalty,
        stop: Array.isArray(request.stop) ? request.stop : request.stop ? [request.stop] : undefined,
      },
    };
  }

  private transformChatResponse(
    ollamaResponse: any, 
    model: string, 
    processingTime: number
  ): ChatCompletionResponse {
    const message = ollamaResponse.message || {};
    const promptTokens = this.estimateTokens(JSON.stringify(ollamaResponse.prompt || ''));
    const completionTokens = this.estimateTokens(message.content || '');

    return {
      id: `chatcmpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: {
          role: message.role || 'assistant',
          content: message.content || '',
        },
        finish_reason: ollamaResponse.done ? 'stop' : 'length',
      }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    };
  }

  private transformError(error: any): Error {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error || error.message;
      
      switch (status) {
        case 400:
          return new Error(`Bad Request: ${message}`);
        case 401:
          return new Error(`Unauthorized: ${message}`);
        case 404:
          return new Error(`Model not found: ${message}`);
        case 429:
          return new Error(`Rate limit exceeded: ${message}`);
        case 500:
          return new Error(`Ollama server error: ${message}`);
        default:
          return new Error(`Ollama error (${status}): ${message}`);
      }
    } else if (error.code === 'ECONNREFUSED') {
      return new Error('Cannot connect to Ollama server');
    } else if (error.code === 'ETIMEDOUT') {
      return new Error('Request to Ollama server timed out');
    } else {
      return new Error(`Ollama error: ${error.message}`);
    }
  }

  private estimateTokens(text: string): number {
    // Simple token estimation (roughly 4 characters per token)
    return Math.ceil(text.length / 4);
  }

  // Streaming support (for future implementation)
  async *chatCompletionStream(request: ChatCompletionRequest): AsyncGenerator<any, void, unknown> {
    // This would implement streaming responses
    // For now, we'll throw an error if streaming is requested
    if (request.stream) {
      throw new Error('Streaming is not yet implemented');
    }
  }
}
