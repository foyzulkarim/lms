import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { SearchService } from '../services/SearchService';
import { SearchQuery, SearchableContentType, ClickThroughEvent } from '../types/search.types';
import { config } from '../config';
import { logger } from '../utils/logger';

// Request/Response schemas
const SearchQuerySchema = Type.Object({
  q: Type.String({ minLength: 1, maxLength: 500 }),
  types: Type.Optional(Type.Array(Type.Union([
    Type.Literal('course'),
    Type.Literal('user'),
    Type.Literal('assessment'),
    Type.Literal('file'),
    Type.Literal('all'),
  ]))),
  categories: Type.Optional(Type.Array(Type.String())),
  subcategories: Type.Optional(Type.Array(Type.String())),
  difficulty: Type.Optional(Type.Array(Type.String())),
  instructors: Type.Optional(Type.Array(Type.String())),
  tags: Type.Optional(Type.Array(Type.String())),
  language: Type.Optional(Type.Array(Type.String())),
  minRating: Type.Optional(Type.Number({ minimum: 0, maximum: 5 })),
  maxRating: Type.Optional(Type.Number({ minimum: 0, maximum: 5 })),
  minPrice: Type.Optional(Type.Number({ minimum: 0 })),
  maxPrice: Type.Optional(Type.Number({ minimum: 0 })),
  dateFrom: Type.Optional(Type.String({ format: 'date' })),
  dateTo: Type.Optional(Type.String({ format: 'date' })),
  from: Type.Optional(Type.Number({ minimum: 0 })),
  size: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  sortBy: Type.Optional(Type.Union([
    Type.Literal('relevance'),
    Type.Literal('date'),
    Type.Literal('rating'),
    Type.Literal('title'),
    Type.Literal('popularity'),
    Type.Literal('price'),
    Type.Literal('duration'),
  ])),
  sortOrder: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')])),
});

const SuggestionsQuerySchema = Type.Object({
  q: Type.String({ minLength: 1, maxLength: 100 }),
  type: Type.Optional(Type.Union([
    Type.Literal('course'),
    Type.Literal('user'),
    Type.Literal('assessment'),
    Type.Literal('file'),
  ])),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
});

const ClickThroughSchema = Type.Object({
  searchId: Type.String(),
  resultId: Type.String(),
  resultType: Type.Union([
    Type.Literal('course'),
    Type.Literal('user'),
    Type.Literal('assessment'),
    Type.Literal('file'),
  ]),
  position: Type.Number({ minimum: 0 }),
});

const PopularSearchesQuerySchema = Type.Object({
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
  timeframe: Type.Optional(Type.Union([
    Type.Literal('1h'),
    Type.Literal('24h'),
    Type.Literal('7d'),
    Type.Literal('30d'),
  ])),
});

