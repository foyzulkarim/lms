import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable UUID extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  
  // Enable pgvector extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS vector');
  
  // Create content_items table
  await knex.schema.createTable('content_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('source_id', 500).notNullable();
    table.string('source_type', 50).notNullable();
    table.jsonb('source_metadata');
    
    // Content information
    table.string('title', 500).notNullable();
    table.text('description');
    table.text('content').notNullable();
    table.string('content_type', 100).notNullable();
    table.string('language', 10).defaultTo('en');
    
    // Processing information
    table.string('processing_status', 50).notNullable().defaultTo('pending');
    table.jsonb('processing_metadata');
    table.string('extraction_method', 50);
    
    // Context
    table.uuid('course_id');
    table.uuid('module_id');
    table.specificType('tags', 'text[]').defaultTo('{}');
    table.specificType('categories', 'text[]').defaultTo('{}');
    
    // Versioning
    table.integer('version').notNullable().defaultTo(1);
    table.uuid('parent_id').references('id').inTable('content_items');
    table.boolean('is_latest').notNullable().defaultTo(true);
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('processed_at', { useTz: true });
    table.timestamp('deleted_at', { useTz: true });
    
    // Indexes
    table.index(['source_type', 'source_id'], 'idx_content_items_source');
    table.index('course_id', 'idx_content_items_course');
    table.index('processing_status', 'idx_content_items_status');
    table.index('created_at', 'idx_content_items_created');
    table.index('is_latest', 'idx_content_items_latest');
  });
  
  // Create content_chunks table
  await knex.schema.createTable('content_chunks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('content_id').notNullable().references('id').inTable('content_items').onDelete('CASCADE');
    table.integer('chunk_index').notNullable();
    table.text('text').notNullable();
    table.integer('tokens').notNullable();
    
    // Position information
    table.integer('start_position').notNullable();
    table.integer('end_position').notNullable();
    table.jsonb('metadata');
    
    // Embedding information
    table.string('embedding_model', 100);
    table.integer('embedding_dimensions');
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('embedded_at', { useTz: true });
    
    // Indexes
    table.index('content_id', 'idx_content_chunks_content');
    table.index(['content_id', 'chunk_index'], 'idx_content_chunks_order');
    table.unique(['content_id', 'chunk_index'], 'uq_content_chunks_index');
  });
  
  // Create content_embeddings table (separate for performance)
  await knex.schema.createTable('content_embeddings', (table) => {
    table.uuid('chunk_id').primary().references('id').inTable('content_chunks').onDelete('CASCADE');
    table.uuid('content_id').notNullable().references('id').inTable('content_items').onDelete('CASCADE');
    table.specificType('embedding', 'vector(1536)'); // Adjust dimensions based on model
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Indexes
    table.index('content_id', 'idx_content_embeddings_content');
  });
  
  // Create vector similarity search index (using pgvector)
  await knex.raw(`
    CREATE INDEX idx_content_embeddings_vector 
    ON content_embeddings 
    USING hnsw (embedding vector_cosine_ops)
  `);
  
  // Create ingestion_jobs table
  await knex.schema.createTable('ingestion_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('content_id').references('id').inTable('content_items');
    table.string('job_type', 50).notNullable();
    table.string('status', 50).notNullable();
    table.integer('priority').defaultTo(5);
    table.integer('attempts').defaultTo(0);
    table.integer('max_attempts').defaultTo(3);
    
    // Job data
    table.jsonb('input_data');
    table.jsonb('output_data');
    table.text('error_message');
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('started_at', { useTz: true });
    table.timestamp('completed_at', { useTz: true });
    table.timestamp('next_retry_at', { useTz: true });
    
    // Indexes
    table.index(['status', 'next_retry_at'], 'idx_ingestion_jobs_status');
    table.index('content_id', 'idx_ingestion_jobs_content');
    table.index('job_type', 'idx_ingestion_jobs_type');
    table.index('created_at', 'idx_ingestion_jobs_created');
  });
  
  // Create content_access_logs table for audit
  await knex.schema.createTable('content_access_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('content_id').notNullable().references('id').inTable('content_items');
    table.uuid('user_id');
    table.string('action', 50).notNullable(); // view, download, search, etc.
    table.string('ip_address', 45);
    table.string('user_agent', 500);
    table.jsonb('metadata');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Indexes
    table.index('content_id', 'idx_content_access_logs_content');
    table.index('user_id', 'idx_content_access_logs_user');
    table.index('created_at', 'idx_content_access_logs_created');
  });
  
  // Create content_processing_stats table for analytics
  await knex.schema.createTable('content_processing_stats', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.date('date').notNullable();
    table.string('source_type', 50).notNullable();
    table.integer('total_processed').defaultTo(0);
    table.integer('total_failed').defaultTo(0);
    table.integer('total_chunks_created').defaultTo(0);
    table.integer('total_embeddings_generated').defaultTo(0);
    table.bigint('total_tokens_processed').defaultTo(0);
    table.integer('average_processing_time').defaultTo(0);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Indexes
    table.unique(['date', 'source_type'], 'uq_content_stats_date_source');
    table.index('date', 'idx_content_stats_date');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('content_processing_stats');
  await knex.schema.dropTableIfExists('content_access_logs');
  await knex.schema.dropTableIfExists('ingestion_jobs');
  await knex.schema.dropTableIfExists('content_embeddings');
  await knex.schema.dropTableIfExists('content_chunks');
  await knex.schema.dropTableIfExists('content_items');
}
