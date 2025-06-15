import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('course_reviews', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('course_id').notNullable().references('id').inTable('courses').onDelete('CASCADE');
    table.uuid('user_id').notNullable(); // Reference to user service
    table.integer('rating').notNullable().checkBetween([1, 5]);
    table.string('title', 255);
    table.text('comment');
    table.boolean('is_published').defaultTo(true);
    table.integer('helpful_count').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Unique constraint - one review per user per course
    table.unique(['course_id', 'user_id']);

    // Indexes
    table.index(['course_id']);
    table.index(['user_id']);
    table.index(['rating']);
    table.index(['is_published']);
    table.index(['created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('course_reviews');
}
