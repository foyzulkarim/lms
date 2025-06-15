import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable UUID extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  
  // Enable pgvector extension for vector operations
  await knex.raw('CREATE EXTENSION IF NOT EXISTS vector');

  // Search analytics table
  await knex.schema.createTable('search_queries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.text('query_text').notNullable();
    table.string('search_type', 50).notNullable();
    table.uuid('user_id');
    table.string('session_id', 100);
    
    // Results information
    table.integer('total_results').notNullable();
    table.integer('search_time_ms').notNullable();
    table.integer('clicked_results').defaultTo(0);
    
    // Context and filters
    table.jsonb('filters');
    table.jsonb('context');
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['user_id', 'created_at'], 'idx_search_queries_user');
    table.index('search_type', 'idx_search_queries_type');
    table.index('created_at', 'idx_search_queries_created');
  });

  // Search suggestions table
  await knex.schema.createTable('search_suggestions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.text('query').notNullable().unique();
    table.text('suggestion').notNullable();
    table.integer('frequency').defaultTo(1);
    table.specificType('context_tags', 'text[]').defaultTo('{}');
    
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Indexes
    table.index('query', 'idx_search_suggestions_query');
    table.index('frequency', 'idx_search_suggestions_frequency');
  });

  // User search preferences table
  await knex.schema.createTable('user_search_preferences', (table) => {
    table.uuid('user_id').primary();
    table.specificType('preferred_content_types', 'text[]').defaultTo('{}');
    table.specificType('preferred_languages', 'text[]').defaultTo('{}');
    table.jsonb('search_filters');
    table.boolean('rag_enabled').defaultTo(true);
    table.boolean('semantic_search_enabled').defaultTo(true);
    
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // RAG interactions table
  await knex.schema.createTable('rag_interactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.text('query').notNullable();
    table.text('answer').notNullable();
    table.jsonb('sources').notNullable();
    table.float('confidence').notNullable();
    table.string('model', 100).notNullable();
    table.text('reasoning');
    table.jsonb('follow_up_questions');
    
    // User feedback
    table.uuid('user_id');
    table.integer('feedback_rating'); // 1-5 rating
    table.text('feedback_text');
    
    // Context
    table.uuid('course_id');
    table.string('session_id', 100);
    
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Indexes
    table.index('user_id', 'idx_rag_interactions_user');
    table.index('course_id', 'idx_rag_interactions_course');
    table.index('created_at', 'idx_rag_interactions_created');
    table.index('confidence', 'idx_rag_interactions_confidence');
  });

  // Vector embeddings table (for semantic search)
  await knex.schema.createTable('search_embeddings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('content_id').notNullable();
    table.uuid('chunk_id');
    table.text('text').notNullable();
    table.specificType('embedding', 'vector(1536)'); // Adjust dimensions based on model
    
    // Metadata for filtering
    table.uuid('course_id');
    table.uuid('module_id');
    table.string('content_type', 50);
    table.string('language', 10).defaultTo('en');
    table.string('embedding_model', 100);
    
    // Additional context
    table.jsonb('metadata');
    
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Indexes
    table.index('content_id', 'idx_search_embeddings_content');
    table.index('course_id', 'idx_search_embeddings_course');
    table.index('content_type', 'idx_search_embeddings_type');
    table.index('language', 'idx_search_embeddings_language');
  });

  // Create vector similarity search index (using pgvector)
  await knex.raw(`
    CREATE INDEX idx_search_embeddings_vector 
    ON search_embeddings 
    USING hnsw (embedding vector_cosine_ops)
  `);

  // Search result clicks table (for analytics)
  await knex.schema.createTable('search_result_clicks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('search_query_id').references('id').inTable('search_queries');
    table.uuid('result_id').notNullable();
    table.string('result_type', 50).notNullable();
    table.integer('result_position').notNullable();
    table.float('result_score');
    
    table.uuid('user_id');
    table.string('session_id', 100);
    
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Indexes
    table.index('search_query_id', 'idx_search_clicks_query');
    table.index('result_id', 'idx_search_clicks_result');
    table.index('user_id', 'idx_search_clicks_user');
  });

  // Indexing jobs table (for background processing)
  await knex.schema.createTable('indexing_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('job_type', 50).notNullable(); // index, update, delete
    table.uuid('document_id').notNullable();
    table.string('document_type', 50).notNullable();
    table.jsonb('document_data');
    
    // Job status
    table.string('status', 50).notNullable().defaultTo('pending');
    table.integer('priority').defaultTo(5);
    table.integer('attempts').defaultTo(0);
    table.integer('max_attempts').defaultTo(3);
    table.text('error_message');
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('scheduled_at', { useTz: true });
    table.timestamp('started_at', { useTz: true });
    table.timestamp('completed_at', { useTz: true });
    table.timestamp('next_retry_at', { useTz: true });
    
    // Indexes
    table.index(['status', 'scheduled_at'], 'idx_indexing_jobs_status');
    table.index('document_id', 'idx_indexing_jobs_document');
    table.index('priority', 'idx_indexing_jobs_priority');
  });

  // Search performance metrics table
  await knex.schema.createTable('search_metrics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.date('date').notNullable();
    table.string('search_type', 50).notNullable();
    
    // Performance metrics
    table.integer('total_searches').defaultTo(0);
    table.integer('successful_searches').defaultTo(0);
    table.integer('failed_searches').defaultTo(0);
    table.float('average_response_time').defaultTo(0);
    table.float('average_result_count').defaultTo(0);
    
    // User engagement
    table.integer('total_clicks').defaultTo(0);
    table.float('click_through_rate').defaultTo(0);
    table.integer('zero_result_searches').defaultTo(0);
    
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Unique constraint
    table.unique(['date', 'search_type'], 'uq_search_metrics_date_type');
    
    // Indexes
    table.index('date', 'idx_search_metrics_date');
    table.index('search_type', 'idx_search_metrics_type');
  });

  // Popular queries table (for trending/suggestions)
  await knex.schema.createTable('popular_queries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.text('query').notNullable();
    table.string('normalized_query').notNullable(); // Lowercased, trimmed
    table.integer('search_count').defaultTo(1);
    table.integer('click_count').defaultTo(0);
    table.float('success_rate').defaultTo(0);
    
    // Context
    table.uuid('course_id');
    table.string('language', 10).defaultTo('en');
    table.specificType('content_types', 'text[]').defaultTo('{}');
    
    // Time windows
    table.integer('daily_count').defaultTo(0);
    table.integer('weekly_count').defaultTo(0);
    table.integer('monthly_count').defaultTo(0);
    
    table.timestamp('first_searched_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('last_searched_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Indexes
    table.index('normalized_query', 'idx_popular_queries_normalized');
    table.index('search_count', 'idx_popular_queries_count');
    table.index('course_id', 'idx_popular_queries_course');
    table.index('last_searched_at', 'idx_popular_queries_last_searched');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('popular_queries');
  await knex.schema.dropTableIfExists('search_metrics');
  await knex.schema.dropTableIfExists('indexing_jobs');
  await knex.schema.dropTableIfExists('search_result_clicks');
  await knex.schema.dropTableIfExists('search_embeddings');
  await knex.schema.dropTableIfExists('rag_interactions');
  await knex.schema.dropTableIfExists('user_search_preferences');
  await knex.schema.dropTableIfExists('search_suggestions');
  await knex.schema.dropTableIfExists('search_queries');
}
