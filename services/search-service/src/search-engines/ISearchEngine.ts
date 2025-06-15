import {
  SearchQuery,
  SearchResponse,
  SearchSuggestion,
  IndexDocument,
  IndexingOperation,
  BulkIndexingResponse,
  IndexStatus,
  ReindexStatus,
  SearchableContentType,
} from '../types/search.types';

// Search engine interface
export interface ISearchEngine {
  /**
   * Perform a search query
   */
  search(query: SearchQuery): Promise<SearchResponse>;

  /**
   * Get auto-complete suggestions
   */
  suggest(partial: string, type?: SearchableContentType, limit?: number): Promise<SearchSuggestion[]>;

  /**
   * Index a single document
   */
  index(document: IndexDocument): Promise<void>;

  /**
   * Perform bulk indexing operations
   */
  bulkIndex(operations: IndexingOperation[]): Promise<BulkIndexingResponse>;

  /**
   * Update a document
   */
  update(index: string, id: string, document: Partial<IndexDocument>): Promise<void>;

  /**
   * Delete a document
   */
  delete(index: string, id: string): Promise<void>;

  /**
   * Create an index with mapping
   */
  createIndex(name: string, mapping: any, settings?: any): Promise<void>;

  /**
   * Delete an index
   */
  deleteIndex(name: string): Promise<void>;

  /**
   * Check if index exists
   */
  indexExists(name: string): Promise<boolean>;

  /**
   * Get index status and health
   */
  getIndexStatus(name: string): Promise<IndexStatus>;

  /**
   * Get all indices status
   */
  getAllIndicesStatus(): Promise<IndexStatus[]>;

  /**
   * Reindex from source to target
   */
  reindex(sourceIndex: string, targetIndex: string, query?: any): Promise<ReindexStatus>;

  /**
   * Refresh an index
   */
  refresh(index: string): Promise<void>;

  /**
   * Get document by ID
   */
  getDocument(index: string, id: string): Promise<IndexDocument | null>;

  /**
   * Check if document exists
   */
  documentExists(index: string, id: string): Promise<boolean>;

  /**
   * Get index mapping
   */
  getMapping(index: string): Promise<any>;

  /**
   * Update index mapping
   */
  updateMapping(index: string, mapping: any): Promise<void>;

  /**
   * Get index settings
   */
  getSettings(index: string): Promise<any>;

  /**
   * Update index settings
   */
  updateSettings(index: string, settings: any): Promise<void>;

  /**
   * Create or update index alias
   */
  updateAlias(actions: Array<{ add?: any; remove?: any }>): Promise<void>;

  /**
   * Get cluster health
   */
  health(): Promise<boolean>;

  /**
   * Get cluster info
   */
  info(): Promise<any>;

  /**
   * Get cluster stats
   */
  stats(): Promise<any>;

  /**
   * Close the connection
   */
  close(): Promise<void>;
}

export default ISearchEngine;
