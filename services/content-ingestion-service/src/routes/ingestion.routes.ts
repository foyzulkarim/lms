import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { 
  FileIngestionRequest,
  URLIngestionRequest,
  YouTubeIngestionRequest,
  GitHubIngestionRequest,
  ManualContentRequest,
  IngestionResponse
} from '@/types';
import { contentIngestionService } from '@/services/content-ingestion.service';
import { 
  authenticateToken, 
  requirePermission, 
  requireCourseAccess,
  AuthenticatedRequest 
} from '@/middleware/auth.middleware';
import { contentLogger } from '@/utils/logger';

// Request schemas for validation
const fileIngestionSchema = {
  type: 'object',
  required: ['fileId'],
  properties: {
    fileId: { type: 'string', format: 'uuid' },
    courseId: { type: 'string', format: 'uuid' },
    moduleId: { type: 'string', format: 'uuid' },
    title: { type: 'string', maxLength: 500 },
    description: { type: 'string', maxLength: 2000 },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
    categories: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    priority: { type: 'integer', minimum: 1, maximum: 10 },
    extractionMethod: { 
      type: 'string', 
      enum: ['auto', 'pdf_js', 'ocr', 'speech_to_text', 'html_parser', 'markdown_parser', 'plain_text'] 
    },
  },
};

const urlIngestionSchema = {
  type: 'object',
  required: ['url'],
  properties: {
    url: { type: 'string', format: 'uri' },
    courseId: { type: 'string', format: 'uuid' },
    moduleId: { type: 'string', format: 'uuid' },
    title: { type: 'string', maxLength: 500 },
    description: { type: 'string', maxLength: 2000 },
    extractionMethod: { 
      type: 'string', 
      enum: ['auto', 'html_parser', 'plain_text'] 
    },
    followLinks: { type: 'boolean' },
    maxDepth: { type: 'integer', minimum: 1, maximum: 5 },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
    categories: { type: 'array', items: { type: 'string' }, maxItems: 10 },
  },
};

const youtubeIngestionSchema = {
  type: 'object',
  required: ['videoId'],
  properties: {
    videoId: { type: 'string', pattern: '^[a-zA-Z0-9_-]{11}$' },
    courseId: { type: 'string', format: 'uuid' },
    moduleId: { type: 'string', format: 'uuid' },
    extractTranscript: { type: 'boolean' },
    extractMetadata: { type: 'boolean' },
    language: { type: 'string', pattern: '^[a-z]{2}$' },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
    categories: { type: 'array', items: { type: 'string' }, maxItems: 10 },
  },
};

const githubIngestionSchema = {
  type: 'object',
  required: ['repository'],
  properties: {
    repository: { type: 'string', pattern: '^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$' },
    branch: { type: 'string', maxLength: 100 },
    paths: { type: 'array', items: { type: 'string' }, maxItems: 50 },
    includeCode: { type: 'boolean' },
    courseId: { type: 'string', format: 'uuid' },
    moduleId: { type: 'string', format: 'uuid' },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
    categories: { type: 'array', items: { type: 'string' }, maxItems: 10 },
  },
};

const manualContentSchema = {
  type: 'object',
  required: ['title', 'content'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 500 },
    content: { type: 'string', minLength: 10, maxLength: 1000000 },
    contentType: { type: 'string', maxLength: 100 },
    courseId: { type: 'string', format: 'uuid' },
    moduleId: { type: 'string', format: 'uuid' },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
    categories: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    language: { type: 'string', pattern: '^[a-z]{2}$' },
  },
};

