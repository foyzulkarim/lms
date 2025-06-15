import { Client } from '@elastic/elasticsearch';
import { ISearchEngine } from './ISearchEngine';
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
  SearchResult,
  SearchFacets,
  FacetCount,
} from '../types/search.types';
import {
  ElasticsearchQuery,
  ElasticsearchSearchRequest,
  ElasticsearchSearchResponse,
  BoolQuery,
  MultiMatchQuery,
  TermsQuery,
  RangeQuery,
} from '../types/elasticsearch.types';
import { config } from '../config';
import { logger, logElasticsearch, logError } from '../utils/logger';

export class ElasticsearchEngine implements ISearchEngine {
  private client: Client;
  private indexPrefix: string;

  constructor() {
    this.indexPrefix = config.elasticsearch.indexPrefix;
    
    // Initialize Elasticsearch client
    this.client = new Client({
      node: config.elasticsearch.url,
      auth: config.elasticsearch.username && config.elasticsearch.password ? {
        username: config.elasticsearch.username,
        password: config.elasticsearch.password,
      } : undefined,
      maxRetries: config.elasticsearch.maxRetries,
      requestTimeout: config.elasticsearch.requestTimeout,
      pingTimeout: config.elasticsearch.pingTimeout,
    });

    logger.info('Elasticsearch client initialized', {
      url: config.elasticsearch.url,
      indexPrefix: this.indexPrefix,
    });
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    const startTime = Date.now();
    
    try {
      const esQuery = this.buildSearchQuery(query);
      const indices = this.getSearchIndices(query.types);

      const searchRequest: ElasticsearchSearchRequest = {
        index: indices,
        body: {
          query: esQuery.query,
          aggs: esQuery.aggs,
          sort: esQuery.sort,
          highlight: esQuery.highlight,
          from: query.pagination?.from || 0,
          size: Math.min(query.pagination?.size || 20, config.search.resultsLimit),
          timeout: `${config.search.timeout}ms`,
          track_total_hits: true,
        },
      };

      const response: ElasticsearchSearchResponse = await this.client.search(searchRequest);
      
      const searchResponse = this.formatSearchResponse(response, query);
      
      const duration = Date.now() - startTime;
      logElasticsearch('search', duration, {
        query: query.query,
        indices,
        total: searchResponse.total,
      });

      return searchResponse;
    } catch (error) {
      const duration = Date.now() - startTime;
      logError('Elasticsearch search failed', error as Error, {
        query: query.query,
        duration,
      });
      throw error;
    }
  }

  async suggest(partial: string, type?: SearchableContentType, limit: number = 10): Promise<SearchSuggestion[]> {
    const startTime = Date.now();
    
    try {
      const indices = type ? [this.getIndexName(type)] : this.getAllIndexNames();
      
      const suggestRequest = {
        index: indices,
        body: {
          suggest: {
            title_suggest: {
              prefix: partial,
              completion: {
                field: 'title.suggest',
                size: limit,
                skip_duplicates: true,
                fuzzy: {
                  fuzziness: 'AUTO',
                  min_length: 3,
                },
              },
            },
          },
        },
      };

      const response = await this.client.search(suggestRequest);
      const suggestions = this.formatSuggestions(response.body.suggest);
      
      const duration = Date.now() - startTime;
      logElasticsearch('suggest', duration, {
        partial,
        type,
        count: suggestions.length,
      });

      return suggestions;
    } catch (error) {
      const duration = Date.now() - startTime;
      logError('Elasticsearch suggest failed', error as Error, {
        partial,
        type,
        duration,
      });
      throw error;
    }
  }

