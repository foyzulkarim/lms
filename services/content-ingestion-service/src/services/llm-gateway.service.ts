import axios, { AxiosInstance } from 'axios';
import { config } from '@/config/environment';
import { contentLogger } from '@/utils/logger';
import { LLMGatewayEmbeddingRequest, LLMGatewayEmbeddingResponse, EmbeddingError } from '@/types';

export class LLMGatewayService {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.LLM_GATEWAY_URL;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: config.EMBEDDING_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'content-ingestion-service/1.0.0',
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        contentLogger.externalServiceCall('llm-gateway', `${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        contentLogger.externalServiceError('llm-gateway', 'request', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        const duration = response.config.metadata?.startTime 
          ? Date.now() - response.config.metadata.startTime 
          : 0;
        contentLogger.externalServiceCall(
          'llm-gateway', 
          `${response.config.method?.toUpperCase()} ${response.config.url}`,
          duration
        );
        return response;
      },
      (error) => {
        contentLogger.externalServiceError('llm-gateway', 'response', error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Generate embeddings for text chunks
   */
  async generateEmbeddings(request: LLMGatewayEmbeddingRequest): Promise<number[][]> {
    try {
      const startTime = Date.now();
      
      const response = await this.client.post<LLMGatewayEmbeddingResponse>('/api/v1/embeddings', {
        texts: request.texts,
        model: request.model || config.EMBEDDING_MODEL,
      });

      const duration = Date.now() - startTime;
      
      contentLogger.info('Embeddings generated successfully', {
        textCount: request.texts.length,
        model: request.model || config.EMBEDDING_MODEL,
        duration,
        totalTokens: response.data.usage?.totalTokens,
      });

      return response.data.embeddings;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      const statusCode = error.response?.status || 500;
      
      contentLogger.error('Failed to generate embeddings', error, {
        textCount: request.texts.length,
        model: request.model,
        statusCode,
        errorMessage,
      });

      throw new EmbeddingError(
        `Failed to generate embeddings: ${errorMessage}`,
        {
          textCount: request.texts.length,
          model: request.model,
          statusCode,
          originalError: error.message,
        }
      );
    }
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string, model?: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddings({
      texts: [text],
      model,
    });
    
    return embeddings[0];
  }

  /**
   * Generate embeddings in batches to handle large datasets
   */
  async generateEmbeddingsBatch(
    texts: string[], 
    batchSize: number = config.EMBEDDING_BATCH_SIZE,
    model?: string
  ): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }

    const allEmbeddings: number[][] = [];
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      try {
        contentLogger.info(`Processing embedding batch ${i + 1}/${batches.length}`, {
          batchSize: batch.length,
          totalTexts: texts.length,
        });

        const batchEmbeddings = await this.generateEmbeddings({
          texts: batch,
          model,
        });

        allEmbeddings.push(...batchEmbeddings);

        // Add delay between batches to avoid rate limiting
        if (i < batches.length - 1) {
          await this.delay(1000);
        }
      } catch (error) {
        contentLogger.error(`Failed to process embedding batch ${i + 1}`, error as Error, {
          batchIndex: i,
          batchSize: batch.length,
        });
        throw error;
      }
    }

    return allEmbeddings;
  }

  /**
   * Check if LLM Gateway is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', {
        timeout: 5000,
      });
      
      return response.status === 200;
    } catch (error) {
      contentLogger.error('LLM Gateway health check failed', error as Error);
      return false;
    }
  }

  /**
   * Get available embedding models
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.client.get('/api/v1/models/embeddings');
      return response.data.models || [];
    } catch (error) {
      contentLogger.error('Failed to get available embedding models', error as Error);
      return [config.EMBEDDING_MODEL]; // Return default model as fallback
    }
  }

  /**
   * Get model information
   */
  async getModelInfo(model: string): Promise<any> {
    try {
      const response = await this.client.get(`/api/v1/models/${model}`);
      return response.data;
    } catch (error) {
      contentLogger.error(`Failed to get model info for ${model}`, error as Error);
      return null;
    }
  }

  /**
   * Validate embedding dimensions
   */
  async validateEmbeddingDimensions(model: string): Promise<number> {
    try {
      const modelInfo = await this.getModelInfo(model);
      return modelInfo?.dimensions || config.EMBEDDING_DIMENSIONS;
    } catch (error) {
      contentLogger.warn(`Could not validate dimensions for model ${model}, using default`);
      return config.EMBEDDING_DIMENSIONS;
    }
  }

  /**
   * Test embedding generation with sample text
   */
  async testEmbeddingGeneration(): Promise<boolean> {
    try {
      const testText = "This is a test sentence for embedding generation.";
      const embedding = await this.generateEmbedding(testText);
      
      const isValid = Array.isArray(embedding) && 
                     embedding.length > 0 && 
                     embedding.every(val => typeof val === 'number');
      
      if (isValid) {
        contentLogger.info('Embedding generation test passed', {
          embeddingLength: embedding.length,
          sampleValues: embedding.slice(0, 3),
        });
      } else {
        contentLogger.error('Embedding generation test failed - invalid embedding format');
      }
      
      return isValid;
    } catch (error) {
      contentLogger.error('Embedding generation test failed', error as Error);
      return false;
    }
  }

  /**
   * Calculate similarity between two embeddings
   */
  calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  /**
   * Retry mechanism for failed requests
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          break;
        }

        contentLogger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms`, {
          error: lastError.message,
          attempt,
          maxRetries,
        });

        await this.delay(delay * attempt); // Exponential backoff
      }
    }

    throw lastError!;
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get service statistics
   */
  getStats(): any {
    return {
      baseUrl: this.baseUrl,
      defaultModel: config.EMBEDDING_MODEL,
      batchSize: config.EMBEDDING_BATCH_SIZE,
      timeout: config.EMBEDDING_TIMEOUT,
    };
  }
}

// Export singleton instance
export const llmGatewayService = new LLMGatewayService();
