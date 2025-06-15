import { ISearchEngine } from '../search-engines/ISearchEngine';
import { SearchCacheService } from '../utils/cache-manager';
import {
  SearchQuery,
  SearchResponse,
  SearchSuggestion,
  SearchableContentType,
  PopularSearch,
  SearchAnalyticsEvent,
  ClickThroughEvent,
} from '../types/search.types';
import { config } from '../config';
import { logger, logSearch, logError } from '../utils/logger';
import CircuitBreaker from 'opossum';

export class SearchService {
  private searchEngine: ISearchEngine;
  private cacheService: SearchCacheService;
  private circuitBreaker: CircuitBreaker<[SearchQuery], SearchResponse>;

  constructor(searchEngine: ISearchEngine, cacheService: SearchCacheService) {
    this.searchEngine = searchEngine;
    this.cacheService = cacheService;

    // Initialize circuit breaker for search operations
    this.circuitBreaker = new CircuitBreaker(this.performSearch.bind(this), {
      timeout: config.circuitBreaker.timeout,
      errorThresholdPercentage: config.circuitBreaker.errorThreshold,
      resetTimeout: config.circuitBreaker.resetTimeout,
      name: 'search-service',
    });

    this.circuitBreaker.on('open', () => {
      logger.warn('Search circuit breaker opened');
    });

    this.circuitBreaker.on('halfOpen', () => {
      logger.info('Search circuit breaker half-open');
    });

    this.circuitBreaker.on('close', () => {
      logger.info('Search circuit breaker closed');
    });

    this.circuitBreaker.fallback(() => this.getFallbackSearchResponse());
  }

