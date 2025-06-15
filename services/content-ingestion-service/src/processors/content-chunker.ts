import { encode } from 'tiktoken/encoders/cl100k_base';
import nlp from 'compromise';
import { v4 as uuidv4 } from 'uuid';
import { processingConfig } from '@/config/environment';
import { contentLogger } from '@/utils/logger';
import { ContentChunk, ChunkMetadata, ContentItem } from '@/types';

export interface ChunkingOptions {
  chunkSize?: number;
  overlap?: number;
  minChunkSize?: number;
  maxChunkSize?: number;
  preserveSentences?: boolean;
  preserveParagraphs?: boolean;
}

export class ContentChunker {
  private tokenizer: (text: string) => number[];

  constructor() {
    // Initialize tiktoken encoder for token counting
    this.tokenizer = encode;
  }

  /**
   * Chunk content into smaller pieces with overlap
   */
  async chunkContent(
    content: ContentItem,
    options: ChunkingOptions = {}
  ): Promise<ContentChunk[]> {
    const startTime = Date.now();
    contentLogger.chunkingStarted(content.id, content.content.length);

    const {
      chunkSize = processingConfig.chunking.defaultSize,
      overlap = processingConfig.chunking.overlap,
      minChunkSize = processingConfig.chunking.minChunkSize,
      maxChunkSize = processingConfig.chunking.maxChunkSize,
      preserveSentences = true,
      preserveParagraphs = true,
    } = options;

    try {
      let chunks: ContentChunk[];

      // Choose chunking strategy based on content type
      if (content.contentType === 'text/html') {
        chunks = await this.chunkHTML(content, { chunkSize, overlap, minChunkSize, maxChunkSize });
      } else if (content.contentType === 'text/markdown') {
        chunks = await this.chunkMarkdown(content, { chunkSize, overlap, minChunkSize, maxChunkSize });
      } else {
        chunks = await this.chunkPlainText(content, {
          chunkSize,
          overlap,
          minChunkSize,
          maxChunkSize,
          preserveSentences,
          preserveParagraphs,
        });
      }

      // Filter out chunks that are too small
      chunks = chunks.filter(chunk => chunk.tokens >= minChunkSize);

      // Calculate total tokens
      const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);

      const duration = Date.now() - startTime;
      contentLogger.chunkingCompleted(content.id, chunks.length, totalTokens);

      return chunks;
    } catch (error) {
      contentLogger.error('Content chunking failed', error as Error, {
        contentId: content.id,
        contentLength: content.content.length,
      });
      throw error;
    }
  }

  /**
   * Chunk plain text content
   */
  private async chunkPlainText(
    content: ContentItem,
    options: ChunkingOptions
  ): Promise<ContentChunk[]> {
    const { chunkSize, overlap, preserveSentences, preserveParagraphs } = options;
    const chunks: ContentChunk[] = [];

    // Split into paragraphs first if preserving paragraph structure
    let segments: string[];
    if (preserveParagraphs) {
      segments = content.content.split(/\n\s*\n/).filter(p => p.trim());
    } else {
      segments = [content.content];
    }

    let globalPosition = 0;
    let chunkIndex = 0;

    for (const segment of segments) {
      const segmentChunks = await this.chunkSegment(
        segment,
        content.id,
        chunkIndex,
        globalPosition,
        { chunkSize: chunkSize!, overlap: overlap!, preserveSentences }
      );

      chunks.push(...segmentChunks);
      chunkIndex += segmentChunks.length;
      globalPosition += segment.length + 2; // +2 for paragraph separator
    }

    return chunks;
  }

  /**
   * Chunk HTML content preserving structure
   */
  private async chunkHTML(
    content: ContentItem,
    options: ChunkingOptions
  ): Promise<ContentChunk[]> {
    // For HTML, we'll work with the plain text but preserve some structure info
    const chunks = await this.chunkPlainText(content, {
      ...options,
      preserveParagraphs: true,
      preserveSentences: true,
    });

    // Add HTML-specific metadata
    return chunks.map(chunk => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        contentType: 'html',
      },
    }));
  }

  /**
   * Chunk Markdown content preserving structure
   */
  private async chunkMarkdown(
    content: ContentItem,
    options: ChunkingOptions
  ): Promise<ContentChunk[]> {
    const chunks: ContentChunk[] = [];
    const lines = content.content.split('\n');
    
    let currentChunk = '';
    let currentTokens = 0;
    let chunkIndex = 0;
    let startPosition = 0;
    let currentSection = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineTokens = this.countTokens(line);

      // Check for markdown headers
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        currentSection = headerMatch[2];
        
        // If we have a current chunk and adding this line would exceed the limit
        if (currentChunk && currentTokens + lineTokens > options.chunkSize!) {
          // Create chunk with current content
          const chunk = this.createChunk(
            content.id,
            chunkIndex++,
            currentChunk.trim(),
            currentTokens,
            startPosition,
            startPosition + currentChunk.length,
            { section: currentSection }
          );
          chunks.push(chunk);

          // Start new chunk with overlap
          const overlapText = this.getOverlapText(currentChunk, options.overlap!);
          currentChunk = overlapText + line + '\n';
          currentTokens = this.countTokens(currentChunk);
          startPosition += currentChunk.length - overlapText.length;
        } else {
          currentChunk += line + '\n';
          currentTokens += lineTokens;
        }
      } else {
        // Regular line
        if (currentTokens + lineTokens > options.chunkSize! && currentChunk) {
          // Create chunk
          const chunk = this.createChunk(
            content.id,
            chunkIndex++,
            currentChunk.trim(),
            currentTokens,
            startPosition,
            startPosition + currentChunk.length,
            { section: currentSection }
          );
          chunks.push(chunk);

          // Start new chunk with overlap
          const overlapText = this.getOverlapText(currentChunk, options.overlap!);
          currentChunk = overlapText + line + '\n';
          currentTokens = this.countTokens(currentChunk);
          startPosition += currentChunk.length - overlapText.length;
        } else {
          currentChunk += line + '\n';
          currentTokens += lineTokens;
        }
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      const chunk = this.createChunk(
        content.id,
        chunkIndex,
        currentChunk.trim(),
        currentTokens,
        startPosition,
        startPosition + currentChunk.length,
        { section: currentSection }
      );
      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Chunk a text segment
   */
  private async chunkSegment(
    text: string,
    contentId: string,
    startChunkIndex: number,
    globalStartPosition: number,
    options: { chunkSize: number; overlap: number; preserveSentences?: boolean }
  ): Promise<ContentChunk[]> {
    const chunks: ContentChunk[] = [];
    const { chunkSize, overlap, preserveSentences } = options;

    if (preserveSentences) {
      return this.chunkBySentences(text, contentId, startChunkIndex, globalStartPosition, chunkSize, overlap);
    } else {
      return this.chunkByTokens(text, contentId, startChunkIndex, globalStartPosition, chunkSize, overlap);
    }
  }

  /**
   * Chunk text by sentences to preserve meaning
   */
  private chunkBySentences(
    text: string,
    contentId: string,
    startChunkIndex: number,
    globalStartPosition: number,
    chunkSize: number,
    overlap: number
  ): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    
    // Use compromise.js for better sentence detection
    const doc = nlp(text);
    const sentences = doc.sentences().out('array') as string[];
    
    let currentChunk = '';
    let currentTokens = 0;
    let chunkIndex = startChunkIndex;
    let startPosition = globalStartPosition;

    for (const sentence of sentences) {
      const sentenceTokens = this.countTokens(sentence);

      if (currentTokens + sentenceTokens > chunkSize && currentChunk) {
        // Create chunk
        const chunk = this.createChunk(
          contentId,
          chunkIndex++,
          currentChunk.trim(),
          currentTokens,
          startPosition,
          startPosition + currentChunk.length
        );
        chunks.push(chunk);

        // Start new chunk with overlap
        const overlapText = this.getOverlapText(currentChunk, overlap);
        currentChunk = overlapText + sentence + ' ';
        currentTokens = this.countTokens(currentChunk);
        startPosition += currentChunk.length - overlapText.length;
      } else {
        currentChunk += sentence + ' ';
        currentTokens += sentenceTokens;
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      const chunk = this.createChunk(
        contentId,
        chunkIndex,
        currentChunk.trim(),
        currentTokens,
        startPosition,
        startPosition + currentChunk.length
      );
      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Chunk text by token count (simple splitting)
   */
  private chunkByTokens(
    text: string,
    contentId: string,
    startChunkIndex: number,
    globalStartPosition: number,
    chunkSize: number,
    overlap: number
  ): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    const words = text.split(/\s+/);
    
    let currentChunk = '';
    let currentTokens = 0;
    let chunkIndex = startChunkIndex;
    let startPosition = globalStartPosition;

    for (const word of words) {
      const wordTokens = this.countTokens(word);

      if (currentTokens + wordTokens > chunkSize && currentChunk) {
        // Create chunk
        const chunk = this.createChunk(
          contentId,
          chunkIndex++,
          currentChunk.trim(),
          currentTokens,
          startPosition,
          startPosition + currentChunk.length
        );
        chunks.push(chunk);

        // Start new chunk with overlap
        const overlapText = this.getOverlapText(currentChunk, overlap);
        currentChunk = overlapText + word + ' ';
        currentTokens = this.countTokens(currentChunk);
        startPosition += currentChunk.length - overlapText.length;
      } else {
        currentChunk += word + ' ';
        currentTokens += wordTokens;
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      const chunk = this.createChunk(
        contentId,
        chunkIndex,
        currentChunk.trim(),
        currentTokens,
        startPosition,
        startPosition + currentChunk.length
      );
      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Create a content chunk
   */
  private createChunk(
    contentId: string,
    chunkIndex: number,
    text: string,
    tokens: number,
    startPosition: number,
    endPosition: number,
    additionalMetadata: Partial<ChunkMetadata> = {}
  ): ContentChunk {
    return {
      id: uuidv4(),
      contentId,
      chunkIndex,
      text,
      tokens,
      startPosition,
      endPosition,
      metadata: {
        confidence: 1.0,
        ...additionalMetadata,
      },
      createdAt: new Date(),
    };
  }

  /**
   * Get overlap text from the end of current chunk
   */
  private getOverlapText(text: string, overlapTokens: number): string {
    if (overlapTokens <= 0) return '';

    const words = text.trim().split(/\s+/);
    const overlapWords = Math.min(overlapTokens, Math.floor(words.length * 0.3)); // Max 30% overlap
    
    return words.slice(-overlapWords).join(' ') + ' ';
  }

  /**
   * Count tokens in text using tiktoken
   */
  private countTokens(text: string): number {
    try {
      return this.tokenizer(text).length;
    } catch (error) {
      // Fallback to word count * 1.3 (rough approximation)
      return Math.ceil(text.split(/\s+/).length * 1.3);
    }
  }

  /**
   * Optimize chunks by merging small adjacent chunks
   */
  optimizeChunks(chunks: ContentChunk[], minChunkSize: number): ContentChunk[] {
    const optimized: ContentChunk[] = [];
    let i = 0;

    while (i < chunks.length) {
      const currentChunk = chunks[i];

      // If current chunk is too small and there's a next chunk
      if (currentChunk.tokens < minChunkSize && i + 1 < chunks.length) {
        const nextChunk = chunks[i + 1];
        
        // Merge if combined size is reasonable
        if (currentChunk.tokens + nextChunk.tokens <= processingConfig.chunking.maxChunkSize) {
          const mergedChunk: ContentChunk = {
            ...currentChunk,
            text: currentChunk.text + ' ' + nextChunk.text,
            tokens: currentChunk.tokens + nextChunk.tokens,
            endPosition: nextChunk.endPosition,
            metadata: {
              ...currentChunk.metadata,
              merged: true,
            },
          };
          
          optimized.push(mergedChunk);
          i += 2; // Skip next chunk as it's been merged
          continue;
        }
      }

      optimized.push(currentChunk);
      i++;
    }

    // Update chunk indices
    return optimized.map((chunk, index) => ({
      ...chunk,
      chunkIndex: index,
    }));
  }

  /**
   * Get chunking statistics
   */
  getChunkingStats(chunks: ContentChunk[]): {
    totalChunks: number;
    totalTokens: number;
    averageTokensPerChunk: number;
    minTokens: number;
    maxTokens: number;
    averageChunkLength: number;
  } {
    if (chunks.length === 0) {
      return {
        totalChunks: 0,
        totalTokens: 0,
        averageTokensPerChunk: 0,
        minTokens: 0,
        maxTokens: 0,
        averageChunkLength: 0,
      };
    }

    const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);
    const tokenCounts = chunks.map(chunk => chunk.tokens);
    const chunkLengths = chunks.map(chunk => chunk.text.length);

    return {
      totalChunks: chunks.length,
      totalTokens,
      averageTokensPerChunk: Math.round(totalTokens / chunks.length),
      minTokens: Math.min(...tokenCounts),
      maxTokens: Math.max(...tokenCounts),
      averageChunkLength: Math.round(chunkLengths.reduce((sum, len) => sum + len, 0) / chunks.length),
    };
  }

  /**
   * Validate chunk quality
   */
  validateChunks(chunks: ContentChunk[]): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check for empty chunks
    const emptyChunks = chunks.filter(chunk => !chunk.text.trim());
    if (emptyChunks.length > 0) {
      issues.push(`Found ${emptyChunks.length} empty chunks`);
    }

    // Check for chunks that are too small
    const tooSmallChunks = chunks.filter(chunk => chunk.tokens < processingConfig.chunking.minChunkSize);
    if (tooSmallChunks.length > 0) {
      issues.push(`Found ${tooSmallChunks.length} chunks below minimum size`);
    }

    // Check for chunks that are too large
    const tooLargeChunks = chunks.filter(chunk => chunk.tokens > processingConfig.chunking.maxChunkSize);
    if (tooLargeChunks.length > 0) {
      issues.push(`Found ${tooLargeChunks.length} chunks above maximum size`);
    }

    // Check for duplicate chunks
    const textSet = new Set();
    const duplicates = chunks.filter(chunk => {
      if (textSet.has(chunk.text)) {
        return true;
      }
      textSet.add(chunk.text);
      return false;
    });
    if (duplicates.length > 0) {
      issues.push(`Found ${duplicates.length} duplicate chunks`);
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }
}

// Export singleton instance
export const contentChunker = new ContentChunker();
