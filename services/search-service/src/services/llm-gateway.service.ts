import axios, { AxiosInstance } from 'axios';
import { config } from '@/config/environment';
import { searchLogger } from '@/utils/logger';
import { 
  LLMGatewayEmbeddingRequest, 
  LLMGatewayEmbeddingResponse,
  LLMGatewayCompletionRequest,
  LLMGatewayCompletionResponse,
  RAGError 
} from '@/types';

export class LLMGatewayService {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.LLM_GATEWAY_URL;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'search-service/2.0.0',
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        searchLogger.externalServiceCall('llm-gateway', `${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        searchLogger.externalServiceError('llm-gateway', 'request', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        const duration = response.config.metadata?.startTime 
          ? Date.now() - response.config.metadata.startTime 
          : 0;
        searchLogger.externalServiceCall(
          'llm-gateway', 
          `${response.config.method?.toUpperCase()} ${response.config.url}`,
          duration
        );
        return response;
      },
      (error) => {
        searchLogger.externalServiceError('llm-gateway', 'response', error);
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
        model: request.model || config.DEFAULT_EMBEDDING_MODEL,
      });

      const duration = Date.now() - startTime;
      
      searchLogger.info('Embeddings generated successfully', {
        textCount: request.texts.length,
        model: request.model || config.DEFAULT_EMBEDDING_MODEL,
        duration,
        totalTokens: response.data.usage?.totalTokens,
      });

      return response.data.embeddings;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      const statusCode = error.response?.status || 500;
      
      searchLogger.error('Failed to generate embeddings', error, {
        textCount: request.texts.length,
        model: request.model,
        statusCode,
        errorMessage,
      });

      throw new RAGError(
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
   * Generate text completion for RAG responses
   */
  async generateCompletion(request: LLMGatewayCompletionRequest): Promise<LLMGatewayCompletionResponse> {
    try {
      const startTime = Date.now();
      
      const response = await this.client.post<LLMGatewayCompletionResponse>('/api/v1/completions', {
        prompt: request.prompt,
        model: request.model || config.DEFAULT_RAG_MODEL,
        temperature: request.temperature || config.RAG_TEMPERATURE,
        maxTokens: request.maxTokens || config.RAG_MAX_TOKENS,
        systemPrompt: request.systemPrompt,
      });

      const duration = Date.now() - startTime;
      
      searchLogger.info('Text completion generated successfully', {
        model: request.model || config.DEFAULT_RAG_MODEL,
        promptLength: request.prompt.length,
        responseLength: response.data.text.length,
        duration,
        totalTokens: response.data.usage?.totalTokens,
      });

      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      const statusCode = error.response?.status || 500;
      
      searchLogger.error('Failed to generate completion', error, {
        model: request.model,
        promptLength: request.prompt.length,
        statusCode,
        errorMessage,
      });

      throw new RAGError(
        `Failed to generate completion: ${errorMessage}`,
        {
          model: request.model,
          promptLength: request.prompt.length,
          statusCode,
          originalError: error.message,
        }
      );
    }
  }

  /**
   * Generate RAG response with context
   */
  async generateRAGResponse(
    question: string, 
    contexts: Array<{ text: string; metadata: any }>,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      includeSourcesInAnswer?: boolean;
    } = {}
  ): Promise<{
    answer: string;
    confidence: number;
    reasoning?: string;
    followUpQuestions?: string[];
  }> {
    const {
      model = config.DEFAULT_RAG_MODEL,
      temperature = config.RAG_TEMPERATURE,
      maxTokens = config.RAG_MAX_TOKENS,
      includeSourcesInAnswer = true,
    } = options;

    // Build context from provided sources
    const contextText = contexts
      .map((ctx, idx) => `[${idx + 1}] ${ctx.text}`)
      .join('\n\n');

    // Create RAG prompt
    const systemPrompt = `You are an intelligent educational assistant. Answer questions based on the provided context from course materials. 
If the context doesn't contain enough information to answer the question completely, say so clearly.
${includeSourcesInAnswer ? 'When referencing information, mention the source number in brackets [1], [2], etc.' : ''}
Be concise but comprehensive in your answers.`;

    const prompt = `Context:
${contextText}

Question: ${question}

Answer:`;

    try {
      const completion = await this.generateCompletion({
        prompt,
        systemPrompt,
        model,
        temperature,
        maxTokens,
      });

      // Generate follow-up questions
      const followUpQuestions = await this.generateFollowUpQuestions(question, completion.text, model);

      return {
        answer: completion.text,
        confidence: completion.confidence || 0.8,
        reasoning: `Generated using ${contexts.length} context sources`,
        followUpQuestions,
      };
    } catch (error) {
      searchLogger.error('Failed to generate RAG response', error as Error, {
        question: question.substring(0, 100),
        contextCount: contexts.length,
        model,
      });
      throw error;
    }
  }

  /**
   * Generate follow-up questions based on the original question and answer
   */
  private async generateFollowUpQuestions(
    originalQuestion: string, 
    answer: string, 
    model: string
  ): Promise<string[]> {
    try {
      const prompt = `Based on this educational Q&A, suggest 2-3 relevant follow-up questions that a student might ask:

Original Question: ${originalQuestion}
Answer: ${answer.substring(0, 500)}...

Generate follow-up questions (one per line):`;

      const completion = await this.generateCompletion({
        prompt,
        model,
        temperature: 0.7,
        maxTokens: 200,
      });

      // Parse follow-up questions from response
      const questions = completion.text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 10 && line.includes('?'))
        .map(line => line.replace(/^\d+\.\s*/, '').trim())
        .slice(0, 3);

      return questions;
    } catch (error) {
      searchLogger.warn('Failed to generate follow-up questions', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Expand query using LLM for better search results
   */
  async expandQuery(query: string, context?: { courseId?: string; previousQueries?: string[] }): Promise<string[]> {
    try {
      const contextInfo = context?.courseId ? `in the context of course ${context.courseId}` : '';
      const previousQueriesInfo = context?.previousQueries?.length 
        ? `Previous related queries: ${context.previousQueries.join(', ')}` 
        : '';

      const prompt = `Generate 3-5 alternative search queries or related terms for: "${query}" ${contextInfo}

${previousQueriesInfo}

Provide variations that would help find relevant educational content. Include synonyms, related concepts, and different phrasings.
Return only the alternative queries, one per line:`;

      const completion = await this.generateCompletion({
        prompt,
        model: config.DEFAULT_RAG_MODEL,
        temperature: 0.5,
        maxTokens: 200,
      });

      const expandedQueries = completion.text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 2)
        .map(line => line.replace(/^\d+\.\s*/, '').replace(/^-\s*/, '').trim())
        .slice(0, 5);

      return expandedQueries;
    } catch (error) {
      searchLogger.warn('Failed to expand query', {
        query,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [query]; // Return original query as fallback
    }
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
      searchLogger.error('LLM Gateway health check failed', error as Error);
      return false;
    }
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<{ embedding: string[]; completion: string[] }> {
    try {
      const response = await this.client.get('/api/v1/models');
      return {
        embedding: response.data.embedding || [config.DEFAULT_EMBEDDING_MODEL],
        completion: response.data.completion || [config.DEFAULT_RAG_MODEL],
      };
    } catch (error) {
      searchLogger.error('Failed to get available models', error as Error);
      return {
        embedding: [config.DEFAULT_EMBEDDING_MODEL],
        completion: [config.DEFAULT_RAG_MODEL],
      };
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
        searchLogger.info('Embedding generation test passed', {
          embeddingLength: embedding.length,
          sampleValues: embedding.slice(0, 3),
        });
      } else {
        searchLogger.error('Embedding generation test failed - invalid embedding format');
      }
      
      return isValid;
    } catch (error) {
      searchLogger.error('Embedding generation test failed', error as Error);
      return false;
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
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
   * Get service statistics
   */
  getStats(): any {
    return {
      baseUrl: this.baseUrl,
      defaultEmbeddingModel: config.DEFAULT_EMBEDDING_MODEL,
      defaultRAGModel: config.DEFAULT_RAG_MODEL,
      ragMaxContexts: config.RAG_MAX_CONTEXTS,
      ragMaxTokens: config.RAG_MAX_TOKENS,
    };
  }
}

// Export singleton instance
export const llmGatewayService = new LLMGatewayService();
