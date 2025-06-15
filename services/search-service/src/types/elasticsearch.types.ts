// Elasticsearch-specific type definitions

// Elasticsearch client configuration
export interface ElasticsearchConfig {
  node: string;
  auth?: {
    username: string;
    password: string;
  };
  maxRetries: number;
  requestTimeout: number;
  pingTimeout: number;
}

// Elasticsearch query DSL types
export interface ElasticsearchQuery {
  bool?: BoolQuery;
  match?: MatchQuery;
  match_all?: {};
  multi_match?: MultiMatchQuery;
  term?: TermQuery;
  terms?: TermsQuery;
  range?: RangeQuery;
  exists?: ExistsQuery;
  prefix?: PrefixQuery;
  wildcard?: WildcardQuery;
  fuzzy?: FuzzyQuery;
  nested?: NestedQuery;
  function_score?: FunctionScoreQuery;
}

// Bool query
export interface BoolQuery {
  must?: ElasticsearchQuery[];
  must_not?: ElasticsearchQuery[];
  should?: ElasticsearchQuery[];
  filter?: ElasticsearchQuery[];
  minimum_should_match?: number | string;
  boost?: number;
}

// Match query
export interface MatchQuery {
  [field: string]: {
    query: string;
    operator?: 'and' | 'or';
    fuzziness?: string | number;
    prefix_length?: number;
    max_expansions?: number;
    boost?: number;
  } | string;
}

// Multi-match query
export interface MultiMatchQuery {
  query: string;
  fields: string[];
  type?: 'best_fields' | 'most_fields' | 'cross_fields' | 'phrase' | 'phrase_prefix' | 'bool_prefix';
  operator?: 'and' | 'or';
  fuzziness?: string | number;
  prefix_length?: number;
  max_expansions?: number;
  boost?: number;
}

// Term query
export interface TermQuery {
  [field: string]: {
    value: string | number | boolean;
    boost?: number;
  } | string | number | boolean;
}

// Terms query
export interface TermsQuery {
  [field: string]: (string | number | boolean)[];
}

// Range query
export interface RangeQuery {
  [field: string]: {
    gte?: number | string | Date;
    gt?: number | string | Date;
    lte?: number | string | Date;
    lt?: number | string | Date;
    format?: string;
    time_zone?: string;
    boost?: number;
  };
}

// Exists query
export interface ExistsQuery {
  field: string;
}

// Prefix query
export interface PrefixQuery {
  [field: string]: {
    value: string;
    boost?: number;
  } | string;
}

// Wildcard query
export interface WildcardQuery {
  [field: string]: {
    value: string;
    boost?: number;
    case_insensitive?: boolean;
  } | string;
}

// Fuzzy query
export interface FuzzyQuery {
  [field: string]: {
    value: string;
    fuzziness?: string | number;
    max_expansions?: number;
    prefix_length?: number;
    transpositions?: boolean;
    boost?: number;
  };
}

// Nested query
export interface NestedQuery {
  path: string;
  query: ElasticsearchQuery;
  score_mode?: 'avg' | 'sum' | 'min' | 'max' | 'none';
  boost?: number;
}

// Function score query
export interface FunctionScoreQuery {
  query?: ElasticsearchQuery;
  functions?: Array<{
    filter?: ElasticsearchQuery;
    weight?: number;
    field_value_factor?: {
      field: string;
      factor?: number;
      modifier?: 'none' | 'log' | 'log1p' | 'log2p' | 'ln' | 'ln1p' | 'ln2p' | 'square' | 'sqrt' | 'reciprocal';
      missing?: number;
    };
    script_score?: {
      script: {
        source: string;
        params?: Record<string, any>;
      };
    };
    random_score?: {
      seed?: number | string;
      field?: string;
    };
  }>;
  score_mode?: 'multiply' | 'sum' | 'avg' | 'first' | 'max' | 'min';
  boost_mode?: 'multiply' | 'replace' | 'sum' | 'avg' | 'max' | 'min';
  max_boost?: number;
  min_score?: number;
  boost?: number;
}

// Elasticsearch aggregations
export interface ElasticsearchAggregations {
  [name: string]: {
    terms?: TermsAggregation;
    date_histogram?: DateHistogramAggregation;
    histogram?: HistogramAggregation;
    range?: RangeAggregation;
    nested?: NestedAggregation;
    filter?: FilterAggregation;
    filters?: FiltersAggregation;
    cardinality?: CardinalityAggregation;
    avg?: MetricAggregation;
    sum?: MetricAggregation;
    min?: MetricAggregation;
    max?: MetricAggregation;
    stats?: MetricAggregation;
    aggs?: ElasticsearchAggregations;
  };
}

