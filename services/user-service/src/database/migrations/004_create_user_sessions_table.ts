import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create user_sessions table
  await knex.schema.createTable('user_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE').index();
    table.string('session_token', 255).notNullable().unique().index();
    table.jsonb('device_info').nullable();
    table.inet('ip_address').nullable();
    table.text('user_agent').nullable();
    table.boolean('is_active').defaultTo(true).index();
    table.timestamp('expires_at').notNullable().index();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('last_accessed_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['user_id', 'is_active']);
    table.index(['expires_at', 'is_active']);
    table.index(['created_at']);
    table.index(['last_accessed_at']);
  });
  
  // Add comment to table
  await knex.raw(`
    COMMENT ON TABLE user_sessions IS 'Active user sessions for tracking and security';
  `);
  
  // Add comments to columns
  await knex.raw(`
    COMMENT ON COLUMN user_sessions.user_id IS 'Reference to users table';
    COMMENT ON COLUMN user_sessions.session_token IS 'Unique session token';
    COMMENT ON COLUMN user_sessions.device_info IS 'Device information (JSON format)';
    COMMENT ON COLUMN user_sessions.ip_address IS 'IP address of the session';
    COMMENT ON COLUMN user_sessions.user_agent IS 'User agent string';
    COMMENT ON COLUMN user_sessions.is_active IS 'Whether session is currently active';
    COMMENT ON COLUMN user_sessions.expires_at IS 'When session expires';
    COMMENT ON COLUMN user_sessions.last_accessed_at IS 'Last time session was accessed';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_sessions');
}
