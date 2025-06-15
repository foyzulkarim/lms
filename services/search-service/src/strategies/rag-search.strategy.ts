import { v4 as uuidv4 } from 'uuid';
import { searchLogger } from '@/utils/logger';
import { llmGatewayService } from '@/services/llm-gateway.service';
import { vectorSearchService } from '@/services/vector-search.service';
import { 
  SearchStrategy, 
  ProcessedQuery, 
  SearchResult, 
  RAGResponse, 
  RAGContext,
  ContentType,
  RAGError 
} from '@/types';
import { config } from '@/config/environment';

export class RAGSearchStrategy implements SearchStrategy {
  name = 'RAG Search';
  priority = 10; // Highest priority for RAG queries

  canHandle(query: ProcessedQuery): boolean {
    return query.strategy === 'rag' || query.options.includeRAG === true;
  }

  async search(query: ProcessedQuery): Promise<SearchResult[]> {
    const startTime = Date.now();
    
    try {
      searchLogger.info('Starting RAG search', {
        query: query.originalQuery,
        searchId: query.searchId,
      });

      // Generate embedding for the query
      const queryEmbedding = await llmGatewayService.generateEmbedding(query.expandedQuery);

      // Retrieve relevant contexts
      const contexts = await vectorSearchService.getRAGContexts(queryEmbedding, {
        limit: config.RAG_MAX_CONTEXTS,
        threshold: 0.7,
        filters: query.filters,
        maxTokens: config.RAG_CONTEXT_MAX_TOKENS,
      });

      if (contexts.length === 0) {
        searchLogger.warn('No relevant contexts found for RAG query', {
          query: query.originalQuery,
          searchId: query.searchId,
        });

        return [{
          id: uuidv4(),
          type: ContentType.CONTENT,
          title: 'No Relevant Information Found',
          description: 'I couldn\'t find relevant information to answer your question.',
          content: 'I don\'t have enough relevant information in the course materials to provide a comprehensive answer to your question. You might want to try rephrasing your question or asking about a different topic.',
          highlights: [],
          score: 0.1,
          relevanceScore: 0.1,
          source: {
            type: ContentType.CONTENT,
            id: 'rag-no-results',
            url: '',
            metadata: { ragResponse: true, noResults: true },
          },
          tags: ['rag', 'no-results'],
          categories: ['ai-response'],
          createdAt: new Date(),
          updatedAt: new Date(),
        }];
      }

      // Generate RAG response
      const ragResponse = await this.generateRAGResponse(query.originalQuery, contexts);

      // Create search result from RAG response
      const ragResult: SearchResult = {
        id: uuidv4(),
        type: ContentType.CONTENT,
        title: 'AI-Generated Answer',
        description: this.extractDescription(ragResponse.answer),
        content: ragResponse.answer,
        highlights: this.extractHighlights(ragResponse.answer, query.originalQuery),
        score: ragResponse.confidence,
        relevanceScore: ragResponse.confidence,
        source: {
          type: ContentType.CONTENT,
          id: 'rag-response',
          url: '',
          metadata: { 
            ragResponse: ragResponse,
            sources: ragResponse.sources,
            model: ragResponse.model,
          },
        },
        tags: ['rag', 'ai-generated', 'answer'],
        categories: ['ai-response'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Add source results as additional search results
      const sourceResults = this.createSourceResults(ragResponse.sources);

      const duration = Date.now() - startTime;
      
      searchLogger.info('RAG search completed', {
        query: query.originalQuery,
        searchId: query.searchId,
        contextCount: contexts.length,
        confidence: ragResponse.confidence,
        duration,
      });

      return [ragResult, ...sourceResults];
    } catch (error) {
      const duration = Date.now() - startTime;
      searchLogger.error('RAG search failed', error as Error, {
        query: query.originalQuery,
        searchId: query.searchId,
        duration,
      });

      // Return error result instead of throwing
      return [{
        id: uuidv4(),
        type: ContentType.CONTENT,
        title: 'Search Error',
        description: 'An error occurred while processing your question.',
        content: 'I encountered an error while trying to answer your question. Please try again or rephrase your question.',
        highlights: [],
        score: 0.1,
        relevanceScore: 0.1,
        source: {
          type: ContentType.CONTENT,
          id: 'rag-error',
          url: '',
          metadata: { ragResponse: true, error: true },
        },
        tags: ['rag', 'error'],
        categories: ['ai-response'],
        createdAt: new Date(),
        updatedAt: new Date(),
      }];
    }
  }

  /**
   * Generate RAG response using LLM Gateway
   */
  private async generateRAGResponse(question: string, contexts: RAGContext[]): Promise<RAGResponse> {
    try {
      const response = await llmGatewayService.generateRAGResponse(
        question,
        contexts.map(ctx => ({ text: ctx.text, metadata: ctx.metadata })),
        {
          model: config.DEFAULT_RAG_MODEL,
          temperature: config.RAG_TEMPERATURE,
          maxTokens: config.RAG_MAX_TOKENS,
          includeSourcesInAnswer: true,
        }
      );

      return {
        answer: response.answer,
        sources: contexts.map((ctx, index) => ({
          contentId: ctx.metadata.contentId,
          chunkId: ctx.metadata.chunkId,
          text: ctx.text,
          relevanceScore: ctx.relevanceScore,
          metadata: {
            title: ctx.metadata.title,
            courseId: ctx.metadata.courseId,
            moduleId: ctx.metadata.moduleId,
            page: ctx.metadata.page,
            timestamp: ctx.metadata.timestamp,
            section: ctx.metadata.section,
          },
        })),
        confidence: response.confidence,
        model: config.DEFAULT_RAG_MODEL,
        reasoning: response.reasoning,
        followUpQuestions: response.followUpQuestions,
      };
    } catch (error) {
      searchLogger.error('Failed to generate RAG response', error as Error, {
        question: question.substring(0, 100),
        contextCount: contexts.length,
      });
      
      throw new RAGError(
        `Failed to generate RAG response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { question, contextCount: contexts.length }
      );
    }
  }

  /**
   * Create search results from RAG sources
   */
  private createSourceResults(sources: RAGResponse['sources']): SearchResult[] {
    return sources.slice(0, 5).map((source, index) => ({
      id: uuidv4(),
      type: ContentType.CONTENT,
      title: source.metadata.title,
      description: this.truncateText(source.text, 200),
      content: source.text,
      highlights: [],
      score: source.relevanceScore,
      relevanceScore: source.relevanceScore,
      source: {
        type: ContentType.CONTENT,
        id: source.contentId,
        url: this.buildContentUrl(source),
        metadata: {
          chunkId: source.chunkId,
          section: source.metadata.section,
          page: source.metadata.page,
          timestamp: source.metadata.timestamp,
        },
      },
      courseId: source.metadata.courseId,
      moduleId: source.metadata.moduleId,
      tags: ['source', 'rag-context'],
      categories: ['supporting-content'],
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  /**
   * Extract description from RAG answer
   */
  private extractDescription(answer: string): string {
    // Take first sentence or first 200 characters
    const firstSentence = answer.split('.')[0];
    if (firstSentence.length > 10 && firstSentence.length < 200) {
      return firstSentence + '.';
    }
    return this.truncateText(answer, 200);
  }

  /**
   * Extract highlights from RAG answer based on query
   */
  private extractHighlights(answer: string, query: string): string[] {
    const highlights: string[] = [];
    const queryWords = query.toLowerCase().split(/\s+/);
    const sentences = answer.split(/[.!?]+/);

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      const hasQueryWords = queryWords.some(word => 
        word.length > 2 && lowerSentence.includes(word)
      );

      if (hasQueryWords && sentence.trim().length > 20) {
        highlights.push(sentence.trim());
        if (highlights.length >= 3) break;
      }
    }

    return highlights;
  }

  /**
   * Build content URL from source metadata
   */
  private buildContentUrl(source: RAGResponse['sources'][0]): string {
    const baseUrl = '/courses';
    
    if (source.metadata.courseId && source.metadata.moduleId) {
      return `${baseUrl}/${source.metadata.courseId}/modules/${source.metadata.moduleId}/content/${source.contentId}`;
    } else if (source.metadata.courseId) {
      return `${baseUrl}/${source.metadata.courseId}/content/${source.contentId}`;
    }
    
    return `/content/${source.contentId}`;
  }

  /**
   * Truncate text to specified length
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  }

  /**
   * Validate RAG response quality
   */
  private validateRAGResponse(response: RAGResponse): boolean {
    // Check if response is meaningful
    if (response.answer.length < 20) {
      return false;
    }

    // Check confidence threshold
    if (response.confidence < 0.3) {
      return false;
    }

    // Check if response contains actual content (not just "I don't know")
    const lowQualityPhrases = [
      'i don\'t know',
      'i cannot answer',
      'insufficient information',
      'not enough context',
      'unable to determine',
    ];

    const lowerAnswer = response.answer.toLowerCase();
    const hasLowQualityPhrase = lowQualityPhrases.some(phrase => 
      lowerAnswer.includes(phrase)
    );

    return !hasLowQualityPhrase;
  }

  /**
   * Enhance RAG response with additional context
   */
  private async enhanceRAGResponse(
    response: RAGResponse, 
    originalQuery: string
  ): Promise<RAGResponse> {
    try {
      // Generate follow-up questions if not already present
      if (!response.followUpQuestions || response.followUpQuestions.length === 0) {
        const followUpQuestions = await this.generateFollowUpQuestions(
          originalQuery, 
          response.answer
        );
        response.followUpQuestions = followUpQuestions;
      }

      // Add reasoning if not present
      if (!response.reasoning) {
        response.reasoning = `Answer generated from ${response.sources.length} relevant sources with ${Math.round(response.confidence * 100)}% confidence.`;
      }

      return response;
    } catch (error) {
      searchLogger.warn('Failed to enhance RAG response', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return response;
    }
  }

  /**
   * Generate follow-up questions
   */
  private async generateFollowUpQuestions(
    originalQuery: string, 
    answer: string
  ): Promise<string[]> {
    try {
      const prompt = `Based on this Q&A, suggest 2-3 relevant follow-up questions:

Question: ${originalQuery}
Answer: ${answer.substring(0, 300)}...

Follow-up questions:`;

      const completion = await llmGatewayService.generateCompletion({
        prompt,
        model: config.DEFAULT_RAG_MODEL,
        temperature: 0.7,
        maxTokens: 150,
      });

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
}

// Export singleton instance
export const ragSearchStrategy = new RAGSearchStrategy();