// Terms aggregation
export interface TermsAggregation {
  field: string;
  size?: number;
  order?: Array<{ [key: string]: 'asc' | 'desc' }>;
  include?: string | string[];
  exclude?: string | string[];
  missing?: any;
}

// Date histogram aggregation
export interface DateHistogramAggregation {
  field: string;
  calendar_interval?: string;
  fixed_interval?: string;
  format?: string;
  time_zone?: string;
  min_doc_count?: number;
  extended_bounds?: {
    min: string | Date;
    max: string | Date;
  };
}

// Histogram aggregation
export interface HistogramAggregation {
  field: string;
  interval: number;
  min_doc_count?: number;
  extended_bounds?: {
    min: number;
    max: number;
  };
}

// Range aggregation
export interface RangeAggregation {
  field: string;
  ranges: Array<{
    key?: string;
    from?: number;
    to?: number;
  }>;
}

// Nested aggregation
export interface NestedAggregation {
  path: string;
}

// Filter aggregation
export interface FilterAggregation {
  filter: ElasticsearchQuery;
}

// Filters aggregation
export interface FiltersAggregation {
  filters: {
    [key: string]: ElasticsearchQuery;
  };
}

// Cardinality aggregation
export interface CardinalityAggregation {
  field: string;
  precision_threshold?: number;
}

// Metric aggregation
export interface MetricAggregation {
  field: string;
  missing?: number;
}

// Elasticsearch sort
export interface ElasticsearchSort {
  [field: string]: {
    order: 'asc' | 'desc';
    mode?: 'min' | 'max' | 'sum' | 'avg' | 'median';
    nested?: {
      path: string;
      filter?: ElasticsearchQuery;
    };
    missing?: '_last' | '_first' | string | number;
    unmapped_type?: string;
  } | 'asc' | 'desc';
}

// Elasticsearch highlight
export interface ElasticsearchHighlight {
  fields: {
    [field: string]: {
      fragment_size?: number;
      number_of_fragments?: number;
      pre_tags?: string[];
      post_tags?: string[];
      type?: 'unified' | 'plain' | 'fvh';
      fragmenter?: 'simple' | 'span';
      order?: 'score' | 'none';
      require_field_match?: boolean;
    };
  };
  pre_tags?: string[];
  post_tags?: string[];
  fragment_size?: number;
  number_of_fragments?: number;
  order?: 'score' | 'none';
  require_field_match?: boolean;
}

// Elasticsearch suggest
export interface ElasticsearchSuggest {
  [name: string]: {
    text?: string;
    term?: TermSuggester;
    phrase?: PhraseSuggester;
    completion?: CompletionSuggester;
  };
}

// Term suggester
export interface TermSuggester {
  field: string;
  size?: number;
  sort?: 'score' | 'frequency';
  suggest_mode?: 'missing' | 'popular' | 'always';
  min_word_length?: number;
  prefix_length?: number;
  min_doc_freq?: number;
  max_edits?: number;
  max_inspections?: number;
  max_term_freq?: number;
  string_distance?: 'internal' | 'damerau_levenshtein' | 'levenshtein' | 'jaro_winkler' | 'ngram';
}

// Phrase suggester
export interface PhraseSuggester {
  field: string;
  size?: number;
  real_word_error_likelihood?: number;
  confidence?: number;
  max_errors?: number;
  separator?: string;
  direct_generator?: Array<{
    field: string;
    size?: number;
    suggest_mode?: 'missing' | 'popular' | 'always';
    min_word_length?: number;
    prefix_length?: number;
    min_doc_freq?: number;
    max_edits?: number;
    max_inspections?: number;
    max_term_freq?: number;
  }>;
  highlight?: {
    pre_tag: string;
    post_tag: string;
  };
  collate?: {
    query: {
      source: string;
    };
    params?: Record<string, any>;
    prune?: boolean;
  };
}

// Completion suggester
export interface CompletionSuggester {
  field: string;
  size?: number;
  skip_duplicates?: boolean;
  fuzzy?: {
    fuzziness?: string | number;
    transpositions?: boolean;
    min_length?: number;
    prefix_length?: number;
    unicode_aware?: boolean;
  };
  contexts?: Record<string, string | string[]>;
}

// Elasticsearch search request
export interface ElasticsearchSearchRequest {
  index: string | string[];
  body: {
    query?: ElasticsearchQuery;
    aggs?: ElasticsearchAggregations;
    sort?: ElasticsearchSort[];
    highlight?: ElasticsearchHighlight;
    suggest?: ElasticsearchSuggest;
    from?: number;
    size?: number;
    _source?: boolean | string | string[];
    timeout?: string;
    terminate_after?: number;
    track_total_hits?: boolean | number;
    min_score?: number;
    search_after?: any[];
  };
}

