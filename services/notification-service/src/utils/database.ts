import knex, { Knex } from 'knex';
import { databaseConfig } from '@/config/env';
import { logger } from '@/utils/logger';

// Create database client
export const databaseClient: Knex = knex(databaseConfig);

// Database utility functions
export class DatabaseUtils {
  static async healthCheck(): Promise<boolean> {
    try {
      await databaseClient.raw('SELECT 1');
      return true;
    } catch (error) {
      logger.error('Database health check failed', error);
      return false;
    }
  }

  static async runMigrations(): Promise<void> {
    try {
      logger.info('Running database migrations...');
      await databaseClient.migrate.latest();
      logger.info('Database migrations completed');
    } catch (error) {
      logger.error('Database migration failed', error);
      throw error;
    }
  }

  static async rollbackMigrations(): Promise<void> {
    try {
      logger.info('Rolling back database migrations...');
      await databaseClient.migrate.rollback();
      logger.info('Database rollback completed');
    } catch (error) {
      logger.error('Database rollback failed', error);
      throw error;
    }
  }

  static async seedDatabase(): Promise<void> {
    try {
      logger.info('Seeding database...');
      await databaseClient.seed.run();
      logger.info('Database seeding completed');
    } catch (error) {
      logger.error('Database seeding failed', error);
      throw error;
    }
  }

  static async closeConnection(): Promise<void> {
    try {
      await databaseClient.destroy();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Failed to close database connection', error);
      throw error;
    }
  }

  static async withTransaction<T>(
    callback: (trx: Knex.Transaction) => Promise<T>
  ): Promise<T> {
    const trx = await databaseClient.transaction();
    try {
      const result = await callback(trx);
      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  static buildPaginationQuery<T>(
    query: Knex.QueryBuilder,
    params: {
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ) {
    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = params;
    const offset = (page - 1) * limit;

    return query
      .orderBy(sortBy, sortOrder)
      .limit(limit)
      .offset(offset);
  }

  static async getPaginatedResults<T>(
    query: Knex.QueryBuilder,
    countQuery: Knex.QueryBuilder,
    params: {
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ) {
    const { page = 1, limit = 20 } = params;
    
    const [data, countResult] = await Promise.all([
      this.buildPaginationQuery(query.clone(), params),
      countQuery.count('* as total').first()
    ]);

    const total = parseInt(countResult?.total as string) || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }
}

export default databaseClient;
