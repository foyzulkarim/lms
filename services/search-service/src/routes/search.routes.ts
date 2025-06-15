import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { 
  SearchRequest,
  SearchResponse,
  SearchType,
  AutocompleteRequest,
  AutocompleteResponse,
  RAGResponse,
  VectorSearchRequest,
  VectorSearchResult
} from '@/types';
import { multiStrategySearchService } from '@/services/multi-strategy-search.service';
import { vectorSearchService } from '@/services/vector-search.service';
import { llmGatewayService } from '@/services/llm-gateway.service';
import { 
  authenticateToken, 
  requirePermission,
  AuthenticatedRequest 
} from '@/middleware/auth.middleware';
import { searchLogger } from '@/utils/logger';

// Request schemas for validation
const searchRequestSchema = {
  type: 'object',
  required: ['query'],
  properties: {
    query: { type: 'string', minLength: 2, maxLength: 1000 },
    type: { 
      type: 'string', 
      enum: ['full_text', 'semantic', 'hybrid', 'rag', 'autocomplete', 'faceted'],
      default: 'hybrid'
    },
    filters: {
      type: 'object',
      properties: {
        courseIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
        moduleIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
        contentTypes: { 
          type: 'array', 
          items: { 
            type: 'string',
            enum: ['course', 'module', 'content', 'file', 'discussion', 'assignment', 'quiz', 'announcement']
          }
        },
        tags: { type: 'array', items: { type: 'string' } },
        categories: { type: 'array', items: { type: 'string' } },
        dateRange: {
          type: 'object',
          properties: {
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' }
          }
        },
        language: { type: 'string', pattern: '^[a-z]{2}$' },
        difficulty: { type: 'array', items: { type: 'string' } },
        authors: { type: 'array', items: { type: 'string' } },
        minScore: { type: 'number', minimum: 0, maximum: 1 }
      }
    },
    options: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        includeHighlights: { type: 'boolean', default: true },
        includeFacets: { type: 'boolean', default: false },
        includeRAG: { type: 'boolean', default: false },
        minScore: { type: 'number', minimum: 0, maximum: 1 },
        sortBy: { 
          type: 'string',
          enum: ['relevance', 'date', 'title', 'popularity', 'rating'],
          default: 'relevance'
        },
        sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }
      }
    },
    context: {
      type: 'object',
      properties: {
        courseId: { type: 'string', format: 'uuid' },
        sessionId: { type: 'string' },
        previousQueries: { type: 'array', items: { type: 'string' } },
        userPreferences: { type: 'object' }
      }
    }
  }
};

const ragRequestSchema = {
  type: 'object',
  required: ['question'],
  properties: {
    question: { type: 'string', minLength: 10, maxLength: 1000 },
    context: {
      type: 'object',
      properties: {
        courseId: { type: 'string', format: 'uuid' },
        includeExamples: { type: 'boolean', default: true },
        maxSources: { type: 'integer', minimum: 1, maximum: 20, default: 5 }
      }
    },
    options: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        temperature: { type: 'number', minimum: 0, maximum: 2, default: 0.3 },
        includeSourcesInAnswer: { type: 'boolean', default: true }
      }
    }
  }
};

const semanticSearchSchema = {
  type: 'object',
  required: ['query'],
  properties: {
    query: { type: 'string', minLength: 2, maxLength: 1000 },
    filters: {
      type: 'object',
      properties: {
        courseIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
        contentTypes: { type: 'array', items: { type: 'string' } }
      }
    },
    options: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        minSimilarity: { type: 'number', minimum: 0, maximum: 1, default: 0.7 }
      }
    }
  }
};

