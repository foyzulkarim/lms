import { db } from '@/utils/database';
import { searchLogger } from '@/utils/logger';
import { config, searchConfig } from '@/config/environment';
import { 
  VectorSearchRequest, 
  VectorSearchResult, 
  SearchFilters,
  VectorSearchError,
  RAGContext 
} from '@/types';

export class VectorSearchService {
  /**
   * Perform vector similarity search
   */
  async similaritySearch(request: VectorSearchRequest): Promise<VectorSearchResult[]> {
    const startTime = Date.now();
    
    try {
      const {
        vector,
        limit = searchConfig.limits.defaultLimit,
        threshold = searchConfig.vector.similarityThreshold,
        filters = {}
      } = request;

      searchLogger.info('Starting vector similarity search', {
        vectorDimensions: vector.length,
        limit,
        threshold,
        hasFilters: Object.keys(filters).length > 0,
      });

      // Build the base query
      let query = db('search_embeddings as se')
        .select([
          'se.id',
          'se.content_id',
          'se.chunk_id',
          'se.text',
          'se.metadata',
          'se.course_id',
          'se.module_id',
          'se.content_type',
          'se.language',
          db.raw('1 - (se.embedding <=> ?) as similarity', [JSON.stringify(vector)])
        ])
        .where(db.raw('1 - (se.embedding <=> ?) > ?', [JSON.stringify(vector), threshold]))
        .orderBy(db.raw('se.embedding <=> ?', [JSON.stringify(vector)]))
        .limit(Math.min(limit, searchConfig.vector.maxResults));

      // Apply filters
      query = this.applyFilters(query, filters);

      const results = await query;

      const duration = Date.now() - startTime;
      
      searchLogger.info('Vector similarity search completed', {
        resultsCount: results.length,
        duration,
        threshold,
        averageSimilarity: results.length > 0 
          ? results.reduce((sum, r) => sum + r.similarity, 0) / results.length 
          : 0,
      });

      return results.map(row => this.mapRowToVectorResult(row));
    } catch (error) {
      const duration = Date.now() - startTime;
      searchLogger.error('Vector similarity search failed', error as Error, {
        vectorDimensions: vector.length,
        duration,
      });
      
      throw new VectorSearchError(
        `Vector similarity search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { vectorDimensions: vector.length, threshold: request.threshold }
      );
    }
  }

  /**
   * Get contexts for RAG based on query embedding
   */
  async getRAGContexts(
    queryEmbedding: number[], 
    options: {
      limit?: number;
      threshold?: number;
      filters?: SearchFilters;
      maxTokens?: number;
    } = {}
  ): Promise<RAGContext[]> {
    const {
      limit = config.RAG_MAX_CONTEXTS,
      threshold = searchConfig.vector.similarityThreshold,
      filters = {},
      maxTokens = config.RAG_CONTEXT_MAX_TOKENS,
    } = options;

    try {
      const results = await this.similaritySearch({
        vector: queryEmbedding,
        limit: limit * 2, // Get more results to filter by token count
        threshold,
        filters,
      });

      // Convert to RAG contexts and filter by token count
      const contexts: RAGContext[] = [];
      let totalTokens = 0;

      for (const result of results) {
        const estimatedTokens = Math.ceil(result.text.length / 4); // Rough token estimation
        
        if (totalTokens + estimatedTokens > maxTokens && contexts.length > 0) {
          break; // Stop adding contexts if we exceed token limit
        }

        const context: RAGContext = {
          text: result.text,
          metadata: {
            contentId: result.contentId,
            chunkId: result.chunkId,
            title: result.metadata?.title || 'Unknown',
            courseId: result.metadata?.courseId,
            moduleId: result.metadata?.moduleId,
            section: result.metadata?.section,
            page: result.metadata?.page,
            timestamp: result.metadata?.timestamp,
          },
          relevanceScore: result.similarity,
        };

        contexts.push(context);
        totalTokens += estimatedTokens;

        if (contexts.length >= limit) {
          break;
        }
      }

      searchLogger.info('RAG contexts retrieved', {
        contextCount: contexts.length,
        totalTokens,
        averageRelevance: contexts.length > 0 
          ? contexts.reduce((sum, c) => sum + c.relevanceScore, 0) / contexts.length 
          : 0,
      });

      return contexts;
    } catch (error) {
      searchLogger.error('Failed to get RAG contexts', error as Error, {
        limit,
        threshold,
      });
      throw error;
    }
  }

  /**
   * Store vector embeddings
   */
  async storeEmbeddings(embeddings: Array<{
    id?: string;
    contentId: string;
    chunkId?: string;
    text: string;
    embedding: number[];
    courseId?: string;
    moduleId?: string;
    contentType?: string;
    language?: string;
    embeddingModel?: string;
    metadata?: Record<string, any>;
  }>): Promise<void> {
    const startTime = Date.now();
    
    try {
      const embeddingData = embeddings.map(item => ({
        id: item.id,
        content_id: item.contentId,
        chunk_id: item.chunkId,
        text: item.text,
        embedding: JSON.stringify(item.embedding),
        course_id: item.courseId,
        module_id: item.moduleId,
        content_type: item.contentType,
        language: item.language || 'en',
        embedding_model: item.embeddingModel || config.DEFAULT_EMBEDDING_MODEL,
        metadata: item.metadata ? JSON.stringify(item.metadata) : null,
        created_at: new Date(),
      }));

      // Use batch insert for better performance
      const batchSize = 100;
      for (let i = 0; i < embeddingData.length; i += batchSize) {
        const batch = embeddingData.slice(i, i + batchSize);
        await db('search_embeddings').insert(batch);
      }

      const duration = Date.now() - startTime;
      
      searchLogger.info('Vector embeddings stored successfully', {
        embeddingCount: embeddings.length,
        duration,
        averageDimensions: embeddings.length > 0 
          ? embeddings.reduce((sum, e) => sum + e.embedding.length, 0) / embeddings.length 
          : 0,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      searchLogger.error('Failed to store vector embeddings', error as Error, {
        embeddingCount: embeddings.length,
        duration,
      });
      
      throw new VectorSearchError(
        `Failed to store embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { embeddingCount: embeddings.length }
      );
    }
  }

