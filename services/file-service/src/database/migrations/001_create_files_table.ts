import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create files table
  await knex.schema.createTable('files', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('original_name', 255).notNullable();
    table.string('storage_path', 500).notNullable().unique();
    table.string('public_url', 500);
    table.string('mime_type', 100).notNullable();
    table.bigInteger('size').notNullable();
    table.string('checksum', 64).notNullable();
    
    // Ownership
    table.uuid('uploaded_by').notNullable();
    table.uuid('organization_id');
    table.uuid('course_id');
    
    // Processing
    table.string('status', 20).notNullable().defaultTo('pending');
    table.jsonb('processing_metadata');
    
    // Versioning
    table.integer('version').notNullable().defaultTo(1);
    table.uuid('parent_id').references('id').inTable('files');
    table.boolean('is_latest').notNullable().defaultTo(true);
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });
    table.timestamp('expires_at', { useTz: true });
    
    // Indexes
    table.index('uploaded_by');
    table.index('course_id');
    table.index('status');
    table.index('created_at');
    table.index('checksum');
    table.index(['organization_id', 'course_id']);
    table.index(['status', 'created_at']);
  });

  // Create file permissions table
  await knex.schema.createTable('file_permissions', (table) => {
    table.uuid('file_id').references('id').inTable('files').onDelete('CASCADE');
    table.string('permission_type', 20).notNullable(); // 'role' | 'user' | 'public'
    table.string('permission_value', 100); // role name or user id
    table.uuid('granted_by').notNullable();
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    
    table.primary(['file_id', 'permission_type', 'permission_value']);
    table.index('file_id');
    table.index(['permission_type', 'permission_value']);
  });

  // Create file access logs table
  await knex.schema.createTable('file_access_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('file_id').references('id').inTable('files');
    table.uuid('user_id');
    table.string('action', 20).notNullable(); // 'upload' | 'download' | 'delete' | 'view'
    table.inet('ip_address');
    table.text('user_agent');
    table.jsonb('metadata'); // Additional context
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    
    table.index('file_id');
    table.index('user_id');
    table.index('created_at');
    table.index(['action', 'created_at']);
  });

  // Create chunked uploads table
  await knex.schema.createTable('chunked_uploads', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('file_name', 255).notNullable();
    table.bigInteger('file_size').notNullable();
    table.string('mime_type', 100).notNullable();
    table.integer('chunk_size').notNullable();
    table.integer('total_chunks').notNullable();
    table.uuid('uploaded_by').notNullable();
    table.uuid('course_id');
    table.jsonb('uploaded_chunks').defaultTo('[]'); // Array of uploaded chunk numbers
    table.string('status', 20).notNullable().defaultTo('pending'); // 'pending' | 'completed' | 'failed' | 'expired'
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('expires_at', { useTz: true }).notNullable();
    
    table.index('uploaded_by');
    table.index('status');
    table.index('expires_at');
  });

  // Create processing jobs table
  await knex.schema.createTable('processing_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('file_id').references('id').inTable('files').onDelete('CASCADE');
    table.string('job_type', 50).notNullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.integer('priority').defaultTo(0);
    table.integer('attempts').defaultTo(0);
    table.integer('max_attempts').defaultTo(3);
    table.jsonb('job_data');
    table.jsonb('result');
    table.text('error_message');
    table.timestamp('scheduled_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('started_at', { useTz: true });
    table.timestamp('completed_at', { useTz: true });
    table.timestamp('failed_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    
    table.index('file_id');
    table.index(['status', 'scheduled_at']);
    table.index(['job_type', 'status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('processing_jobs');
  await knex.schema.dropTableIfExists('chunked_uploads');
  await knex.schema.dropTableIfExists('file_access_logs');
  await knex.schema.dropTableIfExists('file_permissions');
  await knex.schema.dropTableIfExists('files');
}
