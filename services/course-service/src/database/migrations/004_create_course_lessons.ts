import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create ENUM type for lesson types
  await knex.raw(`
    CREATE TYPE lesson_type AS ENUM ('text', 'video', 'audio', 'quiz', 'assignment', 'live_session');
  `);

  await knex.schema.createTable('course_lessons', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('module_id').notNullable().references('id').inTable('course_modules').onDelete('CASCADE');
    table.uuid('course_id').notNullable().references('id').inTable('courses').onDelete('CASCADE');
    table.string('title', 255).notNullable();
    table.string('slug', 255).notNullable();
    table.text('description');
    table.text('content'); // Markdown content
    table.text('content_html'); // Rendered HTML
    table.specificType('lesson_type', 'lesson_type').notNullable().defaultTo('text');
    table.integer('sort_order').notNullable();
    table.integer('duration_minutes').defaultTo(0);
    table.text('video_url');
    table.integer('video_duration'); // in seconds
    table.jsonb('attachments').defaultTo('[]');
    table.boolean('is_preview').defaultTo(false);
    table.boolean('is_published').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Unique constraints
    table.unique(['module_id', 'sort_order']);
    table.unique(['course_id', 'slug']);

    // Indexes
    table.index(['module_id']);
    table.index(['course_id']);
    table.index(['lesson_type']);
    table.index(['is_published']);
    table.index(['is_preview']);
    table.index(['sort_order']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('course_lessons');
  await knex.raw(`DROP TYPE IF EXISTS lesson_type;`);
}
