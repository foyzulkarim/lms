import { v4 as uuidv4 } from 'uuid';
import { searchLogger } from '@/utils/logger';
import { llmGatewayService } from '@/services/llm-gateway.service';
import { ragSearchStrategy } from '@/strategies/rag-search.strategy';
import { semanticSearchStrategy } from '@/strategies/semantic-search.strategy';
import { 
  SearchRequest, 
  SearchResponse, 
  ProcessedQuery, 
  SearchResult, 
  SearchStrategy,
  SearchType,
  SearchMetadata,
  QueryProcessingError,
  SearchError 
} from '@/types';
import { searchConfig } from '@/config/environment';
import natural from 'natural';
import { removeStopwords } from 'stopword';

export class MultiStrategySearchService {
  private strategies: SearchStrategy[] = [];

  constructor() {
    // Register search strategies
    this.registerStrategy(ragSearchStrategy);
    this.registerStrategy(semanticSearchStrategy);
    // Note: Full-text search strategy would be added here when implemented
  }

  /**
   * Register a search strategy
   */
  registerStrategy(strategy: SearchStrategy): void {
    this.strategies.push(strategy);
    this.strategies.sort((a, b) => b.priority - a.priority);
    
    searchLogger.info('Search strategy registered', {
      strategyName: strategy.name,
      priority: strategy.priority,
      totalStrategies: this.strategies.length,
    });
  }

