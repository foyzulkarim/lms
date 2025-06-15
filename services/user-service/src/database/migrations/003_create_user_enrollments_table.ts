import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create enrollment_status enum
  await knex.raw(`
    CREATE TYPE enrollment_status AS ENUM ('active', 'completed', 'dropped', 'suspended');
  `);
  
  // Create user_enrollments table
  await knex.schema.createTable('user_enrollments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE').index();
    table.uuid('course_id').notNullable().index(); // Reference to course service
    table.specificType('enrollment_status', 'enrollment_status').notNullable().defaultTo('active').index();
    table.decimal('progress', 5, 2).defaultTo(0.00).checkBetween([0, 100]);
    table.timestamp('enrolled_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at').nullable();
    table.timestamp('last_accessed_at').nullable();
    table.timestamps(true, true);
    
    // Unique constraint on user_id and course_id combination
    table.unique(['user_id', 'course_id']);
    
    // Indexes
    table.index(['user_id', 'enrollment_status']);
    table.index(['course_id', 'enrollment_status']);
    table.index(['enrollment_status', 'enrolled_at']);
    table.index(['progress']);
    table.index(['enrolled_at']);
    table.index(['completed_at']);
    table.index(['last_accessed_at']);
    table.index(['created_at']);
    table.index(['updated_at']);
  });
  
  // Add comment to table
  await knex.raw(`
    COMMENT ON TABLE user_enrollments IS 'User course enrollments and progress tracking';
  `);
  
  // Add comments to columns
  await knex.raw(`
    COMMENT ON COLUMN user_enrollments.user_id IS 'Reference to users table';
    COMMENT ON COLUMN user_enrollments.course_id IS 'Reference to course in course service';
    COMMENT ON COLUMN user_enrollments.enrollment_status IS 'Current status of the enrollment';
    COMMENT ON COLUMN user_enrollments.progress IS 'Course completion progress (0-100%)';
    COMMENT ON COLUMN user_enrollments.enrolled_at IS 'When user enrolled in the course';
    COMMENT ON COLUMN user_enrollments.completed_at IS 'When user completed the course';
    COMMENT ON COLUMN user_enrollments.last_accessed_at IS 'Last time user accessed the course';
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop user_enrollments table
  await knex.schema.dropTableIfExists('user_enrollments');
  
  // Drop enum
  await knex.raw('DROP TYPE IF EXISTS enrollment_status');
}