// Elasticsearch search response
export interface ElasticsearchSearchResponse<T = any> {
  took: number;
  timed_out: boolean;
  _shards: {
    total: number;
    successful: number;
    skipped: number;
    failed: number;
  };
  hits: {
    total: {
      value: number;
      relation: 'eq' | 'gte';
    };
    max_score: number | null;
    hits: Array<{
      _index: string;
      _type: string;
      _id: string;
      _score: number;
      _source: T;
      highlight?: Record<string, string[]>;
      sort?: any[];
    }>;
  };
  aggregations?: Record<string, any>;
  suggest?: Record<string, any>;
}

// Elasticsearch bulk request
export interface ElasticsearchBulkRequest {
  index: string;
  body: Array<
    | { index: { _id: string } }
    | { update: { _id: string } }
    | { delete: { _id: string } }
    | any
  >;
  refresh?: boolean | 'wait_for';
  timeout?: string;
}

// Elasticsearch bulk response
export interface ElasticsearchBulkResponse {
  took: number;
  errors: boolean;
  items: Array<{
    index?: {
      _index: string;
      _type: string;
      _id: string;
      _version: number;
      result: string;
      _shards: {
        total: number;
        successful: number;
        failed: number;
      };
      status: number;
      error?: any;
    };
    update?: {
      _index: string;
      _type: string;
      _id: string;
      _version: number;
      result: string;
      _shards: {
        total: number;
        successful: number;
        failed: number;
      };
      status: number;
      error?: any;
    };
    delete?: {
      _index: string;
      _type: string;
      _id: string;
      _version: number;
      result: string;
      _shards: {
        total: number;
        successful: number;
        failed: number;
      };
      status: number;
      error?: any;
    };
  }>;
}

// Index mapping
export interface IndexMapping {
  properties: {
    [field: string]: FieldMapping;
  };
}

// Field mapping
export interface FieldMapping {
  type: 'text' | 'keyword' | 'long' | 'integer' | 'short' | 'byte' | 'double' | 'float' | 'half_float' | 'scaled_float' | 'date' | 'boolean' | 'binary' | 'integer_range' | 'float_range' | 'long_range' | 'double_range' | 'date_range' | 'object' | 'nested' | 'geo_point' | 'geo_shape' | 'ip' | 'completion' | 'token_count' | 'murmur3' | 'annotated-text' | 'percolator' | 'join' | 'rank_feature' | 'rank_features' | 'dense_vector' | 'sparse_vector' | 'search_as_you_type' | 'alias' | 'flattened' | 'shape' | 'histogram' | 'constant_keyword';
  analyzer?: string;
  search_analyzer?: string;
  normalizer?: string;
  boost?: number;
  coerce?: boolean;
  copy_to?: string | string[];
  doc_values?: boolean;
  dynamic?: boolean | 'strict';
  enabled?: boolean;
  fielddata?: boolean;
  fields?: {
    [subfield: string]: FieldMapping;
  };
  format?: string;
  ignore_above?: number;
  ignore_malformed?: boolean;
  include_in_all?: boolean;
  index?: boolean;
  index_options?: 'docs' | 'freqs' | 'positions' | 'offsets';
  index_phrases?: boolean;
  index_prefixes?: {
    min_chars?: number;
    max_chars?: number;
  };
  meta?: Record<string, string>;
  norms?: boolean;
  null_value?: any;
  position_increment_gap?: number;
  properties?: {
    [field: string]: FieldMapping;
  };
  search_quote_analyzer?: string;
  similarity?: string;
  store?: boolean;
  term_vector?: 'no' | 'yes' | 'with_positions' | 'with_offsets' | 'with_positions_offsets' | 'with_positions_payloads' | 'with_positions_offsets_payloads';
  value?: string;
}

export default {
  ElasticsearchConfig,
  ElasticsearchQuery,
  BoolQuery,
  MatchQuery,
  MultiMatchQuery,
  TermQuery,
  TermsQuery,
  RangeQuery,
  ExistsQuery,
  PrefixQuery,
  WildcardQuery,
  FuzzyQuery,
  NestedQuery,
  FunctionScoreQuery,
  ElasticsearchAggregations,
  TermsAggregation,
  DateHistogramAggregation,
  HistogramAggregation,
  RangeAggregation,
  NestedAggregation,
  FilterAggregation,
  FiltersAggregation,
  CardinalityAggregation,
  MetricAggregation,
  ElasticsearchSort,
  ElasticsearchHighlight,
  ElasticsearchSuggest,
  TermSuggester,
  PhraseSuggester,
  CompletionSuggester,
  ElasticsearchSearchRequest,
  ElasticsearchSearchResponse,
  ElasticsearchBulkRequest,
  ElasticsearchBulkResponse,
  IndexMapping,
  FieldMapping,
};