  /**
   * Main search method
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    const startTime = Date.now();
    const searchId = uuidv4();

    try {
      searchLogger.info('Starting multi-strategy search', {
        query: request.query,
        type: request.type,
        searchId,
        hasFilters: request.filters ? Object.keys(request.filters).length > 0 : false,
      });

      // Process and validate the query
      const processedQuery = await this.processQuery(request, searchId);

      // Select and execute search strategies
      const selectedStrategies = this.selectStrategies(processedQuery);
      const strategyResults = await this.executeStrategies(selectedStrategies, processedQuery);

      // Fuse and rank results
      const fusedResults = await this.fuseResults(strategyResults, processedQuery);

      // Apply post-processing
      const finalResults = await this.postProcessResults(fusedResults, processedQuery);

      // Generate suggestions if needed
      const suggestions = await this.generateSuggestions(processedQuery, finalResults);

      // Build response metadata
      const metadata = this.buildMetadata(
        searchId,
        selectedStrategies,
        finalResults.length,
        startTime
      );

      const response: SearchResponse = {
        results: finalResults,
        totalResults: finalResults.length,
        searchTime: Date.now() - startTime,
        searchId,
        suggestions,
        metadata,
      };

      // Add RAG response if applicable
      if (processedQuery.strategy === SearchType.RAG || processedQuery.options.includeRAG) {
        const ragResult = finalResults.find(r => r.source.metadata?.ragResponse);
        if (ragResult?.source.metadata?.ragResponse) {
          response.ragResponse = ragResult.source.metadata.ragResponse;
        }
      }

      const duration = Date.now() - startTime;
      
      searchLogger.info('Multi-strategy search completed', {
        query: request.query,
        searchId,
        strategiesUsed: selectedStrategies.map(s => s.name),
        resultsCount: finalResults.length,
        duration,
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      searchLogger.error('Multi-strategy search failed', error as Error, {
        query: request.query,
        searchId,
        duration,
      });

      if (error instanceof QueryProcessingError || error instanceof SearchError) {
        throw error;
      }

      throw new SearchError(
        `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SEARCH_ERROR',
        500,
        { query: request.query, searchId }
      );
    }
  }

  /**
   * Process and validate the search query
   */
  private async processQuery(request: SearchRequest, searchId: string): Promise<ProcessedQuery> {
    try {
      // Validate query length
      if (request.query.length < searchConfig.limits.minQueryLength) {
        throw new QueryProcessingError(
          `Query too short. Minimum length is ${searchConfig.limits.minQueryLength} characters.`
        );
      }

      if (request.query.length > 1000) {
        throw new QueryProcessingError('Query too long. Maximum length is 1000 characters.');
      }

      // Clean and normalize the query
      const cleanedQuery = this.cleanQuery(request.query);
      
      // Tokenize the query
      const tokens = this.tokenizeQuery(cleanedQuery);

      // Expand query if enabled
      let expandedQuery = cleanedQuery;
      if (searchConfig.features.queryExpansion && request.type !== SearchType.RAG) {
        try {
          const expandedQueries = await llmGatewayService.expandQuery(
            cleanedQuery,
            {
              courseId: request.context?.courseId,
              previousQueries: request.context?.previousQueries,
            }
          );
          
          if (expandedQueries.length > 1) {
            expandedQuery = expandedQueries.join(' ');
            searchLogger.info('Query expanded', {
              originalQuery: cleanedQuery,
              expandedQuery,
              searchId,
            });
          }
        } catch (error) {
          searchLogger.warn('Query expansion failed, using original query', {
            query: cleanedQuery,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return {
        originalQuery: request.query,
        expandedQuery,
        tokens,
        strategy: request.type,
        filters: request.filters || {},
        options: {
          page: 1,
          limit: searchConfig.limits.defaultLimit,
          includeHighlights: true,
          includeFacets: false,
          includeRAG: false,
          sortBy: 'relevance',
          sortOrder: 'desc',
          ...request.options,
        },
        context: request.context || {},
        searchId,
      };
    } catch (error) {
      if (error instanceof QueryProcessingError) {
        throw error;
      }
      
      throw new QueryProcessingError(
        `Query processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { query: request.query }
      );
    }
  }

  /**
   * Clean and normalize the query
   */
  private cleanQuery(query: string): string {
    return query
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s\-'"]/g, '') // Remove special characters except quotes and hyphens
      .toLowerCase();
  }

  /**
   * Tokenize the query
   */
  private tokenizeQuery(query: string): string[] {
    // Basic tokenization
    let tokens = query.split(/\s+/).filter(token => token.length > 0);
    
    // Remove stop words
    tokens = removeStopwords(tokens);
    
    // Stem tokens for better matching
    const stemmer = natural.PorterStemmer;
    tokens = tokens.map(token => stemmer.stem(token));
    
    return tokens.filter(token => token.length > 1);
  }

  /**
   * Select appropriate search strategies based on query
   */
  private selectStrategies(query: ProcessedQuery): SearchStrategy[] {
    const selectedStrategies: SearchStrategy[] = [];

    for (const strategy of this.strategies) {
      if (strategy.canHandle(query)) {
        selectedStrategies.push(strategy);
        
        // For RAG queries, only use RAG strategy
        if (query.strategy === SearchType.RAG) {
          break;
        }
        
        // For hybrid search, use multiple strategies
        if (query.strategy === SearchType.HYBRID && selectedStrategies.length >= 2) {
          break;
        }
      }
    }

    if (selectedStrategies.length === 0) {
      throw new SearchError(
        'No suitable search strategy found for query',
        'NO_STRATEGY_ERROR',
        400,
        { queryType: query.strategy }
      );
    }

    return selectedStrategies;
  }

  /**
   * Execute selected search strategies
   */
  private async executeStrategies(
    strategies: SearchStrategy[], 
    query: ProcessedQuery
  ): Promise<SearchResult[][]> {
    const strategyPromises = strategies.map(async (strategy) => {
      const startTime = Date.now();
      
      try {
        const results = await strategy.search(query);
        const duration = Date.now() - startTime;
        
        searchLogger.info('Strategy execution completed', {
          strategyName: strategy.name,
          resultsCount: results.length,
          duration,
          searchId: query.searchId,
        });
        
        return results;
      } catch (error) {
        const duration = Date.now() - startTime;
        searchLogger.error('Strategy execution failed', error as Error, {
          strategyName: strategy.name,
          duration,
          searchId: query.searchId,
        });
        
        // Return empty results instead of failing the entire search
        return [];
      }
    });

    return await Promise.all(strategyPromises);
  }

  /**
   * Fuse results from multiple strategies
   */
  private async fuseResults(
    strategyResults: SearchResult[][], 
    query: ProcessedQuery
  ): Promise<SearchResult[]> {
    // Flatten all results
    const allResults = strategyResults.flat();

    if (allResults.length === 0) {
      return [];
    }

    // For RAG queries, return results as-is (already processed)
    if (query.strategy === SearchType.RAG) {
      return allResults;
    }

    // Remove duplicates based on content ID
    const uniqueResults = this.removeDuplicates(allResults);

    // Apply fusion scoring for hybrid search
    if (query.strategy === SearchType.HYBRID && strategyResults.length > 1) {
      return this.applyHybridScoring(uniqueResults, strategyResults);
    }

    return uniqueResults;
  }

  /**
   * Remove duplicate results
   */
  private removeDuplicates(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    const uniqueResults: SearchResult[] = [];

    for (const result of results) {
      const key = `${result.source.id}-${result.type}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        uniqueResults.push(result);
      } else {
        // If duplicate found, keep the one with higher score
        const existingIndex = uniqueResults.findIndex(r => 
          `${r.source.id}-${r.type}` === key
        );
        
        if (existingIndex >= 0 && result.score > uniqueResults[existingIndex].score) {
          uniqueResults[existingIndex] = result;
        }
      }
    }

    return uniqueResults;
  }

  /**
   * Apply hybrid scoring to combine results from multiple strategies
   */
  private applyHybridScoring(
    results: SearchResult[], 
    strategyResults: SearchResult[][]
  ): SearchResult[] {
    // Create a map to track which strategies found each result
    const resultStrategies = new Map<string, number[]>();

    strategyResults.forEach((strategyResult, strategyIndex) => {
      strategyResult.forEach(result => {
        const key = `${result.source.id}-${result.type}`;
        if (!resultStrategies.has(key)) {
          resultStrategies.set(key, []);
        }
        resultStrategies.get(key)!.push(strategyIndex);
      });
    });

    // Apply hybrid scoring
    return results.map(result => {
      const key = `${result.source.id}-${result.type}`;
      const foundInStrategies = resultStrategies.get(key) || [];
      
      // Boost score if found by multiple strategies
      let hybridScore = result.score;
      if (foundInStrategies.length > 1) {
        hybridScore *= (1 + (foundInStrategies.length - 1) * 0.1); // 10% boost per additional strategy
      }

      return {
        ...result,
        score: Math.min(hybridScore, 1.0),
        relevanceScore: Math.min(hybridScore, 1.0),
      };
    });
  }

  /**
   * Post-process results (sorting, filtering, pagination)
   */
  private async postProcessResults(
    results: SearchResult[], 
    query: ProcessedQuery
  ): Promise<SearchResult[]> {
    let processedResults = [...results];

    // Apply minimum score filter
    if (query.options.minScore) {
      processedResults = processedResults.filter(r => r.score >= query.options.minScore!);
    }

    // Sort results
    processedResults = this.sortResults(processedResults, query);

    // Apply pagination
    const startIndex = (query.options.page - 1) * query.options.limit;
    const endIndex = startIndex + query.options.limit;
    processedResults = processedResults.slice(startIndex, endIndex);

    return processedResults;
  }

  /**
   * Sort results based on options
   */
  private sortResults(results: SearchResult[], query: ProcessedQuery): SearchResult[] {
    const { sortBy, sortOrder } = query.options;
    
    return results.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'relevance':
          comparison = b.relevanceScore - a.relevanceScore;
          break;
        case 'date':
          comparison = b.createdAt.getTime() - a.createdAt.getTime();
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        default:
          comparison = b.score - a.score;
      }
      
      return sortOrder === 'asc' ? -comparison : comparison;
    });
  }

  /**
   * Generate search suggestions
   */
  private async generateSuggestions(
    query: ProcessedQuery, 
    results: SearchResult[]
  ): Promise<string[]> {
    // Only generate suggestions if we have few results
    if (results.length >= 5) {
      return [];
    }

    try {
      // Generate query suggestions using LLM
      const suggestions = await llmGatewayService.expandQuery(
        query.originalQuery,
        {
          courseId: query.context.courseId,
          previousQueries: query.context.previousQueries,
        }
      );

      return suggestions.slice(0, 3);
    } catch (error) {
      searchLogger.warn('Failed to generate suggestions', {
        query: query.originalQuery,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Build response metadata
   */
  private buildMetadata(
    searchId: string,
    strategies: SearchStrategy[],
    resultCount: number,
    startTime: number
  ): SearchMetadata {
    return {
      totalResults: resultCount,
      searchTime: Date.now() - startTime,
      searchId,
      strategies: strategies.map(s => s.name),
      cacheHit: false, // TODO: Implement caching
    };
  }

  /**
   * Get service statistics
   */
  getStats(): any {
    return {
      registeredStrategies: this.strategies.map(s => ({
        name: s.name,
        priority: s.priority,
      })),
      searchConfig: {
        defaultLimit: searchConfig.limits.defaultLimit,
        maxLimit: searchConfig.limits.maxLimit,
        timeout: searchConfig.limits.timeout,
        minQueryLength: searchConfig.limits.minQueryLength,
      },
      features: searchConfig.features,
    };
  }
}

// Export singleton instance
export const multiStrategySearchService = new MultiStrategySearchService();
