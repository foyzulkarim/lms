import { BaseProcessor } from './base-processor';
import { QueueJobData, QueueJobResult, OllamaRequest, ProcessingError } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

export class ChatProcessor extends BaseProcessor {
  async process(job: QueueJobData): Promise<QueueJobResult> {
    const startTime = Date.now();
    const jobLogger = this.createJobLogger(job.id, 'chat');

    jobLogger.info('Processing chat completion job', {
      userId: job.userId,
      model: job.model,
      correlationId: job.correlationId,
    });

    try {
      // Validate request
      this.validateChatRequest(job.request);

      // Ensure model is loaded
      await this.ensureModelLoaded(job.model);

      // Prepare Ollama request
      const ollamaRequest: OllamaRequest = {
        model: job.model,
        messages: job.request.messages,
        options: {
          temperature: job.request.temperature,
          top_p: job.request.top_p,
          top_k: job.request.top_k,
          num_predict: job.request.max_tokens,
          stop: job.request.stop,
        },
      };

      // Process with circuit breaker and fallback
      const response = await this.circuitBreaker.execute(
        `chat:${job.model}`,
        async () => {
          return await this.ollamaClient.chatCompletion(ollamaRequest);
        },
        config.fallback.enableModelFallback ? async () => {
          return await this.processChatWithFallback(ollamaRequest, job);
        } : undefined
      );

      // Transform response to OpenAI format
      const transformedResponse = this.transformChatResponse(response, job);

      const processingTime = Date.now() - startTime;

      // Update model statistics
      this.modelManager.updateModelStats(job.model, processingTime, true);

      // Publish success event
      await this.publishEvent('CHAT_COMPLETION_SUCCESS', {
        jobId: job.id,
        userId: job.userId,
        model: job.model,
        processingTime,
        tokensUsed: this.estimateTokens(transformedResponse),
        correlationId: job.correlationId,
      });

      jobLogger.info('Chat completion successful', {
        userId: job.userId,
        model: job.model,
        processingTime,
        tokensUsed: this.estimateTokens(transformedResponse),
      });

      return {
        success: true,
        response: transformedResponse,
        processingTime,
        model: job.model,
        tokensUsed: this.estimateTokens(transformedResponse),
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const processingError = error as ProcessingError;

      // Update model statistics
      this.modelManager.updateModelStats(job.model, processingTime, false);

      // Publish error event
      await this.publishEvent('CHAT_COMPLETION_ERROR', {
        jobId: job.id,
        userId: job.userId,
        model: job.model,
        processingTime,
        error: processingError.message,
        errorType: processingError.type,
        correlationId: job.correlationId,
      });

      jobLogger.error('Chat completion failed', {
        userId: job.userId,
        model: job.model,
        processingTime,
        error: processingError.message,
        errorType: processingError.type,
      });

      return {
        success: false,
        error: processingError.message,
        processingTime,
        model: job.model,
      };
    }
  }

  private validateChatRequest(request: any): void {
    if (!request.messages || !Array.isArray(request.messages)) {
      throw {
        type: 'validation',
        message: 'Messages array is required',
        retryable: false,
        fallbackAvailable: false,
      } as ProcessingError;
    }

    if (request.messages.length === 0) {
      throw {
        type: 'validation',
        message: 'At least one message is required',
        retryable: false,
        fallbackAvailable: false,
      } as ProcessingError;
    }

    // Validate message format
    for (const message of request.messages) {
      if (!message.role || !message.content) {
        throw {
          type: 'validation',
          message: 'Each message must have role and content',
          retryable: false,
          fallbackAvailable: false,
        } as ProcessingError;
      }

      if (!['system', 'user', 'assistant'].includes(message.role)) {
        throw {
          type: 'validation',
          message: 'Invalid message role',
          retryable: false,
          fallbackAvailable: false,
        } as ProcessingError;
      }
    }

    // Check content length
    const totalLength = request.messages
      .map((msg: any) => msg.content)
      .join(' ')
      .length;

    if (totalLength > config.security.maxPromptLength) {
      throw {
        type: 'validation',
        message: `Prompt too long. Maximum length: ${config.security.maxPromptLength}`,
        retryable: false,
        fallbackAvailable: false,
      } as ProcessingError;
    }

    // Validate parameters
    if (request.temperature !== undefined) {
      if (typeof request.temperature !== 'number' || request.temperature < 0 || request.temperature > 2) {
        throw {
          type: 'validation',
          message: 'Temperature must be between 0 and 2',
          retryable: false,
          fallbackAvailable: false,
        } as ProcessingError;
      }
    }

    if (request.max_tokens !== undefined) {
      if (typeof request.max_tokens !== 'number' || request.max_tokens < 1 || request.max_tokens > 4096) {
        throw {
          type: 'validation',
          message: 'max_tokens must be between 1 and 4096',
          retryable: false,
          fallbackAvailable: false,
        } as ProcessingError;
      }
    }

    if (request.top_p !== undefined) {
      if (typeof request.top_p !== 'number' || request.top_p < 0 || request.top_p > 1) {
        throw {
          type: 'validation',
          message: 'top_p must be between 0 and 1',
          retryable: false,
          fallbackAvailable: false,
        } as ProcessingError;
      }
    }
  }

  private async processChatWithFallback(originalRequest: OllamaRequest, job: QueueJobData): Promise<any> {
    const fallbackModels = config.fallback.fallbackModels.filter(
      model => model !== originalRequest.model && this.modelManager.isModelLoaded(model)
    );

    if (fallbackModels.length === 0) {
      throw {
        type: 'model',
        message: 'No fallback models available',
        retryable: false,
        fallbackAvailable: false,
      } as ProcessingError;
    }

    logger.info('Using fallback model for chat completion', {
      originalModel: originalRequest.model,
      fallbackModels,
      jobId: job.id,
      workerId: config.worker.id,
    });

    // Try each fallback model
    for (const fallbackModel of fallbackModels) {
      try {
        await this.ensureModelLoaded(fallbackModel);

        const fallbackRequest = {
          ...originalRequest,
          model: fallbackModel,
        };

        const response = await this.ollamaClient.chatCompletion(fallbackRequest);
        
        logger.info('Fallback model successful', {
          originalModel: originalRequest.model,
          fallbackModel,
          jobId: job.id,
          workerId: config.worker.id,
        });

        return response;
      } catch (error) {
        logger.warn('Fallback model failed', {
          originalModel: originalRequest.model,
          fallbackModel,
          error: error instanceof Error ? error.message : 'Unknown error',
          jobId: job.id,
          workerId: config.worker.id,
        });
        continue;
      }
    }

    throw {
      type: 'model',
      message: 'All fallback models failed',
      retryable: false,
      fallbackAvailable: false,
    } as ProcessingError;
  }

  private transformChatResponse(ollamaResponse: any, job: QueueJobData): any {
    const message = ollamaResponse.message || {};
    const promptTokens = this.estimateTokens(
      job.request.messages.map((msg: any) => msg.content).join(' ')
    );
    const completionTokens = this.estimateTokens(message.content || '');

    return {
      id: `chatcmpl-${job.id}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: job.model,
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

  private estimateTokens(response: any): number {
    if (typeof response === 'string') {
      return Math.ceil(response.length / 4);
    }
    
    if (response.choices && response.choices[0]?.message?.content) {
      return Math.ceil(response.choices[0].message.content.length / 4);
    }
    
    return 0;
  }

  // Streaming support
  async processStream(job: QueueJobData): Promise<AsyncGenerator<any, void, unknown>> {
    const jobLogger = this.createJobLogger(job.id, 'chat-stream');

    jobLogger.info('Processing streaming chat completion job', {
      userId: job.userId,
      model: job.model,
      correlationId: job.correlationId,
    });

    try {
      // Validate request
      this.validateChatRequest(job.request);

      // Ensure model is loaded
      await this.ensureModelLoaded(job.model);

      // Prepare Ollama request
      const ollamaRequest: OllamaRequest = {
        model: job.model,
        messages: job.request.messages,
        options: {
          temperature: job.request.temperature,
          top_p: job.request.top_p,
          top_k: job.request.top_k,
          num_predict: job.request.max_tokens,
          stop: job.request.stop,
        },
      };

      // Process streaming response
      const stream = this.ollamaClient.chatCompletionStream(ollamaRequest);
      
      for await (const chunk of stream) {
        yield this.transformStreamChunk(chunk, job);
      }

      jobLogger.info('Streaming chat completion successful', {
        userId: job.userId,
        model: job.model,
      });

    } catch (error) {
      const processingError = error as ProcessingError;
      
      jobLogger.error('Streaming chat completion failed', {
        userId: job.userId,
        model: job.model,
        error: processingError.message,
        errorType: processingError.type,
      });

      throw error;
    }
  }

  private transformStreamChunk(ollamaChunk: any, job: QueueJobData): any {
    return {
      id: `chatcmpl-${job.id}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: job.model,
      choices: [{
        index: 0,
        delta: {
          role: ollamaChunk.message?.role,
          content: ollamaChunk.message?.content || '',
        },
        finish_reason: ollamaChunk.done ? 'stop' : null,
      }],
    };
  }
}
