import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create user_preferences table
  await knex.schema.createTable('user_preferences', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE').index();
    table.string('category', 50).notNullable().index();
    table.string('key', 100).notNullable().index();
    table.jsonb('value').notNullable();
    table.timestamps(true, true);
    
    // Unique constraint on user_id, category, key combination
    table.unique(['user_id', 'category', 'key']);
    
    // Indexes
    table.index(['user_id', 'category']);
    table.index(['category', 'key']);
    table.index(['created_at']);
    table.index(['updated_at']);
  });
  
  // Add comment to table
  await knex.raw(`
    COMMENT ON TABLE user_preferences IS 'User preferences and settings organized by category';
  `);
  
  // Add comments to columns
  await knex.raw(`
    COMMENT ON COLUMN user_preferences.user_id IS 'Reference to users table';
    COMMENT ON COLUMN user_preferences.category IS 'Preference category (e.g., notifications, ui, learning)';
    COMMENT ON COLUMN user_preferences.key IS 'Preference key within category';
    COMMENT ON COLUMN user_preferences.value IS 'Preference value (JSON format for flexibility)';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_preferences');
}
