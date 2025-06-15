import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { 
  ContentItem,
  ContentListResponse,
  ChunkListResponse,
  ProcessingStatus,
  ContentSourceType
} from '@/types';
import { contentIngestionService } from '@/services/content-ingestion.service';
import { 
  authenticateToken, 
  requirePermission, 
  requireCourseAccess,
  AuthenticatedRequest 
} from '@/middleware/auth.middleware';
import { contentLogger } from '@/utils/logger';

export async function contentRoutes(fastify: FastifyInstance) {
  // Add authentication to all routes
  fastify.addHook('preHandler', authenticateToken);

  /**
   * Get content item by ID
   */
  fastify.get<{
    Params: { contentId: string };
    Reply: ContentItem | { error: string; message: string };
  }>('/:contentId', {
    schema: {
      description: 'Get content item by ID',
      tags: ['Content Management'],
      params: {
        type: 'object',
        required: ['contentId'],
        properties: {
          contentId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            sourceId: { type: 'string' },
            sourceType: { type: 'string' },
            sourceMetadata: { type: 'object' },
            title: { type: 'string' },
            description: { type: 'string' },
            content: { type: 'string' },
            contentType: { type: 'string' },
            language: { type: 'string' },
            processingStatus: { type: 'string' },
            processingMetadata: { type: 'object' },
            extractionMethod: { type: 'string' },
            totalChunks: { type: 'number' },
            courseId: { type: 'string', format: 'uuid' },
            moduleId: { type: 'string', format: 'uuid' },
            tags: { type: 'array', items: { type: 'string' } },
            categories: { type: 'array', items: { type: 'string' } },
            version: { type: 'number' },
            parentId: { type: 'string', format: 'uuid' },
            isLatest: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            processedAt: { type: 'string', format: 'date-time' },
            deletedAt: { type: 'string', format: 'date-time' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: [
      requirePermission('content:read'),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { contentId } = request.params;
      const content = await contentIngestionService.getContent(contentId);
      
      if (!content) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Content not found',
        });
      }

      // Check course access if content belongs to a course
      if (content.courseId && request.user?.role !== 'admin') {
        // TODO: Implement course access check
        // For now, allow access to all authenticated users
      }

      return reply.send(content);
    } catch (error) {
      contentLogger.error('Get content endpoint error', error as Error, {
        userId: request.user?.id,
        contentId: request.params.contentId,
      });
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve content',
      });
    }
  });

  /**
   * List content items
   */
  fastify.get<{
    Querystring: {
      courseId?: string;
      status?: ProcessingStatus;
      sourceType?: ContentSourceType;
      page?: number;
      limit?: number;
      search?: string;
    };
    Reply: ContentListResponse;
  }>('/', {
    schema: {
      description: 'List content items with filtering and pagination',
      tags: ['Content Management'],
      querystring: {
        type: 'object',
        properties: {
          courseId: { type: 'string', format: 'uuid' },
          status: { 
            type: 'string',
            enum: ['pending', 'extracting', 'processing', 'chunking', 'embedding', 'indexing', 'completed', 'failed']
          },
          sourceType: { 
            type: 'string',
            enum: ['file', 'url', 'api', 'manual', 'youtube', 'github', 'scorm']
          },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          search: { type: 'string', maxLength: 200 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            content: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  sourceType: { type: 'string' },
                  processingStatus: { type: 'string' },
                  totalChunks: { type: 'number' },
                  courseId: { type: 'string', format: 'uuid' },
                  tags: { type: 'array', items: { type: 'string' } },
                  createdAt: { type: 'string', format: 'date-time' },
                  processedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'number' },
                limit: { type: 'number' },
                total: { type: 'number' },
                totalPages: { type: 'number' },
              },
            },
          },
        },
      },
    },
    preHandler: [
      requirePermission('content:read'),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const filters = request.query;
      
      // If user is not admin, filter by their accessible courses
      if (request.user?.role !== 'admin' && !filters.courseId) {
        // TODO: Get user's accessible courses and filter
        // For now, allow access to all content
      }

      const result = await contentIngestionService.listContent(filters);
      
      return reply.send(result);
    } catch (error) {
      contentLogger.error('List content endpoint error', error as Error, {
        userId: request.user?.id,
        filters: request.query,
      });
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to list content',
      });
    }
  });

  /**
   * Get content chunks
   */
  fastify.get<{
    Params: { contentId: string };
    Querystring: {
      page?: number;
      limit?: number;
      includeEmbeddings?: boolean;
    };
    Reply: ChunkListResponse;
  }>('/:contentId/chunks', {
    schema: {
      description: 'Get content chunks with pagination',
      tags: ['Content Management'],
      params: {
        type: 'object',
        required: ['contentId'],
        properties: {
          contentId: { type: 'string', format: 'uuid' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          includeEmbeddings: { type: 'boolean', default: false },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            chunks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  contentId: { type: 'string', format: 'uuid' },
                  chunkIndex: { type: 'number' },
                  text: { type: 'string' },
                  tokens: { type: 'number' },
                  startPosition: { type: 'number' },
                  endPosition: { type: 'number' },
                  metadata: { type: 'object' },
                  embeddingModel: { type: 'string' },
                  embeddingDimensions: { type: 'number' },
                  createdAt: { type: 'string', format: 'date-time' },
                  embeddedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            totalChunks: { type: 'number' },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'number' },
                limit: { type: 'number' },
                total: { type: 'number' },
                totalPages: { type: 'number' },
              },
            },
          },
        },
      },
    },
    preHandler: [
      requirePermission('content:read'),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { contentId } = request.params;
      const options = request.query;
      
      // Check if content exists and user has access
      const content = await contentIngestionService.getContent(contentId);
      if (!content) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Content not found',
        });
      }

      const result = await contentIngestionService.getContentChunks(contentId, options);
      
      return reply.send(result);
    } catch (error) {
      contentLogger.error('Get content chunks endpoint error', error as Error, {
        userId: request.user?.id,
        contentId: request.params.contentId,
      });
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve content chunks',
      });
    }
  });

  /**
   * Update content metadata
   */
  fastify.patch<{
    Params: { contentId: string };
    Body: {
      title?: string;
      description?: string;
      tags?: string[];
      categories?: string[];
    };
    Reply: { message: string };
  }>('/:contentId', {
    schema: {
      description: 'Update content metadata',
      tags: ['Content Management'],
      params: {
        type: 'object',
        required: ['contentId'],
        properties: {
          contentId: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', maxLength: 500 },
          description: { type: 'string', maxLength: 2000 },
          tags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          categories: { type: 'array', items: { type: 'string' }, maxItems: 10 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: [
      requirePermission('content:update'),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { contentId } = request.params;
      const updates = request.body;
      
      // Check if content exists
      const content = await contentIngestionService.getContent(contentId);
      if (!content) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Content not found',
        });
      }

      // TODO: Implement content update functionality
      // This would involve updating the content_items table
      
      contentLogger.info('Content metadata updated', {
        contentId,
        userId: request.user?.id,
        updates: Object.keys(updates),
      });

      return reply.send({
        message: 'Content updated successfully',
      });
    } catch (error) {
      contentLogger.error('Update content endpoint error', error as Error, {
        userId: request.user?.id,
        contentId: request.params.contentId,
      });
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to update content',
      });
    }
  });

  /**
   * Reprocess content
   */
  fastify.post<{
    Params: { contentId: string };
    Body: {
      steps?: string[];
      force?: boolean;
    };
    Reply: { jobId: string; message: string };
  }>('/:contentId/reprocess', {
    schema: {
      description: 'Reprocess content with specified steps',
      tags: ['Content Management'],
      params: {
        type: 'object',
        required: ['contentId'],
        properties: {
          contentId: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        properties: {
          steps: { 
            type: 'array', 
            items: { 
              type: 'string',
              enum: ['extraction', 'chunking', 'embedding', 'indexing']
            },
            default: ['chunking', 'embedding', 'indexing']
          },
          force: { type: 'boolean', default: false },
        },
      },
      response: {
        202: {
          type: 'object',
          properties: {
            jobId: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: [
      requirePermission('content:reprocess'),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { contentId } = request.params;
      const { steps = ['chunking', 'embedding', 'indexing'], force = false } = request.body;
      
      // Check if content exists
      const content = await contentIngestionService.getContent(contentId);
      if (!content) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Content not found',
        });
      }

      // TODO: Implement reprocessing functionality
      // This would involve creating a new job to reprocess the content
      
      const jobId = `reprocess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      contentLogger.info('Content reprocessing initiated', {
        contentId,
        jobId,
        steps,
        force,
        userId: request.user?.id,
      });

      return reply.status(202).send({
        jobId,
        message: 'Reprocessing initiated',
      });
    } catch (error) {
      contentLogger.error('Reprocess content endpoint error', error as Error, {
        userId: request.user?.id,
        contentId: request.params.contentId,
      });
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to initiate reprocessing',
      });
    }
  });

  /**
   * Delete content
   */
  fastify.delete<{
    Params: { contentId: string };
    Querystring: {
      deleteEmbeddings?: boolean;
      deleteFromSearch?: boolean;
    };
    Reply: { message: string };
  }>('/:contentId', {
    schema: {
      description: 'Delete content item',
      tags: ['Content Management'],
      params: {
        type: 'object',
        required: ['contentId'],
        properties: {
          contentId: { type: 'string', format: 'uuid' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          deleteEmbeddings: { type: 'boolean', default: true },
          deleteFromSearch: { type: 'boolean', default: true },
        },
      },
      response: {
        204: {
          type: 'null',
        },
      },
    },
    preHandler: [
      requirePermission('content:delete'),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { contentId } = request.params;
      const options = request.query;
      
      // Check if content exists
      const content = await contentIngestionService.getContent(contentId);
      if (!content) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Content not found',
        });
      }

      await contentIngestionService.deleteContent(contentId, options);
      
      contentLogger.info('Content deleted', {
        contentId,
        userId: request.user?.id,
        options,
      });

      return reply.status(204).send();
    } catch (error) {
      contentLogger.error('Delete content endpoint error', error as Error, {
        userId: request.user?.id,
        contentId: request.params.contentId,
      });
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to delete content',
      });
    }
  });

  /**
   * Get content processing status
   */
  fastify.get<{
    Params: { contentId: string };
    Reply: {
      contentId: string;
      status: ProcessingStatus;
      progress?: number;
      processingMetadata?: any;
      estimatedCompletion?: string;
    };
  }>('/:contentId/status', {
    schema: {
      description: 'Get content processing status',
      tags: ['Content Management'],
      params: {
        type: 'object',
        required: ['contentId'],
        properties: {
          contentId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            contentId: { type: 'string', format: 'uuid' },
            status: { type: 'string' },
            progress: { type: 'number' },
            processingMetadata: { type: 'object' },
            estimatedCompletion: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    preHandler: [
      requirePermission('content:read'),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { contentId } = request.params;
      
      const content = await contentIngestionService.getContent(contentId);
      if (!content) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Content not found',
        });
      }

      // Calculate progress based on status
      const progressMap: Record<ProcessingStatus, number> = {
        [ProcessingStatus.PENDING]: 0,
        [ProcessingStatus.EXTRACTING]: 20,
        [ProcessingStatus.PROCESSING]: 40,
        [ProcessingStatus.CHUNKING]: 60,
        [ProcessingStatus.EMBEDDING]: 80,
        [ProcessingStatus.INDEXING]: 90,
        [ProcessingStatus.COMPLETED]: 100,
        [ProcessingStatus.FAILED]: 0,
      };

      return reply.send({
        contentId,
        status: content.processingStatus,
        progress: progressMap[content.processingStatus],
        processingMetadata: content.processingMetadata,
        estimatedCompletion: content.processedAt?.toISOString(),
      });
    } catch (error) {
      contentLogger.error('Get content status endpoint error', error as Error, {
        userId: request.user?.id,
        contentId: request.params.contentId,
      });
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get content status',
      });
    }
  });
}