  /**
   * Update vector embedding
   */
  async updateEmbedding(
    contentId: string, 
    chunkId: string | null, 
    embedding: number[],
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const updateData: any = {
        embedding: JSON.stringify(embedding),
        updated_at: new Date(),
      };

      if (metadata) {
        updateData.metadata = JSON.stringify(metadata);
      }

      let query = db('search_embeddings')
        .where('content_id', contentId);

      if (chunkId) {
        query = query.where('chunk_id', chunkId);
      } else {
        query = query.whereNull('chunk_id');
      }

      const updated = await query.update(updateData);

      if (updated === 0) {
        searchLogger.warn('No embedding found to update', {
          contentId,
          chunkId,
        });
      } else {
        searchLogger.info('Vector embedding updated', {
          contentId,
          chunkId,
          embeddingDimensions: embedding.length,
        });
      }
    } catch (error) {
      searchLogger.error('Failed to update vector embedding', error as Error, {
        contentId,
        chunkId,
      });
      throw error;
    }
  }

  /**
   * Delete vector embeddings
   */
  async deleteEmbeddings(contentId: string, chunkId?: string): Promise<void> {
    try {
      let query = db('search_embeddings')
        .where('content_id', contentId);

      if (chunkId) {
        query = query.where('chunk_id', chunkId);
      }

      const deleted = await query.del();

      searchLogger.info('Vector embeddings deleted', {
        contentId,
        chunkId,
        deletedCount: deleted,
      });
    } catch (error) {
      searchLogger.error('Failed to delete vector embeddings', error as Error, {
        contentId,
        chunkId,
      });
      throw error;
    }
  }

  /**
   * Get embedding statistics
   */
  async getEmbeddingStats(): Promise<{
    totalEmbeddings: number;
    embeddingsByContentType: Record<string, number>;
    embeddingsByLanguage: Record<string, number>;
    averageTextLength: number;
    oldestEmbedding: Date | null;
    newestEmbedding: Date | null;
  }> {
    try {
      const [
        totalResult,
        contentTypeStats,
        languageStats,
        textLengthResult,
        dateRangeResult,
      ] = await Promise.all([
        db('search_embeddings').count('* as count').first(),
        db('search_embeddings')
          .select('content_type')
          .count('* as count')
          .groupBy('content_type'),
        db('search_embeddings')
          .select('language')
          .count('* as count')
          .groupBy('language'),
        db('search_embeddings')
          .avg(db.raw('length(text) as avg_length'))
          .first(),
        db('search_embeddings')
          .select(
            db.raw('MIN(created_at) as oldest'),
            db.raw('MAX(created_at) as newest')
          )
          .first(),
      ]);

      const embeddingsByContentType: Record<string, number> = {};
      contentTypeStats.forEach(row => {
        embeddingsByContentType[row.content_type || 'unknown'] = parseInt(row.count, 10);
      });

      const embeddingsByLanguage: Record<string, number> = {};
      languageStats.forEach(row => {
        embeddingsByLanguage[row.language || 'unknown'] = parseInt(row.count, 10);
      });

      return {
        totalEmbeddings: parseInt(totalResult?.count || '0', 10),
        embeddingsByContentType,
        embeddingsByLanguage,
        averageTextLength: Math.round(textLengthResult?.avg_length || 0),
        oldestEmbedding: dateRangeResult?.oldest ? new Date(dateRangeResult.oldest) : null,
        newestEmbedding: dateRangeResult?.newest ? new Date(dateRangeResult.newest) : null,
      };
    } catch (error) {
      searchLogger.error('Failed to get embedding statistics', error as Error);
      throw error;
    }
  }

  /**
   * Find similar content based on content ID
   */
  async findSimilarContent(
    contentId: string, 
    limit: number = 10,
    threshold: number = 0.8
  ): Promise<VectorSearchResult[]> {
    try {
      // Get the embedding for the given content
      const sourceEmbedding = await db('search_embeddings')
        .select('embedding')
        .where('content_id', contentId)
        .first();

      if (!sourceEmbedding) {
        throw new VectorSearchError('Source content embedding not found');
      }

      const embedding = JSON.parse(sourceEmbedding.embedding);

      // Find similar content (excluding the source)
      const results = await this.similaritySearch({
        vector: embedding,
        limit: limit + 1, // +1 to account for excluding source
        threshold,
      });

      // Filter out the source content
      return results.filter(result => result.contentId !== contentId).slice(0, limit);
    } catch (error) {
      searchLogger.error('Failed to find similar content', error as Error, {
        contentId,
        limit,
        threshold,
      });
      throw error;
    }
  }

  /**
   * Apply search filters to query
   */
  private applyFilters(query: any, filters: SearchFilters): any {
    if (filters.courseIds?.length) {
      query = query.whereIn('se.course_id', filters.courseIds);
    }

    if (filters.moduleIds?.length) {
      query = query.whereIn('se.module_id', filters.moduleIds);
    }

    if (filters.contentTypes?.length) {
      query = query.whereIn('se.content_type', filters.contentTypes);
    }

    if (filters.language) {
      query = query.where('se.language', filters.language);
    }

    if (filters.dateRange) {
      query = query.whereBetween('se.created_at', [
        filters.dateRange.from,
        filters.dateRange.to,
      ]);
    }

    return query;
  }

  /**
   * Map database row to VectorSearchResult
   */
  private mapRowToVectorResult(row: any): VectorSearchResult {
    return {
      id: row.id,
      contentId: row.content_id,
      chunkId: row.chunk_id,
      text: row.text,
      similarity: parseFloat(row.similarity),
      metadata: {
        courseId: row.course_id,
        moduleId: row.module_id,
        contentType: row.content_type,
        language: row.language,
        ...(row.metadata ? JSON.parse(row.metadata) : {}),
      },
    };
  }

  /**
   * Health check for vector search
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test basic vector operation
      const testResult = await db('search_embeddings')
        .select('id')
        .limit(1)
        .first();

      // Test vector extension
      await db.raw('SELECT vector_dims(\'[1,2,3]\'::vector)');

      return true;
    } catch (error) {
      searchLogger.error('Vector search health check failed', error as Error);
      return false;
    }
  }

  /**
   * Get service statistics
   */
  getStats(): any {
    return {
      vectorDimensions: config.VECTOR_DIMENSIONS,
      similarityThreshold: searchConfig.vector.similarityThreshold,
      maxResults: searchConfig.vector.maxResults,
      timeout: searchConfig.vector.timeout,
    };
  }
}

// Export singleton instance
export const vectorSearchService = new VectorSearchService();
