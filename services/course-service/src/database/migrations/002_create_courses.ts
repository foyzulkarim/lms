import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create ENUM types
  await knex.raw(`
    CREATE TYPE course_level AS ENUM ('beginner', 'intermediate', 'advanced', 'expert');
    CREATE TYPE course_status AS ENUM ('draft', 'review', 'published', 'archived', 'deleted');
    CREATE TYPE course_visibility AS ENUM ('public', 'private', 'unlisted');
  `);

  await knex.schema.createTable('courses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('title', 255).notNullable();
    table.string('slug', 255).notNullable().unique();
    table.text('description');
    table.string('short_description', 500);
    table.text('thumbnail_url');
    table.text('banner_url');
    table.uuid('instructor_id').notNullable(); // Reference to user service
    table.uuid('category_id').references('id').inTable('course_categories').onDelete('SET NULL');
    table.specificType('level', 'course_level').notNullable().defaultTo('beginner');
    table.specificType('status', 'course_status').notNullable().defaultTo('draft');
    table.specificType('visibility', 'course_visibility').notNullable().defaultTo('private');
    table.string('language', 10).defaultTo('en');
    table.integer('duration_hours').defaultTo(0);
    table.decimal('price', 10, 2).defaultTo(0.00);
    table.string('currency', 3).defaultTo('USD');
    table.boolean('is_free').defaultTo(true);
    table.integer('enrollment_limit');
    table.integer('enrollment_count').defaultTo(0);
    table.decimal('rating', 3, 2).defaultTo(0.00);
    table.integer('rating_count').defaultTo(0);
    table.specificType('tags', 'text[]'); // Array of tags
    table.specificType('prerequisites', 'text[]'); // Array of prerequisite course IDs
    table.specificType('learning_objectives', 'text[]'); // Array of learning objectives
    table.text('target_audience');
    table.specificType('requirements', 'text[]');
    table.specificType('what_you_will_learn', 'text[]');
    table.timestamp('published_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.integer('version').defaultTo(1);

    // Indexes
    table.index(['instructor_id']);
    table.index(['category_id']);
    table.index(['status']);
    table.index(['visibility']);
    table.index(['published_at']);
    table.index(['is_free']);
    table.index(['level']);
    table.index(['language']);
    table.index(['rating']);
    table.index(['created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('courses');
  await knex.raw(`
    DROP TYPE IF EXISTS course_level;
    DROP TYPE IF EXISTS course_status;
    DROP TYPE IF EXISTS course_visibility;
  `);
}