export async function ingestionRoutes(fastify: FastifyInstance) {
  // Add authentication to all routes
  fastify.addHook('preHandler', authenticateToken);

  /**
   * Ingest content from file
   */
  fastify.post<{
    Body: FileIngestionRequest;
    Reply: IngestionResponse;
  }>('/file', {
    schema: {
      description: 'Ingest content from a file',
      tags: ['Content Ingestion'],
      body: fileIngestionSchema,
      response: {
        202: {
          type: 'object',
          properties: {
            contentId: { type: 'string', format: 'uuid' },
            jobId: { type: 'string', format: 'uuid' },
            status: { type: 'string' },
            estimatedDuration: { type: 'number' },
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: [
      requirePermission('content:create'),
      requireCourseAccess(),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const authToken = request.headers.authorization?.replace('Bearer ', '');
      const result = await contentIngestionService.ingestFromFile(request.body, authToken);
      
      return reply.status(202).send(result);
    } catch (error) {
      contentLogger.error('File ingestion endpoint error', error as Error, {
        userId: request.user?.id,
        fileId: request.body.fileId,
      });
      
      return reply.status(400).send({
        error: 'Ingestion Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Ingest content from URL
   */
  fastify.post<{
    Body: URLIngestionRequest;
    Reply: IngestionResponse;
  }>('/url', {
    schema: {
      description: 'Ingest content from a URL',
      tags: ['Content Ingestion'],
      body: urlIngestionSchema,
      response: {
        202: {
          type: 'object',
          properties: {
            contentId: { type: 'string', format: 'uuid' },
            jobId: { type: 'string', format: 'uuid' },
            status: { type: 'string' },
            estimatedDuration: { type: 'number' },
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: [
      requirePermission('content:create'),
      requireCourseAccess(),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const result = await contentIngestionService.ingestFromURL(request.body);
      
      return reply.status(202).send(result);
    } catch (error) {
      contentLogger.error('URL ingestion endpoint error', error as Error, {
        userId: request.user?.id,
        url: request.body.url,
      });
      
      return reply.status(400).send({
        error: 'Ingestion Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Ingest content from YouTube video
   */
  fastify.post<{
    Body: YouTubeIngestionRequest;
    Reply: IngestionResponse;
  }>('/youtube', {
    schema: {
      description: 'Ingest content from a YouTube video',
      tags: ['Content Ingestion'],
      body: youtubeIngestionSchema,
      response: {
        202: {
          type: 'object',
          properties: {
            contentId: { type: 'string', format: 'uuid' },
            jobId: { type: 'string', format: 'uuid' },
            status: { type: 'string' },
            estimatedDuration: { type: 'number' },
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: [
      requirePermission('content:create'),
      requireCourseAccess(),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const result = await contentIngestionService.ingestFromYouTube(request.body);
      
      return reply.status(202).send(result);
    } catch (error) {
      contentLogger.error('YouTube ingestion endpoint error', error as Error, {
        userId: request.user?.id,
        videoId: request.body.videoId,
      });
      
      return reply.status(400).send({
        error: 'Ingestion Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Ingest content from GitHub repository
   */
  fastify.post<{
    Body: GitHubIngestionRequest;
    Reply: IngestionResponse;
  }>('/github', {
    schema: {
      description: 'Ingest content from a GitHub repository',
      tags: ['Content Ingestion'],
      body: githubIngestionSchema,
      response: {
        202: {
          type: 'object',
          properties: {
            contentId: { type: 'string', format: 'uuid' },
            jobId: { type: 'string', format: 'uuid' },
            status: { type: 'string' },
            estimatedDuration: { type: 'number' },
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: [
      requirePermission('content:create'),
      requireCourseAccess(),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const result = await contentIngestionService.ingestFromGitHub(request.body);
      
      return reply.status(202).send(result);
    } catch (error) {
      contentLogger.error('GitHub ingestion endpoint error', error as Error, {
        userId: request.user?.id,
        repository: request.body.repository,
      });
      
      return reply.status(400).send({
        error: 'Ingestion Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Ingest manual content
   */
  fastify.post<{
    Body: ManualContentRequest;
    Reply: IngestionResponse;
  }>('/manual', {
    schema: {
      description: 'Ingest manually entered content',
      tags: ['Content Ingestion'],
      body: manualContentSchema,
      response: {
        201: {
          type: 'object',
          properties: {
            contentId: { type: 'string', format: 'uuid' },
            status: { type: 'string' },
            estimatedDuration: { type: 'number' },
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: [
      requirePermission('content:create'),
      requireCourseAccess(),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const result = await contentIngestionService.ingestManualContent(request.body);
      
      return reply.status(201).send(result);
    } catch (error) {
      contentLogger.error('Manual content ingestion endpoint error', error as Error, {
        userId: request.user?.id,
        title: request.body.title,
      });
      
      return reply.status(400).send({
        error: 'Ingestion Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Batch ingestion endpoint
   */
  fastify.post<{
    Body: {
      items: (FileIngestionRequest | URLIngestionRequest | ManualContentRequest)[];
      batchOptions?: {
        concurrency?: number;
        stopOnError?: boolean;
      };
    };
    Reply: {
      batchId: string;
      results: IngestionResponse[];
      errors: Array<{ index: number; error: string }>;
    };
  }>('/batch', {
    schema: {
      description: 'Batch ingest multiple content items',
      tags: ['Content Ingestion'],
      body: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            items: {
              oneOf: [fileIngestionSchema, urlIngestionSchema, manualContentSchema],
            },
          },
          batchOptions: {
            type: 'object',
            properties: {
              concurrency: { type: 'integer', minimum: 1, maximum: 10 },
              stopOnError: { type: 'boolean' },
            },
          },
        },
      },
    },
    preHandler: [
      requirePermission('content:create'),
    ],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { items, batchOptions = {} } = request.body;
      const { concurrency = 3, stopOnError = false } = batchOptions;
      
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const results: IngestionResponse[] = [];
      const errors: Array<{ index: number; error: string }> = [];
      
      contentLogger.info('Starting batch ingestion', {
        batchId,
        itemCount: items.length,
        userId: request.user?.id,
      });

      // Process items in batches with concurrency control
      for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchPromises = batch.map(async (item, batchIndex) => {
          const itemIndex = i + batchIndex;
          
          try {
            let result: IngestionResponse;
            
            // Determine item type and call appropriate service method
            if ('fileId' in item) {
              const authToken = request.headers.authorization?.replace('Bearer ', '');
              result = await contentIngestionService.ingestFromFile(item as FileIngestionRequest, authToken);
            } else if ('url' in item) {
              result = await contentIngestionService.ingestFromURL(item as URLIngestionRequest);
            } else if ('content' in item) {
              result = await contentIngestionService.ingestManualContent(item as ManualContentRequest);
            } else {
              throw new Error('Unknown item type');
            }
            
            results[itemIndex] = result;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            errors.push({ index: itemIndex, error: errorMessage });
            
            if (stopOnError) {
              throw error;
            }
          }
        });

        await Promise.allSettled(batchPromises);
      }

      contentLogger.info('Batch ingestion completed', {
        batchId,
        successCount: results.filter(r => r).length,
        errorCount: errors.length,
        userId: request.user?.id,
      });

      return reply.status(202).send({
        batchId,
        results: results.filter(r => r), // Remove undefined entries
        errors,
      });
    } catch (error) {
      contentLogger.error('Batch ingestion endpoint error', error as Error, {
        userId: request.user?.id,
        itemCount: request.body.items.length,
      });
      
      return reply.status(400).send({
        error: 'Batch Ingestion Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
