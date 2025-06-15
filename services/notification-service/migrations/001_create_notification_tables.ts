import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create notifications table
  await knex.schema.createTable('notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('type', 50).notNullable();
    table.specificType('channels', 'VARCHAR(20)[]').notNullable();
    table.string('subject', 500);
    table.string('title', 200).notNullable();
    table.text('message').notNullable();
    table.uuid('template_id');
    table.jsonb('template_data');
    
    // Scheduling
    table.timestamp('schedule_at', { useTz: true });
    table.timestamp('expires_at', { useTz: true });
    
    // Priority and options
    table.integer('priority').notNullable().defaultTo(2);
    table.jsonb('options');
    
    // Context
    table.string('source_service', 100).notNullable();
    table.string('source_id', 100);
    table.uuid('course_id');
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['type', 'created_at']);
    table.index(['schedule_at'], 'idx_notifications_schedule');
    table.index(['source_service', 'source_id']);
    table.index(['course_id']);
  });

  // Create notification_deliveries table
  await knex.schema.createTable('notification_deliveries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('notification_id').notNullable().references('id').inTable('notifications').onDelete('CASCADE');
    table.uuid('user_id').notNullable();
    table.string('channel', 20).notNullable();
    
    // Delivery status
    table.string('status', 20).notNullable().defaultTo('pending');
    table.integer('attempts').defaultTo(0);
    table.integer('max_attempts').defaultTo(3);
    
    // Channel-specific data
    table.jsonb('email_data');
    table.jsonb('push_data');
    
    // Tracking
    table.timestamp('delivered_at', { useTz: true });
    table.timestamp('opened_at', { useTz: true });
    table.timestamp('clicked_at', { useTz: true });
    table.text('error_message');
    
    // Retry scheduling
    table.timestamp('next_retry_at', { useTz: true });
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['user_id', 'created_at']);
    table.index(['status', 'next_retry_at']);
    table.index(['notification_id']);
    table.index(['channel', 'status']);
    table.index(['delivered_at']);
  });

  // Create notification_templates table
  await knex.schema.createTable('notification_templates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 200).notNullable().unique();
    table.string('type', 50).notNullable();
    table.specificType('channels', 'VARCHAR(20)[]').notNullable();
    
    // Template content
    table.jsonb('email_template');
    table.jsonb('push_template');
    
    // Metadata
    table.text('description');
    table.specificType('tags', 'TEXT[]');
    table.boolean('is_active').defaultTo(true);
    table.integer('version').defaultTo(1);
    
    // Variables
    table.jsonb('variables');
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('created_by').notNullable();
    
    // Indexes
    table.index(['type', 'is_active']);
    table.index(['name']);
    table.index(['created_by']);
  });

  // Create user_notification_preferences table
  await knex.schema.createTable('user_notification_preferences', (table) => {
    table.uuid('user_id').primary();
    
    // Global settings
    table.boolean('email_enabled').defaultTo(true);
    table.boolean('push_enabled').defaultTo(true);
    table.jsonb('quiet_hours');
    table.string('timezone', 50);
    
    // Type-specific preferences
    table.jsonb('type_preferences');
    
    // Subscriptions
    table.jsonb('push_subscriptions');
    table.jsonb('email_subscriptions');
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['email_enabled']);
    table.index(['push_enabled']);
  });

  // Create notification_analytics table
  await knex.schema.createTable('notification_analytics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('notification_id').references('id').inTable('notifications').onDelete('CASCADE');
    table.uuid('delivery_id').references('id').inTable('notification_deliveries').onDelete('CASCADE');
    table.uuid('user_id').notNullable();
    
    // Event details
    table.string('event_type', 50).notNullable(); // sent, delivered, opened, clicked, failed
    table.string('channel', 20).notNullable();
    table.jsonb('event_data');
    
    // Context
    table.string('user_agent');
    table.string('ip_address');
    table.string('device_type');
    table.jsonb('metadata');
    
    // Timestamp
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['notification_id', 'event_type']);
    table.index(['user_id', 'created_at']);
    table.index(['event_type', 'channel', 'created_at']);
    table.index(['created_at']);
  });

  // Create notification_batches table for bulk operations
  await knex.schema.createTable('notification_batches', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 200);
    table.string('type', 50).notNullable();
    table.string('status', 20).notNullable().defaultTo('pending'); // pending, processing, completed, failed
    
    // Batch details
    table.integer('total_recipients').notNullable();
    table.integer('processed_count').defaultTo(0);
    table.integer('success_count').defaultTo(0);
    table.integer('failed_count').defaultTo(0);
    
    // Configuration
    table.jsonb('batch_config');
    table.jsonb('template_data');
    
    // Context
    table.string('source_service', 100).notNullable();
    table.uuid('created_by').notNullable();
    
    // Timestamps
    table.timestamp('started_at', { useTz: true });
    table.timestamp('completed_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['status', 'created_at']);
    table.index(['type', 'status']);
    table.index(['created_by']);
  });

  // Create notification_unsubscribes table
  await knex.schema.createTable('notification_unsubscribes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.string('email').notNullable();
    table.string('type', 50); // specific type or null for all
    table.string('channel', 20); // specific channel or null for all
    
    // Unsubscribe details
    table.string('reason');
    table.string('source', 50); // email_link, user_preference, admin
    table.jsonb('metadata');
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['user_id', 'type', 'channel']);
    table.index(['email']);
    table.index(['created_at']);
    
    // Unique constraint for user + type + channel combination
    table.unique(['user_id', 'type', 'channel']);
  });

  // Create notification_rate_limits table
  await knex.schema.createTable('notification_rate_limits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id');
    table.string('identifier', 100); // user_id, email, or global
    table.string('channel', 20).notNullable();
    table.string('type', 50); // specific type or 'global'
    
    // Rate limit tracking
    table.integer('count').defaultTo(0);
    table.timestamp('window_start', { useTz: true }).notNullable();
    table.timestamp('window_end', { useTz: true }).notNullable();
    table.integer('limit_value').notNullable();
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['identifier', 'channel', 'type', 'window_end']);
    table.index(['window_end']); // For cleanup
  });

  // Add foreign key constraints
  await knex.schema.alterTable('notifications', (table) => {
    table.foreign('template_id').references('id').inTable('notification_templates');
  });

  // Create triggers for updated_at timestamps
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  const tables = [
    'notifications',
    'notification_deliveries', 
    'notification_templates',
    'user_notification_preferences',
    'notification_batches'
  ];

  for (const tableName of tables) {
    await knex.raw(`
      CREATE TRIGGER update_${tableName}_updated_at 
      BEFORE UPDATE ON ${tableName}
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop triggers first
  const tables = [
    'notifications',
    'notification_deliveries',
    'notification_templates', 
    'user_notification_preferences',
    'notification_batches'
  ];

  for (const tableName of tables) {
    await knex.raw(`DROP TRIGGER IF EXISTS update_${tableName}_updated_at ON ${tableName};`);
  }

  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column();');

  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('notification_rate_limits');
  await knex.schema.dropTableIfExists('notification_unsubscribes');
  await knex.schema.dropTableIfExists('notification_batches');
  await knex.schema.dropTableIfExists('notification_analytics');
  await knex.schema.dropTableIfExists('user_notification_preferences');
  await knex.schema.dropTableIfExists('notification_templates');
  await knex.schema.dropTableIfExists('notification_deliveries');
  await knex.schema.dropTableIfExists('notifications');
}
