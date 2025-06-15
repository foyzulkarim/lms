import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { 
  ChatCompletionRequestSchema, 
  ChatCompletionResponseSchema,
  ErrorResponseSchema 
} from '../types/llm';
import { authMiddleware } from '../middleware/auth';
import { RateLimitError, ValidationError, ServiceUnavailableError } from '../middleware/error-handler';
import { publishLLMEvent } from '../utils/kafka';
import { JobPriority } from '../queue/types';

export const chatRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  
  // Chat completions endpoint
  fastify.post('/completions', {
    schema: {
      tags: ['Chat'],
      summary: 'Create a chat completion',
      description: 'Generate a response to a conversation using an LLM',
      security: [{ bearerAuth: [] }],
      body: ChatCompletionRequestSchema,
      response: {
        200: ChatCompletionResponseSchema,
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        429: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const startTime = Date.now();
    const chatRequest = request.body as any;
    const user = request.user!;
    const correlationId = request.correlationId;

    try {
      // Validate model availability
      if (!fastify.config.security.allowedModels.includes(chatRequest.model)) {
        throw new ValidationError(`Model '${chatRequest.model}' is not allowed`);
      }

      // Check if streaming is requested but not supported
      if (chatRequest.stream && !fastify.config.features.enableStreaming) {
        throw new ValidationError('Streaming is not enabled');
      }

      // Content validation
      const totalPromptLength = chatRequest.messages
        .map((msg: any) => msg.content)
        .join(' ')
        .length;

      if (totalPromptLength > fastify.config.security.maxPromptLength) {
        throw new ValidationError(`Prompt too long. Maximum length: ${fastify.config.security.maxPromptLength}`);
      }

      // Rate limiting checks
      if (fastify.config.features.enableRateLimiting) {
        // Check user rate limit
        const userRateLimit = await fastify.userRateLimiter.checkRateLimit(user.id);
        if (userRateLimit.remaining <= 0) {
          reply.header('X-RateLimit-Limit', userRateLimit.limit.toString());
          reply.header('X-RateLimit-Remaining', '0');
          reply.header('X-RateLimit-Reset', userRateLimit.reset.toString());
          if (userRateLimit.retryAfter) {
            reply.header('Retry-After', userRateLimit.retryAfter.toString());
          }
          throw new RateLimitError('User rate limit exceeded');
        }

        // Check model-specific rate limit
        const modelRateLimit = await fastify.modelRateLimiter.checkModelRateLimit(user.id, chatRequest.model);
        if (modelRateLimit.remaining <= 0) {
          reply.header('X-RateLimit-Limit', modelRateLimit.limit.toString());
          reply.header('X-RateLimit-Remaining', '0');
          reply.header('X-RateLimit-Reset', modelRateLimit.reset.toString());
          if (modelRateLimit.retryAfter) {
            reply.header('Retry-After', modelRateLimit.retryAfter.toString());
          }
          throw new RateLimitError(`Model '${chatRequest.model}' rate limit exceeded`);
        }

        // Set rate limit headers
        reply.header('X-RateLimit-Limit', userRateLimit.limit.toString());
        reply.header('X-RateLimit-Remaining', userRateLimit.remaining.toString());
        reply.header('X-RateLimit-Reset', userRateLimit.reset.toString());
      }

      // Check cache for response
      let cachedResponse = null;
      if (fastify.config.features.enableCaching && !chatRequest.stream) {
        cachedResponse = await fastify.responseCache.getCachedResponse(chatRequest, user.id);
        if (cachedResponse) {
          const processingTime = Date.now() - startTime;
          
          // Add cache headers
          reply.header('X-Cache', 'HIT');
          reply.header('X-Processing-Time', `${processingTime}ms`);

          // Publish analytics event
          await publishLLMEvent('CHAT_COMPLETION_CACHED', {
            userId: user.id,
            model: chatRequest.model,
            processingTime,
            cached: true,
            correlationId,
          });

          request.logger.info('Chat completion served from cache', {
            userId: user.id,
            model: chatRequest.model,
            processingTime,
            correlationId,
          });

          return cachedResponse;
        }
      }

      // Determine processing priority
      let priority = JobPriority.NORMAL;
      if (user.roles?.includes('premium')) {
        priority = JobPriority.HIGH;
      } else if (user.roles?.includes('admin')) {
        priority = JobPriority.CRITICAL;
      }

      // Process request based on queue configuration
      let response;
      if (fastify.config.features.enableQueueProcessing) {
        // Add to queue and wait for completion
        const jobId = await fastify.queueProducer.addChatJob(
          user.id,
          chatRequest,
          correlationId,
          priority
        );

        request.logger.debug('Chat job queued', {
          jobId,
          userId: user.id,
          model: chatRequest.model,
          priority,
          correlationId,
        });

        // Wait for job completion
        const jobResult = await fastify.queueProducer.waitForJobCompletion(
          jobId,
          'chat',
          fastify.config.ollama.timeout
        );

        if (!jobResult.success) {
          throw new ServiceUnavailableError(jobResult.error || 'Chat completion failed');
        }

        response = jobResult.response;
      } else {
        // Direct processing
        response = await fastify.ollamaService.chatCompletion(chatRequest);
      }

      const processingTime = Date.now() - startTime;

      // Cache the response if caching is enabled
      if (fastify.config.features.enableCaching && !chatRequest.stream) {
        await fastify.responseCache.setCachedResponse(chatRequest, response, user.id);
      }

      // Add response headers
      reply.header('X-Cache', 'MISS');
      reply.header('X-Processing-Time', `${processingTime}ms`);
      reply.header('X-Model', chatRequest.model);

      // Publish analytics event
      await publishLLMEvent('CHAT_COMPLETION_SUCCESS', {
        userId: user.id,
        model: chatRequest.model,
        processingTime,
        tokensUsed: response.usage.total_tokens,
        cached: false,
        correlationId,
      });

      request.logger.info('Chat completion successful', {
        userId: user.id,
        model: chatRequest.model,
        processingTime,
        tokensUsed: response.usage.total_tokens,
        correlationId,
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Publish error event
      await publishLLMEvent('CHAT_COMPLETION_ERROR', {
        userId: user.id,
        model: chatRequest.model,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });

      request.logger.error('Chat completion failed', {
        userId: user.id,
        model: chatRequest.model,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });

      throw error;
    }
  });

  // Get chat job status (for async processing)
  fastify.get('/jobs/:jobId', {
    schema: {
      tags: ['Chat'],
      summary: 'Get chat job status',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
        },
        required: ['jobId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string' },
            progress: { type: 'number' },
            result: { type: 'object' },
            error: { type: 'string' },
            createdAt: { type: 'string' },
            completedAt: { type: 'string' },
          },
        },
        404: ErrorResponseSchema,
      },
    },
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const user = request.user!;

    const jobStatus = await fastify.queueProducer.getJobStatus(jobId, 'chat');
    
    if (!jobStatus) {
      reply.status(404);
      return {
        error: {
          message: 'Job not found',
          type: 'not_found_error',
        },
      };
    }

    // Verify job belongs to user (security check)
    if (jobStatus.data.userId !== user.id) {
      reply.status(404);
      return {
        error: {
          message: 'Job not found',
          type: 'not_found_error',
        },
      };
    }

    return jobStatus;
  });
};
