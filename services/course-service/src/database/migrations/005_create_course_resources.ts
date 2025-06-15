import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create ENUM type for resource types
  await knex.raw(`
    CREATE TYPE resource_type AS ENUM ('document', 'video', 'audio', 'image', 'archive', 'link', 'other');
  `);

  await knex.schema.createTable('course_resources', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('course_id').notNullable().references('id').inTable('courses').onDelete('CASCADE');
    table.uuid('lesson_id').references('id').inTable('course_lessons').onDelete('CASCADE');
    table.string('title', 255).notNullable();
    table.text('description');
    table.specificType('resource_type', 'resource_type').notNullable();
    table.text('file_url').notNullable();
    table.bigInteger('file_size');
    table.string('mime_type', 100);
    table.integer('download_count').defaultTo(0);
    table.boolean('is_downloadable').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Indexes
    table.index(['course_id']);
    table.index(['lesson_id']);
    table.index(['resource_type']);
    table.index(['is_downloadable']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('course_resources');
  await knex.raw(`DROP TYPE IF EXISTS resource_type;`);
}