  async index(document: IndexDocument): Promise<void> {
    const startTime = Date.now();
    
    try {
      const indexName = this.getIndexName(document.type);
      
      await this.client.index({
        index: indexName,
        id: document.id,
        body: document,
        refresh: 'wait_for',
      });

      const duration = Date.now() - startTime;
      logElasticsearch('index', duration, {
        index: indexName,
        id: document.id,
        type: document.type,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logError('Elasticsearch index failed', error as Error, {
        id: document.id,
        type: document.type,
        duration,
      });
      throw error;
    }
  }

  async bulkIndex(operations: IndexingOperation[]): Promise<BulkIndexingResponse> {
    const startTime = Date.now();
    
    try {
      const body: any[] = [];
      
      for (const operation of operations) {
        const indexName = operation.index.startsWith(this.indexPrefix) 
          ? operation.index 
          : `${this.indexPrefix}${operation.index}`;

        switch (operation.operation) {
          case 'index':
            body.push({ index: { _index: indexName, _id: operation.id } });
            body.push(operation.document);
            break;
          case 'update':
            body.push({ update: { _index: indexName, _id: operation.id } });
            body.push({ doc: operation.document });
            break;
          case 'delete':
            body.push({ delete: { _index: indexName, _id: operation.id } });
            break;
        }
      }

      const response = await this.client.bulk({
        body,
        refresh: 'wait_for',
        timeout: `${config.indexing.bulkTimeout}ms`,
      });

      const bulkResponse: BulkIndexingResponse = {
        took: response.body.took,
        errors: response.body.errors,
        items: response.body.items,
      };

      const duration = Date.now() - startTime;
      logElasticsearch('bulk_index', duration, {
        operations: operations.length,
        errors: bulkResponse.errors,
      });

      return bulkResponse;
    } catch (error) {
      const duration = Date.now() - startTime;
      logError('Elasticsearch bulk index failed', error as Error, {
        operations: operations.length,
        duration,
      });
      throw error;
    }
  }

  async update(index: string, id: string, document: Partial<IndexDocument>): Promise<void> {
    const startTime = Date.now();
    
    try {
      const indexName = this.getFullIndexName(index);
      
      await this.client.update({
        index: indexName,
        id,
        body: {
          doc: document,
        },
        refresh: 'wait_for',
      });

      const duration = Date.now() - startTime;
      logElasticsearch('update', duration, {
        index: indexName,
        id,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logError('Elasticsearch update failed', error as Error, {
        index,
        id,
        duration,
      });
      throw error;
    }
  }

  async delete(index: string, id: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const indexName = this.getFullIndexName(index);
      
      await this.client.delete({
        index: indexName,
        id,
        refresh: 'wait_for',
      });

      const duration = Date.now() - startTime;
      logElasticsearch('delete', duration, {
        index: indexName,
        id,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logError('Elasticsearch delete failed', error as Error, {
        index,
        id,
        duration,
      });
      throw error;
    }
  }

  async createIndex(name: string, mapping: any, settings?: any): Promise<void> {
    const startTime = Date.now();
    
    try {
      const indexName = this.getFullIndexName(name);
      
      await this.client.indices.create({
        index: indexName,
        body: {
          mappings: mapping,
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            refresh_interval: config.indexing.refreshInterval,
            ...settings,
          },
        },
      });

      const duration = Date.now() - startTime;
      logElasticsearch('create_index', duration, {
        index: indexName,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logError('Elasticsearch create index failed', error as Error, {
        index: name,
        duration,
      });
      throw error;
    }
  }

  async deleteIndex(name: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const indexName = this.getFullIndexName(name);
      
      await this.client.indices.delete({
        index: indexName,
      });

      const duration = Date.now() - startTime;
      logElasticsearch('delete_index', duration, {
        index: indexName,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logError('Elasticsearch delete index failed', error as Error, {
        index: name,
        duration,
      });
      throw error;
    }
  }

  async indexExists(name: string): Promise<boolean> {
    try {
      const indexName = this.getFullIndexName(name);
      const response = await this.client.indices.exists({
        index: indexName,
      });
      return response.body;
    } catch (error) {
      logError('Elasticsearch index exists check failed', error as Error, {
        index: name,
      });
      return false;
    }
  }

  async getIndexStatus(name: string): Promise<IndexStatus> {
    try {
      const indexName = this.getFullIndexName(name);
      
      const [healthResponse, statsResponse] = await Promise.all([
        this.client.cluster.health({ index: indexName }),
        this.client.indices.stats({ index: indexName }),
      ]);

      const health = healthResponse.body;
      const stats = statsResponse.body;
      const indexStats = stats.indices[indexName];

      return {
        name: indexName,
        health: health.status,
        status: indexStats ? 'open' : 'close',
        documentCount: indexStats?.total?.docs?.count || 0,
        size: this.formatBytes(indexStats?.total?.store?.size_in_bytes || 0),
        lastUpdated: new Date(),
      };
    } catch (error) {
      logError('Elasticsearch get index status failed', error as Error, {
        index: name,
      });
      throw error;
    }
  }

  async getAllIndicesStatus(): Promise<IndexStatus[]> {
    try {
      const pattern = `${this.indexPrefix}*`;
      
      const [healthResponse, statsResponse] = await Promise.all([
        this.client.cluster.health({ index: pattern }),
        this.client.indices.stats({ index: pattern }),
      ]);

      const health = healthResponse.body;
      const stats = statsResponse.body;

      const statuses: IndexStatus[] = [];
      
      for (const [indexName, indexStats] of Object.entries(stats.indices)) {
        statuses.push({
          name: indexName,
          health: health.status,
          status: 'open',
          documentCount: (indexStats as any).total?.docs?.count || 0,
          size: this.formatBytes((indexStats as any).total?.store?.size_in_bytes || 0),
          lastUpdated: new Date(),
        });
      }

      return statuses;
    } catch (error) {
      logError('Elasticsearch get all indices status failed', error as Error);
      throw error;
    }
  }

  async reindex(sourceIndex: string, targetIndex: string, query?: any): Promise<ReindexStatus> {
    const startTime = Date.now();
    
    try {
      const sourceIndexName = this.getFullIndexName(sourceIndex);
      const targetIndexName = this.getFullIndexName(targetIndex);
      
      const response = await this.client.reindex({
        body: {
          source: {
            index: sourceIndexName,
            query,
          },
          dest: {
            index: targetIndexName,
          },
        },
        wait_for_completion: false,
      });

      const duration = Date.now() - startTime;
      logElasticsearch('reindex', duration, {
        source: sourceIndexName,
        target: targetIndexName,
        taskId: response.body.task,
      });

      return {
        taskId: response.body.task,
        status: 'running',
        startTime: new Date(startTime),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logError('Elasticsearch reindex failed', error as Error, {
        source: sourceIndex,
        target: targetIndex,
        duration,
      });
      throw error;
    }
  }

  async refresh(index: string): Promise<void> {
    try {
      const indexName = this.getFullIndexName(index);
      await this.client.indices.refresh({ index: indexName });
    } catch (error) {
      logError('Elasticsearch refresh failed', error as Error, { index });
      throw error;
    }
  }

  async getDocument(index: string, id: string): Promise<IndexDocument | null> {
    try {
      const indexName = this.getFullIndexName(index);
      const response = await this.client.get({
        index: indexName,
        id,
      });
      return response.body._source;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      logError('Elasticsearch get document failed', error as Error, { index, id });
      throw error;
    }
  }

  async documentExists(index: string, id: string): Promise<boolean> {
    try {
      const indexName = this.getFullIndexName(index);
      const response = await this.client.exists({
        index: indexName,
        id,
      });
      return response.body;
    } catch (error) {
      logError('Elasticsearch document exists check failed', error as Error, { index, id });
      return false;
    }
  }

  async getMapping(index: string): Promise<any> {
    try {
      const indexName = this.getFullIndexName(index);
      const response = await this.client.indices.getMapping({
        index: indexName,
      });
      return response.body[indexName]?.mappings;
    } catch (error) {
      logError('Elasticsearch get mapping failed', error as Error, { index });
      throw error;
    }
  }

  async updateMapping(index: string, mapping: any): Promise<void> {
    try {
      const indexName = this.getFullIndexName(index);
      await this.client.indices.putMapping({
        index: indexName,
        body: mapping,
      });
    } catch (error) {
      logError('Elasticsearch update mapping failed', error as Error, { index });
      throw error;
    }
  }

  async getSettings(index: string): Promise<any> {
    try {
      const indexName = this.getFullIndexName(index);
      const response = await this.client.indices.getSettings({
        index: indexName,
      });
      return response.body[indexName]?.settings;
    } catch (error) {
      logError('Elasticsearch get settings failed', error as Error, { index });
      throw error;
    }
  }

  async updateSettings(index: string, settings: any): Promise<void> {
    try {
      const indexName = this.getFullIndexName(index);
      await this.client.indices.putSettings({
        index: indexName,
        body: settings,
      });
    } catch (error) {
      logError('Elasticsearch update settings failed', error as Error, { index });
      throw error;
    }
  }

  async updateAlias(actions: Array<{ add?: any; remove?: any }>): Promise<void> {
    try {
      await this.client.indices.updateAliases({
        body: { actions },
      });
    } catch (error) {
      logError('Elasticsearch update alias failed', error as Error);
      throw error;
    }
  }

  async health(): Promise<boolean> {
    try {
      const response = await this.client.cluster.health();
      return response.body.status !== 'red';
    } catch (error) {
      logError('Elasticsearch health check failed', error as Error);
      return false;
    }
  }

  async info(): Promise<any> {
    try {
      const response = await this.client.info();
      return response.body;
    } catch (error) {
      logError('Elasticsearch info failed', error as Error);
      throw error;
    }
  }

  async stats(): Promise<any> {
    try {
      const response = await this.client.cluster.stats();
      return response.body;
    } catch (error) {
      logError('Elasticsearch stats failed', error as Error);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.close();
      logger.info('Elasticsearch client closed');
    } catch (error) {
      logError('Elasticsearch close failed', error as Error);
    }
  }

  // Private helper methods
  private buildSearchQuery(query: SearchQuery): any {
    const boolQuery: BoolQuery = {
      must: [],
      filter: [],
    };

    // Main search query
    if (query.query && query.query.trim()) {
      const multiMatch: MultiMatchQuery = {
        query: query.query,
        fields: [
          'title^3',
          'description^2',
          'content',
          'tags^2',
          'instructor.name^2',
        ],
        type: 'best_fields',
        fuzziness: 'AUTO',
        operator: 'and',
      };
      boolQuery.must!.push({ multi_match: multiMatch });
    } else {
      boolQuery.must!.push({ match_all: {} });
    }

    // Apply filters
    if (query.filters) {
      this.applyFilters(boolQuery, query.filters);
    }

    // Build aggregations for facets
    const aggs = this.buildAggregations();

    // Build sort
    const sort = this.buildSort(query.sort);

    // Build highlight
    const highlight = this.buildHighlight();

    return {
      query: { bool: boolQuery },
      aggs,
      sort,
      highlight,
    };
  }

  private applyFilters(boolQuery: BoolQuery, filters: any): void {
    if (filters.categories?.length) {
      boolQuery.filter!.push({ terms: { category: filters.categories } });
    }

    if (filters.difficulty?.length) {
      boolQuery.filter!.push({ terms: { difficulty: filters.difficulty } });
    }

    if (filters.instructors?.length) {
      boolQuery.filter!.push({ terms: { 'instructor.id': filters.instructors } });
    }

    if (filters.tags?.length) {
      boolQuery.filter!.push({ terms: { tags: filters.tags } });
    }

    if (filters.language?.length) {
      boolQuery.filter!.push({ terms: { language: filters.language } });
    }

    if (filters.priceRange) {
      const rangeQuery: RangeQuery = { price: {} };
      if (filters.priceRange.min !== undefined) {
        rangeQuery.price.gte = filters.priceRange.min;
      }
      if (filters.priceRange.max !== undefined) {
        rangeQuery.price.lte = filters.priceRange.max;
      }
      boolQuery.filter!.push({ range: rangeQuery });
    }

    if (filters.rating?.min) {
      boolQuery.filter!.push({
        range: { rating: { gte: filters.rating.min } },
      });
    }

    if (filters.dateRange) {
      const rangeQuery: RangeQuery = { createdAt: {} };
      if (filters.dateRange.start) {
        rangeQuery.createdAt.gte = filters.dateRange.start;
      }
      if (filters.dateRange.end) {
        rangeQuery.createdAt.lte = filters.dateRange.end;
      }
      boolQuery.filter!.push({ range: rangeQuery });
    }
  }

  private buildAggregations(): any {
    return {
      categories: {
        terms: { field: 'category', size: 20 },
      },
      difficulties: {
        terms: { field: 'difficulty', size: 10 },
      },
      instructors: {
        terms: { field: 'instructor.name', size: 20 },
      },
      tags: {
        terms: { field: 'tags', size: 30 },
      },
      languages: {
        terms: { field: 'language', size: 10 },
      },
      price_ranges: {
        range: {
          field: 'price',
          ranges: [
            { key: 'free', to: 1 },
            { key: 'low', from: 1, to: 50 },
            { key: 'medium', from: 50, to: 200 },
            { key: 'high', from: 200 },
          ],
        },
      },
      ratings: {
        histogram: {
          field: 'rating',
          interval: 1,
          min_doc_count: 1,
        },
      },
    };
  }

  private buildSort(sort?: any): any[] {
    if (!sort) {
      return [{ _score: { order: 'desc' } }];
    }

    const sortField = sort.field === 'relevance' ? '_score' : sort.field;
    return [{ [sortField]: { order: sort.order || 'desc' } }];
  }

  private buildHighlight(): any {
    return {
      fields: {
        title: {
          fragment_size: 150,
          number_of_fragments: 1,
        },
        description: {
          fragment_size: 200,
          number_of_fragments: 2,
        },
        content: {
          fragment_size: 200,
          number_of_fragments: 3,
        },
      },
      pre_tags: ['<mark>'],
      post_tags: ['</mark>'],
    };
  }

  private formatSearchResponse(response: ElasticsearchSearchResponse, query: SearchQuery): SearchResponse {
    const results: SearchResult[] = response.hits.hits.map((hit) => ({
      id: hit._id,
      type: this.getContentTypeFromIndex(hit._index),
      title: hit._source.title,
      description: hit._source.description,
      content: hit._source.content,
      url: this.buildResultUrl(hit._source, hit._index),
      thumbnailUrl: hit._source.thumbnailUrl,
      score: hit._score,
      highlights: this.formatHighlights(hit.highlight),
      metadata: this.formatMetadata(hit._source),
    }));

    const facets = this.formatFacets(response.aggregations);

    return {
      query: query.query,
      total: response.hits.total.value,
      took: response.took,
      results,
      facets,
      pagination: {
        from: query.pagination?.from || 0,
        size: query.pagination?.size || 20,
        hasNext: (query.pagination?.from || 0) + results.length < response.hits.total.value,
        hasPrev: (query.pagination?.from || 0) > 0,
      },
    };
  }

  private formatSuggestions(suggest: any): SearchSuggestion[] {
    const suggestions: SearchSuggestion[] = [];
    
    if (suggest.title_suggest) {
      for (const suggestion of suggest.title_suggest) {
        for (const option of suggestion.options) {
          suggestions.push({
            text: option.text,
            type: 'query',
            score: option._score,
          });
        }
      }
    }

    return suggestions;
  }

  private formatHighlights(highlight?: any): any[] {
    if (!highlight) return [];
    
    return Object.entries(highlight).map(([field, fragments]) => ({
      field,
      fragments: fragments as string[],
    }));
  }

  private formatMetadata(source: any): any {
    return {
      createdAt: new Date(source.createdAt),
      updatedAt: new Date(source.updatedAt),
      instructor: source.instructor,
      category: source.category,
      subcategory: source.subcategory,
      difficulty: source.difficulty,
      rating: source.rating,
      enrollmentCount: source.enrollmentCount,
      duration: source.duration,
      price: source.price,
      currency: source.currency,
      tags: source.tags,
      role: source.role,
      skills: source.skills,
      interests: source.interests,
      courseId: source.courseId,
      assessmentType: source.assessmentType,
      questionCount: source.questionCount,
      fileType: source.contentType,
      fileSize: source.size,
      mimeType: source.contentType,
      uploadedBy: source.uploadedBy,
    };
  }

  private formatFacets(aggregations?: any): SearchFacets | undefined {
    if (!aggregations) return undefined;

    return {
      categories: this.formatFacetCounts(aggregations.categories),
      difficulties: this.formatFacetCounts(aggregations.difficulties),
      instructors: this.formatFacetCounts(aggregations.instructors),
      tags: this.formatFacetCounts(aggregations.tags),
      types: [],
      languages: this.formatFacetCounts(aggregations.languages),
      priceRanges: this.formatFacetCounts(aggregations.price_ranges),
      ratings: this.formatFacetCounts(aggregations.ratings),
    };
  }

  private formatFacetCounts(aggregation: any): FacetCount[] {
    if (!aggregation?.buckets) return [];
    
    return aggregation.buckets.map((bucket: any) => ({
      key: bucket.key,
      count: bucket.doc_count,
    }));
  }

  private getSearchIndices(types?: SearchableContentType[]): string[] {
    if (!types || types.includes('all')) {
      return this.getAllIndexNames();
    }
    
    return types.map(type => this.getIndexName(type));
  }

  private getAllIndexNames(): string[] {
    return [
      this.getIndexName('course'),
      this.getIndexName('user'),
      this.getIndexName('assessment'),
      this.getIndexName('file'),
    ];
  }

  private getIndexName(type: SearchableContentType): string {
    const typeMap: Record<SearchableContentType, string> = {
      course: 'courses',
      user: 'users',
      assessment: 'assessments',
      file: 'files',
      all: '',
    };
    
    return `${this.indexPrefix}${typeMap[type]}`;
  }

  private getFullIndexName(index: string): string {
    return index.startsWith(this.indexPrefix) ? index : `${this.indexPrefix}${index}`;
  }

  private getContentTypeFromIndex(indexName: string): SearchableContentType {
    const type = indexName.replace(this.indexPrefix, '');
    const typeMap: Record<string, SearchableContentType> = {
      courses: 'course',
      users: 'user',
      assessments: 'assessment',
      files: 'file',
    };
    
    return typeMap[type] || 'course';
  }

  private buildResultUrl(source: any, index: string): string {
    const type = this.getContentTypeFromIndex(index);
    const baseUrl = config.cors.origin[0] || 'http://localhost:3000';
    
    switch (type) {
      case 'course':
        return `${baseUrl}/courses/${source.id}`;
      case 'user':
        return `${baseUrl}/users/${source.id}`;
      case 'assessment':
        return `${baseUrl}/assessments/${source.id}`;
      case 'file':
        return `${baseUrl}/files/${source.id}`;
      default:
        return `${baseUrl}`;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export default ElasticsearchEngine;
