import { v4 as uuidv4 } from 'uuid';
import { db, withTransaction } from '@/utils/database';
import { contentLogger } from '@/utils/logger';
import { llmGatewayService } from '@/services/llm-gateway.service';
import { fileService } from '@/services/file.service';
import { textExtractor } from '@/processors/text-extractor';
import { contentChunker } from '@/processors/content-chunker';
import { youTubeAdapter } from '@/adapters/youtube.adapter';
import { gitHubAdapter } from '@/adapters/github.adapter';
import { 
  ContentItem, 
  ContentChunk, 
  ProcessingStatus, 
  ExtractionMethod,
  ContentSourceType,
  FileIngestionRequest,
  URLIngestionRequest,
  YouTubeIngestionRequest,
  GitHubIngestionRequest,
  ManualContentRequest,
  IngestionResponse,
  ContentListResponse,
  ChunkListResponse,
  ProcessingMetadata,
  ContentIngestionError,
  ExtractionError,
  ProcessingError,
  EmbeddingError
} from '@/types';

export class ContentIngestionService {
  /**
   * Ingest content from file
   */
  async ingestFromFile(
    request: FileIngestionRequest,
    authToken?: string
  ): Promise<IngestionResponse> {
    const startTime = Date.now();
    
    try {
      contentLogger.info('Starting file ingestion', {
        fileId: request.fileId,
        courseId: request.courseId,
        extractionMethod: request.extractionMethod,
      });

      // Get file metadata and content
      const file = await fileService.getFile(request.fileId, authToken);
      
      // Check if file type is supported
      if (!fileService.isSupportedFileType(file.mimeType)) {
        throw new ExtractionError(`Unsupported file type: ${file.mimeType}`);
      }

      // Create content item
      const contentItem: ContentItem = {
        id: uuidv4(),
        sourceId: request.fileId,
        sourceType: ContentSourceType.FILE,
        sourceMetadata: {
          originalName: file.originalName,
          mimeType: file.mimeType,
          size: file.size,
          url: file.url,
        },
        title: request.title || file.originalName.replace(/\.[^/.]+$/, ''),
        description: request.description,
        content: '', // Will be filled during extraction
        contentType: 'text/plain',
        language: 'en',
        processingStatus: ProcessingStatus.PENDING,
        tags: request.tags || [],
        categories: request.categories || [],
        courseId: request.courseId,
        moduleId: request.moduleId,
        version: 1,
        isLatest: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Save initial content item
      await this.saveContentItem(contentItem);

      // Start processing asynchronously
      this.processContentAsync(contentItem, file, request.extractionMethod)
        .catch(error => {
          contentLogger.error('Async content processing failed', error, {
            contentId: contentItem.id,
          });
        });

      const duration = Date.now() - startTime;
      
      return {
        contentId: contentItem.id,
        status: ProcessingStatus.PENDING,
        estimatedDuration: this.estimateProcessingDuration(file.size, file.mimeType),
        message: 'Content ingestion started',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      contentLogger.error('File ingestion failed', error as Error, {
        fileId: request.fileId,
        duration,
      });
      
      throw error;
    }
  }

  /**
   * Ingest content from URL
   */
  async ingestFromURL(request: URLIngestionRequest): Promise<IngestionResponse> {
    const startTime = Date.now();
    
    try {
      contentLogger.info('Starting URL ingestion', {
        url: request.url,
        courseId: request.courseId,
        extractionMethod: request.extractionMethod,
      });

      // TODO: Implement URL content extraction
      // This would involve fetching the URL content and extracting text
      
      throw new Error('URL ingestion not implemented yet');
    } catch (error) {
      const duration = Date.now() - startTime;
      contentLogger.error('URL ingestion failed', error as Error, {
        url: request.url,
        duration,
      });
      
      throw error;
    }
  }

  /**
   * Ingest content from YouTube video
   */
  async ingestFromYouTube(request: YouTubeIngestionRequest): Promise<IngestionResponse> {
    const startTime = Date.now();
    
    try {
      contentLogger.info('Starting YouTube ingestion', {
        videoId: request.videoId,
        courseId: request.courseId,
      });

      // Extract content from YouTube
      const contentItem = await youTubeAdapter.ingestVideo(request);
      
      // Save content item
      await this.saveContentItem(contentItem);

      // Start processing asynchronously if content was extracted
      if (contentItem.content) {
        this.processContentAsync(contentItem)
          .catch(error => {
            contentLogger.error('Async YouTube content processing failed', error, {
              contentId: contentItem.id,
            });
          });
      }

      const duration = Date.now() - startTime;
      
      return {
        contentId: contentItem.id,
        status: contentItem.content ? ProcessingStatus.PROCESSING : ProcessingStatus.COMPLETED,
        estimatedDuration: contentItem.content ? this.estimateProcessingDuration(contentItem.content.length) : 0,
        message: 'YouTube content ingestion started',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      contentLogger.error('YouTube ingestion failed', error as Error, {
        videoId: request.videoId,
        duration,
      });
      
      throw error;
    }
  }

  /**
   * Ingest content from GitHub repository
   */
  async ingestFromGitHub(request: GitHubIngestionRequest): Promise<IngestionResponse> {
    const startTime = Date.now();
    
    try {
      contentLogger.info('Starting GitHub ingestion', {
        repository: request.repository,
        branch: request.branch,
        courseId: request.courseId,
      });

      // Extract content from GitHub
      const contentItems = await gitHubAdapter.ingestRepository(request);
      
      // Save all content items
      for (const contentItem of contentItems) {
        await this.saveContentItem(contentItem);
        
        // Start processing asynchronously
        this.processContentAsync(contentItem)
          .catch(error => {
            contentLogger.error('Async GitHub content processing failed', error, {
              contentId: contentItem.id,
            });
          });
      }

      const duration = Date.now() - startTime;
      
      return {
        contentId: contentItems[0]?.id || '',
        status: ProcessingStatus.PROCESSING,
        estimatedDuration: contentItems.length * 30000, // Rough estimate
        message: `GitHub repository ingestion started (${contentItems.length} files)`,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      contentLogger.error('GitHub ingestion failed', error as Error, {
        repository: request.repository,
        duration,
      });
      
      throw error;
    }
  }

  /**
   * Ingest manual content
   */
  async ingestManualContent(request: ManualContentRequest): Promise<IngestionResponse> {
    const startTime = Date.now();
    
    try {
      contentLogger.info('Starting manual content ingestion', {
        title: request.title,
        contentLength: request.content.length,
        courseId: request.courseId,
      });

      // Create content item
      const contentItem: ContentItem = {
        id: uuidv4(),
        sourceId: `manual_${Date.now()}`,
        sourceType: ContentSourceType.MANUAL,
        sourceMetadata: {
          inputMethod: 'manual',
        },
        title: request.title,
        description: `Manually entered content`,
        content: request.content,
        contentType: request.contentType || 'text/plain',
        language: request.language || 'en',
        processingStatus: ProcessingStatus.PROCESSING,
        tags: request.tags || [],
        categories: request.categories || [],
        courseId: request.courseId,
        moduleId: request.moduleId,
        version: 1,
        isLatest: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Save content item
      await this.saveContentItem(contentItem);

      // Start processing asynchronously
      this.processContentAsync(contentItem)
        .catch(error => {
          contentLogger.error('Async manual content processing failed', error, {
            contentId: contentItem.id,
          });
        });

      const duration = Date.now() - startTime;
      
      return {
        contentId: contentItem.id,
        status: ProcessingStatus.PROCESSING,
        estimatedDuration: this.estimateProcessingDuration(request.content.length),
        message: 'Manual content ingestion started',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      contentLogger.error('Manual content ingestion failed', error as Error, {
        title: request.title,
        duration,
      });
      
      throw error;
    }
  }

  /**
   * Process content asynchronously
   */
  private async processContentAsync(
    contentItem: ContentItem,
    file?: any,
    extractionMethod?: ExtractionMethod
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      contentLogger.contentProcessingStarted(contentItem.id, contentItem.sourceType);

      // Update status to extracting
      await this.updateContentStatus(contentItem.id, ProcessingStatus.EXTRACTING);

      // Extract text if needed
      if (!contentItem.content && file) {
        const extractionResult = await textExtractor.extractFromFile(
          file,
          extractionMethod || ExtractionMethod.AUTO
        );
        
        contentItem.content = extractionResult.content;
        contentItem.contentType = extractionResult.contentType || contentItem.contentType;
        contentItem.language = extractionResult.language || contentItem.language;
        
        if (extractionResult.title && !contentItem.title) {
          contentItem.title = extractionResult.title;
        }
        
        if (extractionResult.description && !contentItem.description) {
          contentItem.description = extractionResult.description;
        }

        // Update content with extracted text
        await this.updateContentItem(contentItem);
      }

      // Update status to processing
      await this.updateContentStatus(contentItem.id, ProcessingStatus.PROCESSING);

      // Chunk content
      await this.updateContentStatus(contentItem.id, ProcessingStatus.CHUNKING);
      const chunks = await contentChunker.chunkContent(contentItem);
      
      // Save chunks
      await this.saveContentChunks(chunks);

      // Generate embeddings
      await this.updateContentStatus(contentItem.id, ProcessingStatus.EMBEDDING);
      await this.generateEmbeddings(chunks);

      // Update processing metadata
      const processingMetadata: ProcessingMetadata = {
        extractionDuration: 0, // TODO: Track individual step durations
        processingDuration: Date.now() - startTime,
        embeddingDuration: 0,
        totalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokens, 0),
        confidence: 1.0,
      };

      // Update final status
      await this.updateContentStatus(contentItem.id, ProcessingStatus.COMPLETED, processingMetadata);
      await this.updateContentTotalChunks(contentItem.id, chunks.length);

      const duration = Date.now() - startTime;
      contentLogger.contentProcessingCompleted(contentItem.id, duration, chunks.length);

    } catch (error) {
      const duration = Date.now() - startTime;
      contentLogger.contentProcessingFailed(contentItem.id, error as Error);
      
      await this.updateContentStatus(contentItem.id, ProcessingStatus.FAILED, undefined, error as Error);
    }
  }

  /**
   * Generate embeddings for content chunks
   */
  private async generateEmbeddings(chunks: ContentChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    const startTime = Date.now();
    const contentId = chunks[0].contentId;
    
    contentLogger.embeddingStarted(contentId, chunks.length, 'text-embedding-ada-002');

    try {
      // Extract texts for embedding
      const texts = chunks.map(chunk => chunk.text);
      
      // Generate embeddings in batches
      const embeddings = await llmGatewayService.generateEmbeddingsBatch(texts);
      
      // Update chunks with embeddings
      for (let i = 0; i < chunks.length; i++) {
        chunks[i].embedding = embeddings[i];
        chunks[i].embeddingModel = 'text-embedding-ada-002';
        chunks[i].embeddingDimensions = embeddings[i].length;
        chunks[i].embeddedAt = new Date();
      }

      // Save embeddings to vector database
      await this.saveEmbeddings(chunks);

      const duration = Date.now() - startTime;
      contentLogger.embeddingCompleted(contentId, embeddings.length, duration);

    } catch (error) {
      contentLogger.embeddingFailed(contentId, error as Error, chunks.map(c => c.id));
      throw new EmbeddingError(
        `Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { contentId, chunkCount: chunks.length }
      );
    }
  }

  /**
   * Save content item to database
   */
  private async saveContentItem(contentItem: ContentItem): Promise<void> {
    try {
      await db('content_items').insert({
        id: contentItem.id,
        source_id: contentItem.sourceId,
        source_type: contentItem.sourceType,
        source_metadata: JSON.stringify(contentItem.sourceMetadata || {}),
        title: contentItem.title,
        description: contentItem.description,
        content: contentItem.content,
        content_type: contentItem.contentType,
        language: contentItem.language,
        processing_status: contentItem.processingStatus,
        processing_metadata: contentItem.processingMetadata ? JSON.stringify(contentItem.processingMetadata) : null,
        extraction_method: contentItem.extractionMethod,
        course_id: contentItem.courseId,
        module_id: contentItem.moduleId,
        tags: contentItem.tags,
        categories: contentItem.categories,
        version: contentItem.version,
        parent_id: contentItem.parentId,
        is_latest: contentItem.isLatest,
        created_at: contentItem.createdAt,
        updated_at: contentItem.updatedAt,
        processed_at: contentItem.processedAt,
        deleted_at: contentItem.deletedAt,
      });
    } catch (error) {
      contentLogger.error('Failed to save content item', error as Error, {
        contentId: contentItem.id,
      });
      throw new ProcessingError('Failed to save content item to database');
    }
  }

  /**
   * Update content item
   */
  private async updateContentItem(contentItem: ContentItem): Promise<void> {
    try {
      await db('content_items')
        .where('id', contentItem.id)
        .update({
          title: contentItem.title,
          description: contentItem.description,
          content: contentItem.content,
          content_type: contentItem.contentType,
          language: contentItem.language,
          updated_at: new Date(),
        });
    } catch (error) {
      contentLogger.error('Failed to update content item', error as Error, {
        contentId: contentItem.id,
      });
      throw new ProcessingError('Failed to update content item in database');
    }
  }

  /**
   * Update content processing status
   */
  private async updateContentStatus(
    contentId: string,
    status: ProcessingStatus,
    processingMetadata?: ProcessingMetadata,
    error?: Error
  ): Promise<void> {
    try {
      const updateData: any = {
        processing_status: status,
        updated_at: new Date(),
      };

      if (status === ProcessingStatus.COMPLETED) {
        updateData.processed_at = new Date();
      }

      if (processingMetadata) {
        updateData.processing_metadata = JSON.stringify(processingMetadata);
      }

      if (error) {
        updateData.processing_metadata = JSON.stringify({
          error: error.message,
          stack: error.stack,
        });
      }

      await db('content_items')
        .where('id', contentId)
        .update(updateData);
    } catch (dbError) {
      contentLogger.error('Failed to update content status', dbError as Error, {
        contentId,
        status,
      });
    }
  }

  /**
   * Update total chunks count
   */
  private async updateContentTotalChunks(contentId: string, totalChunks: number): Promise<void> {
    try {
      await db('content_items')
        .where('id', contentId)
        .update({
          // Note: We need to add total_chunks column to the schema
          updated_at: new Date(),
        });
    } catch (error) {
      contentLogger.error('Failed to update total chunks', error as Error, {
        contentId,
        totalChunks,
      });
    }
  }

  /**
   * Save content chunks to database
   */
  private async saveContentChunks(chunks: ContentChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    try {
      const chunkData = chunks.map(chunk => ({
        id: chunk.id,
        content_id: chunk.contentId,
        chunk_index: chunk.chunkIndex,
        text: chunk.text,
        tokens: chunk.tokens,
        start_position: chunk.startPosition,
        end_position: chunk.endPosition,
        metadata: JSON.stringify(chunk.metadata),
        embedding_model: chunk.embeddingModel,
        embedding_dimensions: chunk.embeddingDimensions,
        created_at: chunk.createdAt,
        embedded_at: chunk.embeddedAt,
      }));

      await db('content_chunks').insert(chunkData);
    } catch (error) {
      contentLogger.error('Failed to save content chunks', error as Error, {
        chunkCount: chunks.length,
        contentId: chunks[0]?.contentId,
      });
      throw new ProcessingError('Failed to save content chunks to database');
    }
  }

  /**
   * Save embeddings to vector database
   */
  private async saveEmbeddings(chunks: ContentChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    try {
      const embeddingData = chunks
        .filter(chunk => chunk.embedding)
        .map(chunk => ({
          chunk_id: chunk.id,
          content_id: chunk.contentId,
          embedding: JSON.stringify(chunk.embedding),
          created_at: chunk.embeddedAt || new Date(),
        }));

      if (embeddingData.length > 0) {
        await db('content_embeddings').insert(embeddingData);
      }
    } catch (error) {
      contentLogger.error('Failed to save embeddings', error as Error, {
        embeddingCount: chunks.filter(c => c.embedding).length,
        contentId: chunks[0]?.contentId,
      });
      throw new ProcessingError('Failed to save embeddings to database');
    }
  }

  /**
   * Get content by ID
   */
  async getContent(contentId: string): Promise<ContentItem | null> {
    try {
      const result = await db('content_items')
        .where('id', contentId)
        .where('deleted_at', null)
        .first();

      if (!result) {
        return null;
      }

      return this.mapDatabaseRowToContentItem(result);
    } catch (error) {
      contentLogger.error('Failed to get content', error as Error, { contentId });
      throw new ContentIngestionError('Failed to retrieve content', 'DATABASE_ERROR');
    }
  }

  /**
   * List content items
   */
  async listContent(filters: {
    courseId?: string;
    status?: ProcessingStatus;
    sourceType?: ContentSourceType;
    page?: number;
    limit?: number;
  }): Promise<ContentListResponse> {
    try {
      const {
        courseId,
        status,
        sourceType,
        page = 1,
        limit = 20,
      } = filters;

      let query = db('content_items')
        .where('deleted_at', null);

      if (courseId) {
        query = query.where('course_id', courseId);
      }

      if (status) {
        query = query.where('processing_status', status);
      }

      if (sourceType) {
        query = query.where('source_type', sourceType);
      }

      // Get total count
      const countResult = await query.clone().count('* as count').first();
      const total = parseInt(countResult?.count as string || '0', 10);

      // Get paginated results
      const offset = (page - 1) * limit;
      const results = await query
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset);

      const content = results.map(row => this.mapDatabaseRowToContentItem(row));

      return {
        content,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      contentLogger.error('Failed to list content', error as Error, filters);
      throw new ContentIngestionError('Failed to list content', 'DATABASE_ERROR');
    }
  }

  /**
   * Get content chunks
   */
  async getContentChunks(
    contentId: string,
    options: { page?: number; limit?: number; includeEmbeddings?: boolean } = {}
  ): Promise<ChunkListResponse> {
    try {
      const { page = 1, limit = 20, includeEmbeddings = false } = options;

      // Get total count
      const countResult = await db('content_chunks')
        .where('content_id', contentId)
        .count('* as count')
        .first();
      
      const total = parseInt(countResult?.count as string || '0', 10);

      // Get paginated chunks
      const offset = (page - 1) * limit;
      let query = db('content_chunks')
        .where('content_id', contentId)
        .orderBy('chunk_index', 'asc')
        .limit(limit)
        .offset(offset);

      if (includeEmbeddings) {
        query = query.leftJoin('content_embeddings', 'content_chunks.id', 'content_embeddings.chunk_id');
      }

      const results = await query;
      const chunks = results.map(row => this.mapDatabaseRowToContentChunk(row, includeEmbeddings));

      return {
        chunks,
        totalChunks: total,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      contentLogger.error('Failed to get content chunks', error as Error, { contentId });
      throw new ContentIngestionError('Failed to retrieve content chunks', 'DATABASE_ERROR');
    }
  }

  /**
   * Delete content
   */
  async deleteContent(contentId: string, options: {
    deleteEmbeddings?: boolean;
    deleteFromSearch?: boolean;
  } = {}): Promise<void> {
    try {
      await withTransaction(async (trx) => {
        // Soft delete content item
        await trx('content_items')
          .where('id', contentId)
          .update({
            deleted_at: new Date(),
            updated_at: new Date(),
          });

        if (options.deleteEmbeddings !== false) {
          // Delete embeddings
          await trx('content_embeddings')
            .whereIn('chunk_id', 
              trx('content_chunks')
                .select('id')
                .where('content_id', contentId)
            )
            .del();
        }

        // Delete chunks
        await trx('content_chunks')
          .where('content_id', contentId)
          .del();
      });

      contentLogger.info('Content deleted successfully', { contentId });
    } catch (error) {
      contentLogger.error('Failed to delete content', error as Error, { contentId });
      throw new ContentIngestionError('Failed to delete content', 'DATABASE_ERROR');
    }
  }

  /**
   * Estimate processing duration based on content size and type
   */
  private estimateProcessingDuration(sizeOrLength: number, mimeType?: string): number {
    // Base processing time per KB/character
    let baseTime = 100; // milliseconds

    if (mimeType) {
      if (mimeType === 'application/pdf') {
        baseTime = 200; // PDFs take longer
      } else if (mimeType.startsWith('image/')) {
        baseTime = 500; // OCR takes much longer
      } else if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
        baseTime = 1000; // Speech-to-text takes longest
      }
    }

    // Estimate based on size (assuming size in bytes or content length in characters)
    const estimatedMs = (sizeOrLength / 1024) * baseTime;
    
    // Cap at reasonable limits
    return Math.min(Math.max(estimatedMs, 5000), 300000); // 5s to 5min
  }

  /**
   * Map database row to ContentItem
   */
  private mapDatabaseRowToContentItem(row: any): ContentItem {
    return {
      id: row.id,
      sourceId: row.source_id,
      sourceType: row.source_type,
      sourceMetadata: row.source_metadata ? JSON.parse(row.source_metadata) : undefined,
      title: row.title,
      description: row.description,
      content: row.content,
      contentType: row.content_type,
      language: row.language,
      processingStatus: row.processing_status,
      processingMetadata: row.processing_metadata ? JSON.parse(row.processing_metadata) : undefined,
      extractionMethod: row.extraction_method,
      totalChunks: row.total_chunks || 0,
      courseId: row.course_id,
      moduleId: row.module_id,
      tags: row.tags || [],
      categories: row.categories || [],
      version: row.version,
      parentId: row.parent_id,
      isLatest: row.is_latest,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      processedAt: row.processed_at ? new Date(row.processed_at) : undefined,
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
    };
  }

  /**
   * Map database row to ContentChunk
   */
  private mapDatabaseRowToContentChunk(row: any, includeEmbedding: boolean = false): ContentChunk {
    const chunk: ContentChunk = {
      id: row.id,
      contentId: row.content_id,
      chunkIndex: row.chunk_index,
      text: row.text,
      tokens: row.tokens,
      startPosition: row.start_position,
      endPosition: row.end_position,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      embeddingModel: row.embedding_model,
      embeddingDimensions: row.embedding_dimensions,
      createdAt: new Date(row.created_at),
      embeddedAt: row.embedded_at ? new Date(row.embedded_at) : undefined,
    };

    if (includeEmbedding && row.embedding) {
      chunk.embedding = JSON.parse(row.embedding);
    }

    return chunk;
  }
}

// Export singleton instance
export const contentIngestionService = new ContentIngestionService();