  /**
   * Perform a search with caching and circuit breaker
   */
  async search(query: SearchQuery): Promise<SearchResponse> {
    const startTime = Date.now();

    try {
      // Validate query
      this.validateSearchQuery(query);

      // Check cache first
      if (config.features.analytics) {
        const cachedResult = await this.cacheService.getCachedSearchResults(
          query.query,
          query.filters
        );

        if (cachedResult) {
          const duration = Date.now() - startTime;
          logSearch(query.query, cachedResult.total, duration, {
            cached: true,
            userId: query.userId,
          });

          // Track analytics for cached results
          await this.trackSearchAnalytics(query, cachedResult, duration, true);
          return cachedResult;
        }
      }

      // Perform search with circuit breaker
      const result = await this.circuitBreaker.fire(query);
      const duration = Date.now() - startTime;

      // Cache the results
      if (config.features.analytics) {
        await this.cacheService.cacheSearchResults(query.query, query.filters, result);
        await this.cacheService.trackSearchQuery(query.query);
      }

      // Track analytics
      await this.trackSearchAnalytics(query, result, duration, false);

      logSearch(query.query, result.total, duration, {
        cached: false,
        userId: query.userId,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logError('Search service error', error as Error, {
        query: query.query,
        duration,
        userId: query.userId,
      });

      // Return fallback response
      return this.getFallbackSearchResponse(query.query);
    }
  }

  /**
   * Get auto-complete suggestions
   */
  async getSuggestions(
    partial: string,
    type?: SearchableContentType,
    limit: number = 10
  ): Promise<SearchSuggestion[]> {
    try {
      if (!config.features.suggestions) {
        return [];
      }

      // Validate input
      if (!partial || partial.length < 2) {
        return [];
      }

      // Check cache first
      const cachedSuggestions = await this.cacheService.getCachedSuggestions(partial);
      if (cachedSuggestions) {
        logger.debug('Suggestions cache hit', { partial, type });
        return cachedSuggestions.slice(0, limit);
      }

      // Get suggestions from search engine
      const suggestions = await this.searchEngine.suggest(partial, type, limit);

      // Enhance suggestions with popular searches
      const enhancedSuggestions = await this.enhanceSuggestions(suggestions, partial);

      // Cache the suggestions
      await this.cacheService.cacheSuggestions(partial, enhancedSuggestions);

      logger.debug('Suggestions generated', {
        partial,
        type,
        count: enhancedSuggestions.length,
      });

      return enhancedSuggestions.slice(0, limit);
    } catch (error) {
      logError('Suggestions service error', error as Error, { partial, type });
      return [];
    }
  }

  /**
   * Get popular searches
   */
  async getPopularSearches(limit: number = 20): Promise<PopularSearch[]> {
    try {
      // Check cache first
      const cachedPopular = await this.cacheService.getCachedPopularSearches();
      if (cachedPopular) {
        return cachedPopular.slice(0, limit);
      }

      // Get popular searches from analytics
      const popularSearches = await this.calculatePopularSearches(limit);

      // Cache the results
      await this.cacheService.cachePopularSearches(popularSearches);

      return popularSearches;
    } catch (error) {
      logError('Popular searches service error', error as Error);
      return [];
    }
  }

  /**
   * Track click-through event
   */
  async trackClickThrough(event: ClickThroughEvent): Promise<void> {
    try {
      if (!config.features.analytics || !config.analytics.trackClickThrough) {
        return;
      }

      // Store click-through data
      const key = `click_through:${event.searchId}:${event.resultId}`;
      await this.cacheService.set(key, event, 86400); // 24 hours

      // Update click-through metrics
      const metricsKey = `ctr_metrics:${event.resultType}:${event.resultId}`;
      await this.cacheService.incrementWithTtl(metricsKey, 1, 86400);

      logger.debug('Click-through tracked', {
        searchId: event.searchId,
        resultId: event.resultId,
        position: event.position,
      });
    } catch (error) {
      logError('Click-through tracking error', error as Error, event);
    }
  }

  /**
   * Get search analytics
   */
  async getSearchAnalytics(timeframe: string = '24h'): Promise<any> {
    try {
      // This would typically query a dedicated analytics database
      // For now, we'll return basic metrics from cache
      const stats = await this.cacheService.getStats();
      
      return {
        timeframe,
        totalSearches: 0, // Would be calculated from analytics data
        uniqueQueries: 0,
        averageResponseTime: 0,
        cacheHitRate: 0,
        popularQueries: await this.getPopularSearches(10),
        stats,
      };
    } catch (error) {
      logError('Search analytics error', error as Error);
      return null;
    }
  }

  /**
   * Clear search cache
   */
  async clearCache(pattern?: string): Promise<void> {
    try {
      if (pattern) {
        await this.cacheService.deletePattern(pattern);
      } else {
        await this.cacheService.clear();
      }

      logger.info('Search cache cleared', { pattern });
    } catch (error) {
      logError('Clear cache error', error as Error, { pattern });
    }
  }

  /**
   * Get search service health
   */
  async getHealth(): Promise<any> {
    try {
      const [searchEngineHealth, cacheHealth] = await Promise.all([
        this.searchEngine.health(),
        this.cacheService.exists('health_check'),
      ]);

      return {
        searchEngine: searchEngineHealth,
        cache: cacheHealth,
        circuitBreaker: {
          state: this.circuitBreaker.stats.state,
          failures: this.circuitBreaker.stats.failures,
          successes: this.circuitBreaker.stats.successes,
        },
      };
    } catch (error) {
      logError('Health check error', error as Error);
      return {
        searchEngine: false,
        cache: false,
        circuitBreaker: {
          state: 'unknown',
          failures: 0,
          successes: 0,
        },
      };
    }
  }

  // Private methods

  /**
   * Perform the actual search operation
   */
  private async performSearch(query: SearchQuery): Promise<SearchResponse> {
    return await this.searchEngine.search(query);
  }

  /**
   * Validate search query
   */
  private validateSearchQuery(query: SearchQuery): void {
    if (!query.query || typeof query.query !== 'string') {
      throw new Error('Search query is required and must be a string');
    }

    if (query.query.length > 500) {
      throw new Error('Search query is too long (max 500 characters)');
    }

    if (query.pagination?.size && query.pagination.size > config.search.maxResults) {
      throw new Error(`Page size cannot exceed ${config.search.maxResults}`);
    }
  }

  /**
   * Get fallback search response when search engine is unavailable
   */
  private getFallbackSearchResponse(query?: string): SearchResponse {
    return {
      query: query || '',
      total: 0,
      took: 0,
      results: [],
      pagination: {
        from: 0,
        size: 20,
        hasNext: false,
        hasPrev: false,
      },
    };
  }

  /**
   * Track search analytics
   */
  private async trackSearchAnalytics(
    query: SearchQuery,
    result: SearchResponse,
    duration: number,
    cached: boolean
  ): Promise<void> {
    try {
      if (!config.features.analytics || !config.analytics.trackSearchQueries) {
        return;
      }

      const event: SearchAnalyticsEvent = {
        id: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: query.userId,
        query: query.query,
        filters: query.filters,
        resultsCount: result.total,
        searchTime: duration,
        timestamp: new Date(),
      };

      // Store analytics event (in a real implementation, this would go to an analytics database)
      const key = `analytics:${event.id}`;
      await this.cacheService.set(key, event, 86400 * 7); // 7 days

      logger.debug('Search analytics tracked', {
        eventId: event.id,
        query: query.query,
        resultsCount: result.total,
        cached,
      });
    } catch (error) {
      logError('Search analytics tracking error', error as Error);
    }
  }

  /**
   * Enhance suggestions with popular searches and personalization
   */
  private async enhanceSuggestions(
    suggestions: SearchSuggestion[],
    partial: string
  ): Promise<SearchSuggestion[]> {
    try {
      // Add popular searches that match the partial query
      const popularSearches = await this.getPopularSearches(50);
      const matchingPopular = popularSearches
        .filter(search => search.query.toLowerCase().includes(partial.toLowerCase()))
        .map(search => ({
          text: search.query,
          type: 'query' as const,
          score: search.count / 100, // Normalize score
          metadata: { count: search.count },
        }));

      // Combine and deduplicate suggestions
      const combined = [...suggestions, ...matchingPopular];
      const unique = combined.filter((suggestion, index, self) =>
        index === self.findIndex(s => s.text.toLowerCase() === suggestion.text.toLowerCase())
      );

      // Sort by score (descending)
      return unique.sort((a, b) => b.score - a.score);
    } catch (error) {
      logError('Enhance suggestions error', error as Error);
      return suggestions;
    }
  }

  /**
   * Calculate popular searches from analytics data
   */
  private async calculatePopularSearches(limit: number): Promise<PopularSearch[]> {
    try {
      // In a real implementation, this would query analytics data
      // For now, we'll return mock data
      const mockPopular: PopularSearch[] = [
        { query: 'javascript', count: 150, trend: 'up' },
        { query: 'python', count: 120, trend: 'stable' },
        { query: 'react', count: 100, trend: 'up' },
        { query: 'nodejs', count: 80, trend: 'down' },
        { query: 'typescript', count: 75, trend: 'up' },
      ];

      return mockPopular.slice(0, limit);
    } catch (error) {
      logError('Calculate popular searches error', error as Error);
      return [];
    }
  }
}

export default SearchService;