// Response schemas
const SearchResponseSchema = Type.Object({
  success: Type.Boolean(),
  data: Type.Object({
    query: Type.String(),
    total: Type.Number(),
    took: Type.Number(),
    results: Type.Array(Type.Object({
      id: Type.String(),
      type: Type.String(),
      title: Type.String(),
      description: Type.Optional(Type.String()),
      url: Type.Optional(Type.String()),
      thumbnailUrl: Type.Optional(Type.String()),
      score: Type.Number(),
      highlights: Type.Optional(Type.Array(Type.Object({
        field: Type.String(),
        fragments: Type.Array(Type.String()),
      }))),
      metadata: Type.Object({}),
    })),
    facets: Type.Optional(Type.Object({
      categories: Type.Array(Type.Object({
        key: Type.String(),
        count: Type.Number(),
      })),
      difficulties: Type.Array(Type.Object({
        key: Type.String(),
        count: Type.Number(),
      })),
      instructors: Type.Array(Type.Object({
        key: Type.String(),
        count: Type.Number(),
      })),
      tags: Type.Array(Type.Object({
        key: Type.String(),
        count: Type.Number(),
      })),
      types: Type.Array(Type.Object({
        key: Type.String(),
        count: Type.Number(),
      })),
      languages: Type.Array(Type.Object({
        key: Type.String(),
        count: Type.Number(),
      })),
      priceRanges: Type.Array(Type.Object({
        key: Type.String(),
        count: Type.Number(),
      })),
      ratings: Type.Array(Type.Object({
        key: Type.String(),
        count: Type.Number(),
      })),
    })),
    pagination: Type.Object({
      from: Type.Number(),
      size: Type.Number(),
      hasNext: Type.Boolean(),
      hasPrev: Type.Boolean(),
    }),
  }),
});

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  const searchService = fastify.searchService as SearchService;

  // Main search endpoint
  fastify.get('/search', {
    schema: {
      description: 'Search for content across the LMS platform',
      tags: ['Search'],
      querystring: SearchQuerySchema,
      response: {
        200: SearchResponseSchema,
      },
    },
    preHandler: [fastify.optionalAuthenticate],
  }, async (request: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) => {
    try {
      const query = request.query;
      const user = (request as any).user;

      // Build search query
      const searchQuery: SearchQuery = {
        query: query.q,
        types: query.types as SearchableContentType[],
        filters: {
          categories: query.categories,
          subcategories: query.subcategories,
          difficulty: query.difficulty,
          instructors: query.instructors,
          tags: query.tags,
          language: query.language,
          rating: query.minRating || query.maxRating ? {
            min: query.minRating,
            max: query.maxRating,
          } : undefined,
          priceRange: query.minPrice !== undefined || query.maxPrice !== undefined ? {
            min: query.minPrice,
            max: query.maxPrice,
          } : undefined,
          dateRange: query.dateFrom || query.dateTo ? {
            start: query.dateFrom ? new Date(query.dateFrom) : undefined,
            end: query.dateTo ? new Date(query.dateTo) : undefined,
          } : undefined,
        },
        sort: query.sortBy ? {
          field: query.sortBy,
          order: query.sortOrder || 'desc',
        } : undefined,
        pagination: {
          from: query.from || 0,
          size: Math.min(query.size || 20, config.search.resultsLimit),
        },
        userId: user?.id,
        requestId: (request as any).id,
      };

      // Perform search
      const results = await searchService.search(searchQuery);

      reply.send({
        success: true,
        data: results,
      });
    } catch (error) {
      logger.error('Search endpoint error:', error);
      reply.code(500).send({
        success: false,
        error: {
          code: 'SEARCH_ERROR',
          message: 'Search operation failed',
        },
      });
    }
  });

  // Auto-complete suggestions endpoint
  fastify.get('/suggestions', {
    schema: {
      description: 'Get auto-complete suggestions for search queries',
      tags: ['Search'],
      querystring: SuggestionsQuerySchema,
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          data: Type.Array(Type.Object({
            text: Type.String(),
            type: Type.String(),
            score: Type.Number(),
            metadata: Type.Optional(Type.Object({})),
          })),
        }),
      },
    },
    preHandler: [fastify.optionalAuthenticate],
  }, async (request: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) => {
    try {
      const { q, type, limit } = request.query;

      const suggestions = await searchService.getSuggestions(
        q,
        type as SearchableContentType,
        limit || 10
      );

      reply.send({
        success: true,
        data: suggestions,
      });
    } catch (error) {
      logger.error('Suggestions endpoint error:', error);
      reply.code(500).send({
        success: false,
        error: {
          code: 'SUGGESTIONS_ERROR',
          message: 'Suggestions operation failed',
        },
      });
    }
  });

  // Popular searches endpoint
  fastify.get('/popular', {
    schema: {
      description: 'Get popular search queries',
      tags: ['Search'],
      querystring: PopularSearchesQuerySchema,
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          data: Type.Array(Type.Object({
            query: Type.String(),
            count: Type.Number(),
            trend: Type.Union([
              Type.Literal('up'),
              Type.Literal('down'),
              Type.Literal('stable'),
            ]),
            categories: Type.Optional(Type.Array(Type.String())),
          })),
        }),
      },
    },
  }, async (request: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) => {
    try {
      const { limit } = request.query;

      const popularSearches = await searchService.getPopularSearches(limit || 20);

      reply.send({
        success: true,
        data: popularSearches,
      });
    } catch (error) {
      logger.error('Popular searches endpoint error:', error);
      reply.code(500).send({
        success: false,
        error: {
          code: 'POPULAR_SEARCHES_ERROR',
          message: 'Popular searches operation failed',
        },
      });
    }
  });

  // Click-through tracking endpoint
  fastify.post('/click-through', {
    schema: {
      description: 'Track click-through events for search results',
      tags: ['Search'],
      body: ClickThroughSchema,
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          message: Type.String(),
        }),
      },
    },
    preHandler: [fastify.optionalAuthenticate],
  }, async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const clickEvent: ClickThroughEvent = {
        ...request.body,
        userId: user?.id,
        timestamp: new Date(),
      };

      await searchService.trackClickThrough(clickEvent);

      reply.send({
        success: true,
        message: 'Click-through event tracked successfully',
      });
    } catch (error) {
      logger.error('Click-through tracking error:', error);
      reply.code(500).send({
        success: false,
        error: {
          code: 'CLICK_THROUGH_ERROR',
          message: 'Click-through tracking failed',
        },
      });
    }
  });

  // Search analytics endpoint (admin only)
  fastify.get('/analytics', {
    schema: {
      description: 'Get search analytics data',
      tags: ['Search', 'Admin'],
      querystring: Type.Object({
        timeframe: Type.Optional(Type.String()),
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          data: Type.Object({}),
        }),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireAdmin],
  }, async (request: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) => {
    try {
      const { timeframe } = request.query;

      const analytics = await searchService.getSearchAnalytics(timeframe);

      reply.send({
        success: true,
        data: analytics,
      });
    } catch (error) {
      logger.error('Search analytics endpoint error:', error);
      reply.code(500).send({
        success: false,
        error: {
          code: 'ANALYTICS_ERROR',
          message: 'Analytics operation failed',
        },
      });
    }
  });

  // Clear cache endpoint (admin only)
  fastify.delete('/cache', {
    schema: {
      description: 'Clear search cache',
      tags: ['Search', 'Admin'],
      querystring: Type.Object({
        pattern: Type.Optional(Type.String()),
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          message: Type.String(),
        }),
      },
    },
    preHandler: [fastify.authenticate, fastify.requireAdmin],
  }, async (request: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) => {
    try {
      const { pattern } = request.query;

      await searchService.clearCache(pattern);

      reply.send({
        success: true,
        message: pattern ? `Cache cleared for pattern: ${pattern}` : 'All cache cleared',
      });
    } catch (error) {
      logger.error('Clear cache endpoint error:', error);
      reply.code(500).send({
        success: false,
        error: {
          code: 'CACHE_CLEAR_ERROR',
          message: 'Cache clear operation failed',
        },
      });
    }
  });
}

export default searchRoutes;
