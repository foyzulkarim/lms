import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create user_role enum
  await knex.raw(`
    CREATE TYPE user_role AS ENUM ('admin', 'instructor', 'student');
  `);
  
  // Create user_status enum
  await knex.raw(`
    CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'deleted');
  `);
  
  // Create users table
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('auth_id').notNullable().unique().index();
    table.string('email', 255).notNullable().unique().index();
    table.string('username', 50).unique().index();
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.string('display_name', 200);
    table.text('avatar_url');
    table.text('bio');
    table.string('phone', 20);
    table.string('timezone', 50).defaultTo('UTC');
    table.string('language', 10).defaultTo('en');
    table.specificType('role', 'user_role').notNullable().defaultTo('student').index();
    table.specificType('status', 'user_status').notNullable().defaultTo('active').index();
    table.boolean('email_verified').defaultTo(false);
    table.boolean('profile_completed').defaultTo(false);
    table.timestamp('last_active_at').nullable();
    table.timestamps(true, true);
    
    // Indexes
    table.index(['role', 'status']);
    table.index(['created_at']);
    table.index(['updated_at']);
    table.index(['last_active_at']);
  });
  
  // Add comment to table
  await knex.raw(`
    COMMENT ON TABLE users IS 'User profiles and account information';
  `);
  
  // Add comments to columns
  await knex.raw(`
    COMMENT ON COLUMN users.auth_id IS 'Reference to auth service user ID';
    COMMENT ON COLUMN users.email IS 'User email address (unique)';
    COMMENT ON COLUMN users.username IS 'User chosen username (unique, optional)';
    COMMENT ON COLUMN users.display_name IS 'Display name for UI (defaults to first_name + last_name)';
    COMMENT ON COLUMN users.timezone IS 'User timezone preference';
    COMMENT ON COLUMN users.language IS 'User language preference';
    COMMENT ON COLUMN users.role IS 'User role in the system';
    COMMENT ON COLUMN users.status IS 'User account status';
    COMMENT ON COLUMN users.email_verified IS 'Whether user email has been verified';
    COMMENT ON COLUMN users.profile_completed IS 'Whether user has completed their profile';
    COMMENT ON COLUMN users.last_active_at IS 'Last time user was active in the system';
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop users table
  await knex.schema.dropTableIfExists('users');
  
  // Drop enums
  await knex.raw('DROP TYPE IF EXISTS user_role');
  await knex.raw('DROP TYPE IF EXISTS user_status');
}
