import { v4 as uuidv4 } from 'uuid';
import { searchLogger } from '@/utils/logger';
import { llmGatewayService } from '@/services/llm-gateway.service';
import { vectorSearchService } from '@/services/vector-search.service';
import { 
  SearchStrategy, 
  ProcessedQuery, 
  SearchResult, 
  ContentType,
  VectorSearchError 
} from '@/types';
import { searchConfig } from '@/config/environment';

export class SemanticSearchStrategy implements SearchStrategy {
  name = 'Semantic Search';
  priority = 8; // High priority for semantic queries

  canHandle(query: ProcessedQuery): boolean {
    return query.strategy === 'semantic' || 
           query.strategy === 'hybrid' ||
           (query.strategy === 'rag' && query.options.includeRAG !== true);
  }

  async search(query: ProcessedQuery): Promise<SearchResult[]> {
    const startTime = Date.now();
    
    try {
      searchLogger.info('Starting semantic search', {
        query: query.originalQuery,
        searchId: query.searchId,
        expandedQuery: query.expandedQuery,
      });

      // Generate embedding for the query
      const queryEmbedding = await llmGatewayService.generateEmbedding(query.expandedQuery);

      // Perform vector similarity search
      const vectorResults = await vectorSearchService.similaritySearch({
        vector: queryEmbedding,
        limit: query.options.limit || searchConfig.limits.defaultLimit,
        threshold: query.options.minScore || searchConfig.vector.similarityThreshold,
        filters: query.filters,
      });

      // Convert vector results to search results
      const searchResults = await this.convertVectorResultsToSearchResults(vectorResults, query);

      const duration = Date.now() - startTime;
      
      searchLogger.info('Semantic search completed', {
        query: query.originalQuery,
        searchId: query.searchId,
        resultsCount: searchResults.length,
        duration,
        averageSimilarity: vectorResults.length > 0 
          ? vectorResults.reduce((sum, r) => sum + r.similarity, 0) / vectorResults.length 
          : 0,
      });

      return searchResults;
    } catch (error) {
      const duration = Date.now() - startTime;
      searchLogger.error('Semantic search failed', error as Error, {
        query: query.originalQuery,
        searchId: query.searchId,
        duration,
      });

      if (error instanceof VectorSearchError) {
        throw error;
      }

      throw new VectorSearchError(
        `Semantic search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { query: query.originalQuery }
      );
    }
  }

  /**
   * Convert vector search results to search results
   */
  private async convertVectorResultsToSearchResults(
    vectorResults: any[], 
    query: ProcessedQuery
  ): Promise<SearchResult[]> {
    const searchResults: SearchResult[] = [];

    for (const vectorResult of vectorResults) {
      try {
        const searchResult = await this.createSearchResultFromVector(vectorResult, query);
        if (searchResult) {
          searchResults.push(searchResult);
        }
      } catch (error) {
        searchLogger.warn('Failed to convert vector result to search result', {
          vectorResultId: vectorResult.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Continue processing other results
      }
    }

    return searchResults;
  }

  /**
   * Create search result from vector result
   */
  private async createSearchResultFromVector(
    vectorResult: any, 
    query: ProcessedQuery
  ): Promise<SearchResult | null> {
    try {
      // Extract metadata
      const metadata = vectorResult.metadata || {};
      const contentType = this.mapContentType(metadata.contentType || 'content');
      
      // Generate highlights from the text
      const highlights = this.generateHighlights(vectorResult.text, query.tokens);

      // Build content URL
      const contentUrl = this.buildContentUrl(vectorResult, metadata);

      const searchResult: SearchResult = {
        id: uuidv4(),
        type: contentType,
        title: metadata.title || this.extractTitle(vectorResult.text),
        description: this.extractDescription(vectorResult.text),
        content: vectorResult.text,
        highlights,
        score: vectorResult.similarity,
        relevanceScore: vectorResult.similarity,
        semanticScore: vectorResult.similarity,
        source: {
          type: contentType,
          id: vectorResult.contentId,
          url: contentUrl,
          thumbnail: metadata.thumbnail,
          metadata: {
            chunkId: vectorResult.chunkId,
            section: metadata.section,
            page: metadata.page,
            timestamp: metadata.timestamp,
            embeddingModel: metadata.embeddingModel,
          },
        },
        courseId: metadata.courseId,
        moduleId: metadata.moduleId,
        tags: this.extractTags(vectorResult.text, metadata),
        categories: metadata.categories || ['semantic-result'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return searchResult;
    } catch (error) {
      searchLogger.error('Failed to create search result from vector', error as Error, {
        vectorResultId: vectorResult.id,
        contentId: vectorResult.contentId,
      });
      return null;
    }
  }

  /**
   * Map content type from metadata
   */
  private mapContentType(contentType: string): ContentType {
    const typeMap: Record<string, ContentType> = {
      'course': ContentType.COURSE,
      'module': ContentType.MODULE,
      'content': ContentType.CONTENT,
      'file': ContentType.FILE,
      'discussion': ContentType.DISCUSSION,
      'assignment': ContentType.ASSIGNMENT,
      'quiz': ContentType.QUIZ,
      'announcement': ContentType.ANNOUNCEMENT,
    };

    return typeMap[contentType.toLowerCase()] || ContentType.CONTENT;
  }

  /**
   * Generate highlights from text based on query tokens
   */
  private generateHighlights(text: string, queryTokens: string[]): string[] {
    const highlights: string[] = [];
    const sentences = text.split(/[.!?]+/);
    
    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      const matchingTokens = queryTokens.filter(token => 
        token.length > 2 && lowerSentence.includes(token.toLowerCase())
      );

      if (matchingTokens.length > 0 && sentence.trim().length > 20) {
        // Highlight matching tokens in the sentence
        let highlightedSentence = sentence.trim();
        for (const token of matchingTokens) {
          const regex = new RegExp(`\\b${token}\\b`, 'gi');
          highlightedSentence = highlightedSentence.replace(regex, `<em>${token}</em>`);
        }
        highlights.push(highlightedSentence);
        
        if (highlights.length >= 3) break;
      }
    }

    // If no highlights found, create semantic highlights
    if (highlights.length === 0) {
      const semanticHighlight = this.createSemanticHighlight(text);
      if (semanticHighlight) {
        highlights.push(semanticHighlight);
      }
    }

    return highlights;
  }

  /**
   * Create semantic highlight when no exact matches found
   */
  private createSemanticHighlight(text: string): string | null {
    // Take the most relevant sentence (usually the first one in a chunk)
    const sentences = text.split(/[.!?]+/);
    const relevantSentence = sentences.find(s => s.trim().length > 30);
    
    if (relevantSentence) {
      return relevantSentence.trim() + '.';
    }
    
    return null;
  }

  /**
   * Extract title from text
   */
  private extractTitle(text: string): string {
    // Try to find a title-like sentence (first sentence, or sentence with title case)
    const sentences = text.split(/[.!?]+/);
    
    for (const sentence of sentences.slice(0, 3)) {
      const trimmed = sentence.trim();
      if (trimmed.length > 10 && trimmed.length < 100) {
        // Check if it looks like a title (starts with capital, reasonable length)
        if (/^[A-Z]/.test(trimmed)) {
          return trimmed;
        }
      }
    }

    // Fallback: use first 50 characters
    return text.substring(0, 50).trim() + (text.length > 50 ? '...' : '');
  }

  /**
   * Extract description from text
   */
  private extractDescription(text: string): string {
    // Take first 200 characters, but try to end at a sentence boundary
    if (text.length <= 200) {
      return text;
    }

    const truncated = text.substring(0, 200);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );

    if (lastSentenceEnd > 100) {
      return truncated.substring(0, lastSentenceEnd + 1);
    }

    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 150) {
      return truncated.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }

  /**
   * Extract tags from text and metadata
   */
  private extractTags(text: string, metadata: any): string[] {
    const tags: string[] = ['semantic'];

    // Add metadata tags
    if (metadata.tags && Array.isArray(metadata.tags)) {
      tags.push(...metadata.tags);
    }

    // Add content type tag
    if (metadata.contentType) {
      tags.push(metadata.contentType);
    }

    // Add language tag
    if (metadata.language) {
      tags.push(metadata.language);
    }

    // Extract topic tags from text (simple keyword extraction)
    const topicKeywords = this.extractTopicKeywords(text);
    tags.push(...topicKeywords);

    // Remove duplicates and return
    return [...new Set(tags)];
  }

  /**
   * Extract topic keywords from text
   */
  private extractTopicKeywords(text: string): string[] {
    // Simple keyword extraction - look for capitalized words and common academic terms
    const keywords: string[] = [];
    
    // Find capitalized words (potential topics/concepts)
    const capitalizedWords = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    
    // Filter and clean capitalized words
    const filteredWords = capitalizedWords
      .filter(word => word.length > 3 && word.length < 30)
      .filter(word => !['The', 'This', 'That', 'These', 'Those', 'When', 'Where', 'What', 'How', 'Why'].includes(word))
      .slice(0, 5);

    keywords.push(...filteredWords.map(word => word.toLowerCase()));

    return keywords;
  }

  /**
   * Build content URL from vector result and metadata
   */
  private buildContentUrl(vectorResult: any, metadata: any): string {
    const baseUrl = '/courses';
    
    if (metadata.courseId && metadata.moduleId) {
      return `${baseUrl}/${metadata.courseId}/modules/${metadata.moduleId}/content/${vectorResult.contentId}`;
    } else if (metadata.courseId) {
      return `${baseUrl}/${metadata.courseId}/content/${vectorResult.contentId}`;
    }
    
    return `/content/${vectorResult.contentId}`;
  }

  /**
   * Calculate semantic relevance score
   */
  private calculateSemanticRelevance(
    vectorResult: any, 
    query: ProcessedQuery
  ): number {
    let relevanceScore = vectorResult.similarity;

    // Boost score for exact token matches
    const queryTokens = query.tokens.map(t => t.toLowerCase());
    const textTokens = vectorResult.text.toLowerCase().split(/\s+/);
    const exactMatches = queryTokens.filter(qt => textTokens.includes(qt));
    
    if (exactMatches.length > 0) {
      const matchRatio = exactMatches.length / queryTokens.length;
      relevanceScore += matchRatio * 0.1; // Small boost for exact matches
    }

    // Boost score for content in user's current course
    if (query.context.courseId && vectorResult.metadata?.courseId === query.context.courseId) {
      relevanceScore += 0.05;
    }

    // Boost score for recent content
    if (vectorResult.metadata?.createdAt) {
      const daysSinceCreation = (Date.now() - new Date(vectorResult.metadata.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCreation < 30) {
        relevanceScore += 0.02; // Small boost for recent content
      }
    }

    return Math.min(relevanceScore, 1.0); // Cap at 1.0
  }

  /**
   * Filter results by quality
   */
  private filterResultsByQuality(results: SearchResult[]): SearchResult[] {
    return results.filter(result => {
      // Filter out very short content
      if (result.content && result.content.length < 50) {
        return false;
      }

      // Filter out very low similarity scores
      if (result.semanticScore && result.semanticScore < 0.3) {
        return false;
      }

      return true;
    });
  }

  /**
   * Sort results by relevance
   */
  private sortResultsByRelevance(results: SearchResult[], query: ProcessedQuery): SearchResult[] {
    return results.sort((a, b) => {
      // Primary sort by semantic score
      const scoreDiff = (b.semanticScore || 0) - (a.semanticScore || 0);
      if (Math.abs(scoreDiff) > 0.05) {
        return scoreDiff;
      }

      // Secondary sort by content length (prefer more substantial content)
      const lengthDiff = (b.content?.length || 0) - (a.content?.length || 0);
      if (Math.abs(lengthDiff) > 100) {
        return lengthDiff > 0 ? 1 : -1;
      }

      // Tertiary sort by creation date (prefer newer content)
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }
}

// Export singleton instance
export const semanticSearchStrategy = new SemanticSearchStrategy();
