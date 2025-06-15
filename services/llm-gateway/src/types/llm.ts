import { Type, Static } from '@sinclair/typebox';

// Message Types
export const MessageSchema = Type.Object({
  role: Type.Union([Type.Literal('system'), Type.Literal('user'), Type.Literal('assistant')]),
  content: Type.String({ minLength: 1, maxLength: 8192 }),
  name: Type.Optional(Type.String()),
});

// Chat Completion Request
export const ChatCompletionRequestSchema = Type.Object({
  model: Type.String({ minLength: 1 }),
  messages: Type.Array(MessageSchema, { minItems: 1 }),
  temperature: Type.Optional(Type.Number({ minimum: 0, maximum: 2 })),
  max_tokens: Type.Optional(Type.Number({ minimum: 1, maximum: 4096 })),
  top_p: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  frequency_penalty: Type.Optional(Type.Number({ minimum: -2, maximum: 2 })),
  presence_penalty: Type.Optional(Type.Number({ minimum: -2, maximum: 2 })),
  stop: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
  stream: Type.Optional(Type.Boolean()),
  user: Type.Optional(Type.String()),
});

// Chat Completion Response
export const ChatCompletionResponseSchema = Type.Object({
  id: Type.String(),
  object: Type.Literal('chat.completion'),
  created: Type.Number(),
  model: Type.String(),
  choices: Type.Array(Type.Object({
    index: Type.Number(),
    message: MessageSchema,
    finish_reason: Type.Union([
      Type.Literal('stop'),
      Type.Literal('length'),
      Type.Literal('content_filter'),
      Type.Literal('null')
    ]),
  })),
  usage: Type.Object({
    prompt_tokens: Type.Number(),
    completion_tokens: Type.Number(),
    total_tokens: Type.Number(),
  }),
});

// Streaming Response
export const ChatCompletionChunkSchema = Type.Object({
  id: Type.String(),
  object: Type.Literal('chat.completion.chunk'),
  created: Type.Number(),
  model: Type.String(),
  choices: Type.Array(Type.Object({
    index: Type.Number(),
    delta: Type.Object({
      role: Type.Optional(Type.String()),
      content: Type.Optional(Type.String()),
    }),
    finish_reason: Type.Optional(Type.Union([
      Type.Literal('stop'),
      Type.Literal('length'),
      Type.Literal('content_filter'),
      Type.Literal('null')
    ])),
  })),
});

// Embeddings Request
export const EmbeddingsRequestSchema = Type.Object({
  model: Type.String({ minLength: 1 }),
  input: Type.Union([
    Type.String({ minLength: 1, maxLength: 8192 }),
    Type.Array(Type.String({ minLength: 1, maxLength: 8192 }))
  ]),
  user: Type.Optional(Type.String()),
});

// Embeddings Response
export const EmbeddingsResponseSchema = Type.Object({
  object: Type.Literal('list'),
  data: Type.Array(Type.Object({
    object: Type.Literal('embedding'),
    embedding: Type.Array(Type.Number()),
    index: Type.Number(),
  })),
  model: Type.String(),
  usage: Type.Object({
    prompt_tokens: Type.Number(),
    total_tokens: Type.Number(),
  }),
});

// Model Information
export const ModelSchema = Type.Object({
  id: Type.String(),
  object: Type.Literal('model'),
  created: Type.Number(),
  owned_by: Type.String(),
  permission: Type.Array(Type.Object({
    id: Type.String(),
    object: Type.Literal('model_permission'),
    created: Type.Number(),
    allow_create_engine: Type.Boolean(),
    allow_sampling: Type.Boolean(),
    allow_logprobs: Type.Boolean(),
    allow_search_indices: Type.Boolean(),
    allow_view: Type.Boolean(),
    allow_fine_tuning: Type.Boolean(),
    organization: Type.String(),
    group: Type.Optional(Type.String()),
    is_blocking: Type.Boolean(),
  })),
  root: Type.String(),
  parent: Type.Optional(Type.String()),
});

// Models List Response
export const ModelsResponseSchema = Type.Object({
  object: Type.Literal('list'),
  data: Type.Array(ModelSchema),
});

// Queue Job Types
export const QueueJobSchema = Type.Object({
  id: Type.String(),
  type: Type.Union([Type.Literal('chat'), Type.Literal('embeddings')]),
  userId: Type.String(),
  model: Type.String(),
  request: Type.Union([ChatCompletionRequestSchema, EmbeddingsRequestSchema]),
  priority: Type.Optional(Type.Number()),
  createdAt: Type.String({ format: 'date-time' }),
  attempts: Type.Number({ default: 0 }),
  maxAttempts: Type.Number({ default: 3 }),
});

// Rate Limit Info
export const RateLimitInfoSchema = Type.Object({
  limit: Type.Number(),
  remaining: Type.Number(),
  reset: Type.Number(),
  retryAfter: Type.Optional(Type.Number()),
});

// Error Response
export const ErrorResponseSchema = Type.Object({
  error: Type.Object({
    message: Type.String(),
    type: Type.String(),
    param: Type.Optional(Type.String()),
    code: Type.Optional(Type.String()),
  }),
});

// Cache Entry
export const CacheEntrySchema = Type.Object({
  key: Type.String(),
  value: Type.Any(),
  ttl: Type.Number(),
  createdAt: Type.String({ format: 'date-time' }),
  accessCount: Type.Number({ default: 0 }),
  lastAccessed: Type.String({ format: 'date-time' }),
});

// Metrics
export const MetricsSchema = Type.Object({
  requests: Type.Object({
    total: Type.Number(),
    successful: Type.Number(),
    failed: Type.Number(),
    cached: Type.Number(),
  }),
  models: Type.Record(Type.String(), Type.Object({
    requests: Type.Number(),
    avgLatency: Type.Number(),
    errors: Type.Number(),
  })),
  queue: Type.Object({
    pending: Type.Number(),
    processing: Type.Number(),
    completed: Type.Number(),
    failed: Type.Number(),
  }),
  cache: Type.Object({
    hits: Type.Number(),
    misses: Type.Number(),
    size: Type.Number(),
  }),
});

// Type exports
export type Message = Static<typeof MessageSchema>;
export type ChatCompletionRequest = Static<typeof ChatCompletionRequestSchema>;
export type ChatCompletionResponse = Static<typeof ChatCompletionResponseSchema>;
export type ChatCompletionChunk = Static<typeof ChatCompletionChunkSchema>;
export type EmbeddingsRequest = Static<typeof EmbeddingsRequestSchema>;
export type EmbeddingsResponse = Static<typeof EmbeddingsResponseSchema>;
export type Model = Static<typeof ModelSchema>;
export type ModelsResponse = Static<typeof ModelsResponseSchema>;
export type QueueJob = Static<typeof QueueJobSchema>;
export type RateLimitInfo = Static<typeof RateLimitInfoSchema>;
export type ErrorResponse = Static<typeof ErrorResponseSchema>;
export type CacheEntry = Static<typeof CacheEntrySchema>;
export type Metrics = Static<typeof MetricsSchema>;

// Additional types for internal use
export interface RequestContext {
  userId: string;
  correlationId: string;
  userAgent?: string;
  ipAddress?: string;
  startTime: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  maxTokens: number;
  contextWindow: number;
  isAvailable: boolean;
  avgLatency?: number;
  errorRate?: number;
  lastHealthCheck?: Date;
}

export interface QueueMetrics {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  avgProcessingTime: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  memoryUsage: number;
}
