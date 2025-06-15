import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create ENUM type for progress status
  await knex.raw(`
    CREATE TYPE progress_status AS ENUM ('not_started', 'in_progress', 'completed', 'skipped');
  `);

  await knex.schema.createTable('course_progress', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('course_id').notNullable().references('id').inTable('courses').onDelete('CASCADE');
    table.uuid('user_id').notNullable(); // Reference to user service
    table.uuid('lesson_id').notNullable().references('id').inTable('course_lessons').onDelete('CASCADE');
    table.specificType('status', 'progress_status').notNullable().defaultTo('not_started');
    table.decimal('progress_percentage', 5, 2).defaultTo(0.00);
    table.integer('time_spent').defaultTo(0); // in seconds
    table.integer('last_position').defaultTo(0); // for video/audio lessons
    table.timestamp('completed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Unique constraint - one progress record per user per lesson
    table.unique(['course_id', 'user_id', 'lesson_id']);

    // Indexes
    table.index(['course_id']);
    table.index(['user_id']);
    table.index(['lesson_id']);
    table.index(['status']);
    table.index(['completed_at']);
    table.index(['updated_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('course_progress');
  await knex.raw(`DROP TYPE IF EXISTS progress_status;`);
}
