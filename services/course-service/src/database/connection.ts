import knex, { Knex } from 'knex';
import { config } from '../config';
import { logger } from '../utils/logger';

// Database connection instance
let db: Knex | null = null;

// Knex configuration
const knexConfig: Knex.Config = {
  client: 'postgresql',
  connection: config.database.url || {
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
  },
  pool: {
    min: config.database.pool.min,
    max: config.database.pool.max,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
  },
  migrations: {
    directory: './src/database/migrations',
    extension: 'ts',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './src/database/seeds',
    extension: 'ts',
  },
  debug: config.isDevelopment,
  asyncStackTraces: config.isDevelopment,
};

// Initialize database connection
export const initializeDatabase = async (): Promise<Knex> => {
  try {
    if (db) {
      return db;
    }

    logger.info('Initializing database connection...');
    
    db = knex(knexConfig);

    // Test the connection
    await db.raw('SELECT 1');
    
    logger.info('Database connection established successfully');
    
    // Run migrations in production
    if (config.isProduction) {
      logger.info('Running database migrations...');
      await db.migrate.latest();
      logger.info('Database migrations completed');
    }

    return db;
  } catch (error) {
    logger.error('Failed to initialize database connection:', error);
    throw error;
  }
};

// Get database instance
export const getDatabase = (): Knex => {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
};

// Close database connection
export const closeDatabase = async (): Promise<void> => {
  if (db) {
    logger.info('Closing database connection...');
    await db.destroy();
    db = null;
    logger.info('Database connection closed');
  }
};

// Health check
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    if (!db) {
      return false;
    }
    
    await db.raw('SELECT 1');
    return true;
  } catch (error) {
    logger.error('Database health check failed:', error);
    return false;
  }
};

// Export knex config for CLI
export default knexConfig;
