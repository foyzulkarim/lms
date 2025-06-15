import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('course_modules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('course_id').notNullable().references('id').inTable('courses').onDelete('CASCADE');
    table.string('title', 255).notNullable();
    table.text('description');
    table.integer('sort_order').notNullable();
    table.integer('duration_minutes').defaultTo(0);
    table.boolean('is_published').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Unique constraint for course_id + sort_order
    table.unique(['course_id', 'sort_order']);

    // Indexes
    table.index(['course_id']);
    table.index(['is_published']);
    table.index(['sort_order']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('course_modules');
}