export async function searchRoutes(fastify: FastifyInstance) {
  // Add authentication to all routes
  fastify.addHook('preHandler', authenticateToken);

  /**
   * Universal search endpoint
   */
  fastify.post<{
    Body: SearchRequest;
    Reply: SearchResponse;
  }>('/', {
    schema: {
      description: 'Universal search with multiple strategies (full-text, semantic, hybrid, RAG)',
      tags: ['Search'],
      body: searchRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  type: { type: 'string' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  content: { type: 'string' },
                  highlights: { type: 'array', items: { type: 'string' } },
                  score: { type: 'number' },
                  relevanceScore: { type: 'number' },
                  semanticScore: { type: 'number' },
                  source: { type: 'object' },
                  courseId: { type: 'string', format: 'uuid' },
                  moduleId: { type: 'string', format: 'uuid' },
                  tags: { type: 'array', items: { type: 'string' } },
                  categories: { type: 'array', items: { type: 'string' } },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' }
                }
              }
            },
            totalResults: { type: 'number' },
            searchTime: { type: 'number' },
            searchId: { type: 'string', format: 'uuid' },
            suggestions: { type: 'array', items: { type: 'string' } },
            ragResponse: {
              type: 'object',
              properties: {
                answer: { type: 'string' },
                sources: { type: 'array' },
                confidence: { type: 'number' },
                model: { type: 'string' },
                followUpQuestions: { type: 'array', items: { type: 'string' } }
              }
            },
            metadata: { type: 'object' }
          }
        }
      }
    },
    preHandler: [
      requirePermission('search:read'),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // Add user context to the search request
      const searchRequest: SearchRequest = {
        ...request.body,
        context: {
          ...request.body.context,
          userId: request.user?.id,
        },
      };

      const result = await multiStrategySearchService.search(searchRequest);
      
      // Log search analytics
      searchLogger.searchPerformed(
        request.user?.id,
        searchRequest.query,
        searchRequest.type,
        result.totalResults,
        result.searchTime
      );

      return reply.send(result);
    } catch (error) {
      searchLogger.error('Universal search endpoint error', error as Error, {
        userId: request.user?.id,
        query: request.body.query,
        type: request.body.type,
      });
      
      return reply.status(400).send({
        error: 'Search Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * RAG-specific search endpoint
   */
  fastify.post<{
    Body: {
      question: string;
      context?: {
        courseId?: string;
        includeExamples?: boolean;
        maxSources?: number;
      };
      options?: {
        model?: string;
        temperature?: number;
        includeSourcesInAnswer?: boolean;
      };
    };
    Reply: {
      answer: string;
      sources: any[];
      confidence: number;
      model: string;
      followUpQuestions?: string[];
      searchTime: number;
      interactionId: string;
    };
  }>('/rag', {
    schema: {
      description: 'RAG-powered question answering',
      tags: ['Search', 'RAG'],
      body: ragRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
            sources: { type: 'array' },
            confidence: { type: 'number' },
            model: { type: 'string' },
            followUpQuestions: { type: 'array', items: { type: 'string' } },
            searchTime: { type: 'number' },
            interactionId: { type: 'string', format: 'uuid' }
          }
        }
      }
    },
    preHandler: [
      requirePermission('search:rag'),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const startTime = Date.now();
      
      // Create RAG search request
      const ragRequest: SearchRequest = {
        query: request.body.question,
        type: SearchType.RAG,
        filters: request.body.context?.courseId ? {
          courseIds: [request.body.context.courseId]
        } : {},
        options: {
          includeRAG: true,
          limit: request.body.context?.maxSources || 5,
        },
        context: {
          userId: request.user?.id,
          courseId: request.body.context?.courseId,
        },
      };

      const searchResult = await multiStrategySearchService.search(ragRequest);
      
      if (!searchResult.ragResponse) {
        return reply.status(500).send({
          error: 'RAG Error',
          message: 'Failed to generate RAG response',
        });
      }

      const response = {
        answer: searchResult.ragResponse.answer,
        sources: searchResult.ragResponse.sources,
        confidence: searchResult.ragResponse.confidence,
        model: searchResult.ragResponse.model,
        followUpQuestions: searchResult.ragResponse.followUpQuestions,
        searchTime: Date.now() - startTime,
        interactionId: searchResult.searchId,
      };

      // Log RAG interaction
      searchLogger.ragInteraction(
        request.user?.id,
        request.body.question,
        response.answer,
        response.confidence,
        response.sources.length
      );

      return reply.send(response);
    } catch (error) {
      searchLogger.error('RAG search endpoint error', error as Error, {
        userId: request.user?.id,
        question: request.body.question,
      });
      
      return reply.status(400).send({
        error: 'RAG Search Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Semantic search endpoint
   */
  fastify.post<{
    Body: {
      query: string;
      filters?: {
        courseIds?: string[];
        contentTypes?: string[];
      };
      options?: {
        limit?: number;
        minSimilarity?: number;
      };
    };
    Reply: {
      results: VectorSearchResult[];
      totalResults: number;
      searchTime: number;
    };
  }>('/semantic', {
    schema: {
      description: 'Semantic search using vector embeddings',
      tags: ['Search', 'Semantic'],
      body: semanticSearchSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  contentId: { type: 'string', format: 'uuid' },
                  text: { type: 'string' },
                  similarity: { type: 'number' },
                  metadata: { type: 'object' }
                }
              }
            },
            totalResults: { type: 'number' },
            searchTime: { type: 'number' }
          }
        }
      }
    },
    preHandler: [
      requirePermission('search:semantic'),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const startTime = Date.now();
      
      // Generate embedding for the query
      const queryEmbedding = await llmGatewayService.generateEmbedding(request.body.query);
      
      // Perform vector search
      const results = await vectorSearchService.similaritySearch({
        vector: queryEmbedding,
        limit: request.body.options?.limit || 10,
        threshold: request.body.options?.minSimilarity || 0.7,
        filters: request.body.filters || {},
      });

      const response = {
        results,
        totalResults: results.length,
        searchTime: Date.now() - startTime,
      };

      return reply.send(response);
    } catch (error) {
      searchLogger.error('Semantic search endpoint error', error as Error, {
        userId: request.user?.id,
        query: request.body.query,
      });
      
      return reply.status(400).send({
        error: 'Semantic Search Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Autocomplete endpoint
   */
  fastify.get<{
    Querystring: {
      q: string;
      limit?: number;
      context?: string;
    };
    Reply: AutocompleteResponse;
  }>('/autocomplete', {
    schema: {
      description: 'Search autocomplete and suggestions',
      tags: ['Search', 'Autocomplete'],
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
          context: { type: 'string', format: 'uuid' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  frequency: { type: 'number' },
                  category: { type: 'string' }
                }
              }
            },
            searchTime: { type: 'number' }
          }
        }
      }
    },
    preHandler: [
      requirePermission('search:autocomplete'),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const startTime = Date.now();
      const { q: query, limit = 10, context: courseId } = request.query;

      // TODO: Implement autocomplete logic
      // This would typically query a suggestions database or use ML-based suggestions
      
      const suggestions = [
        {
          text: `${query} tutorial`,
          frequency: 156,
          category: 'topic',
        },
        {
          text: `${query} examples`,
          frequency: 89,
          category: 'topic',
        },
        {
          text: `${query} course`,
          frequency: 67,
          category: 'course',
        },
      ].slice(0, limit);

      const response: AutocompleteResponse = {
        suggestions,
        searchTime: Date.now() - startTime,
      };

      return reply.send(response);
    } catch (error) {
      searchLogger.error('Autocomplete endpoint error', error as Error, {
        userId: request.user?.id,
        query: request.query.q,
      });
      
      return reply.status(400).send({
        error: 'Autocomplete Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Search suggestions endpoint
   */
  fastify.get<{
    Querystring: {
      query: string;
      courseId?: string;
    };
    Reply: {
      suggestions: string[];
      searchTime: number;
    };
  }>('/suggestions', {
    schema: {
      description: 'Get search suggestions for improving query',
      tags: ['Search', 'Suggestions'],
      querystring: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 2 },
          courseId: { type: 'string', format: 'uuid' }
        }
      }
    },
    preHandler: [
      requirePermission('search:read'),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const startTime = Date.now();
      const { query, courseId } = request.query;

      // Generate query suggestions using LLM
      const suggestions = await llmGatewayService.expandQuery(query, {
        courseId,
        previousQueries: [],
      });

      return reply.send({
        suggestions: suggestions.slice(0, 5),
        searchTime: Date.now() - startTime,
      });
    } catch (error) {
      searchLogger.error('Search suggestions endpoint error', error as Error, {
        userId: request.user?.id,
        query: request.query.query,
      });
      
      return reply.status(400).send({
        error: 'Suggestions Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Similar content endpoint
   */
  fastify.get<{
    Params: { contentId: string };
    Querystring: {
      limit?: number;
      threshold?: number;
    };
    Reply: {
      results: VectorSearchResult[];
      totalResults: number;
      searchTime: number;
    };
  }>('/similar/:contentId', {
    schema: {
      description: 'Find similar content based on content ID',
      tags: ['Search', 'Similar'],
      params: {
        type: 'object',
        required: ['contentId'],
        properties: {
          contentId: { type: 'string', format: 'uuid' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          threshold: { type: 'number', minimum: 0, maximum: 1, default: 0.8 }
        }
      }
    },
    preHandler: [
      requirePermission('search:read'),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const startTime = Date.now();
      const { contentId } = request.params;
      const { limit = 10, threshold = 0.8 } = request.query;

      const results = await vectorSearchService.findSimilarContent(
        contentId,
        limit,
        threshold
      );

      return reply.send({
        results,
        totalResults: results.length,
        searchTime: Date.now() - startTime,
      });
    } catch (error) {
      searchLogger.error('Similar content endpoint error', error as Error, {
        userId: request.user?.id,
        contentId: request.params.contentId,
      });
      
      return reply.status(400).send({
        error: 'Similar Content Search Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
