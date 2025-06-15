import knex, { Knex } from 'knex';
import { config } from '../config';
import { logger } from '../utils/logger';

let db: Knex;

export const initializeDatabase = async (): Promise<void> => {
  try {
    db = knex({
      client: 'postgresql',
      connection: {
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        database: config.database.name,
      },
      pool: {
        min: 2,
        max: 10,
        acquireTimeoutMillis: 30000,
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 100,
      },
      migrations: {
        directory: './migrations',
        extension: 'ts',
      },
      seeds: {
        directory: './seeds',
        extension: 'ts',
      },
    });

    // Test the connection
    await db.raw('SELECT 1');
    logger.info('Database connected successfully');

    // Run migrations in development
    if (config.nodeEnv === 'development') {
      await db.migrate.latest();
      logger.info('Database migrations completed');
    }
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    throw error;
  }
};

export const getDatabase = (): Knex => {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
};

export const closeDatabase = async (): Promise<void> => {
  if (db) {
    await db.destroy();
    logger.info('Database connection closed');
  }
};
