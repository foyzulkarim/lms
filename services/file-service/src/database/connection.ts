import knex, { Knex } from 'knex';
import { getDatabaseConfig } from '@/config/env';
import { logger } from '@/utils/logger';

let db: Knex;

export async function initializeDatabase(): Promise<Knex> {
  if (db) {
    return db;
  }

  const config = getDatabaseConfig();

  const knexConfig: Knex.Config = {
    client: 'postgresql',
    connection: config.url,
    pool: {
      min: config.poolMin,
      max: config.poolMax,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './seeds',
    },
    debug: process.env.NODE_ENV === 'development',
  };

  try {
    db = knex(knexConfig);
    
    // Test the connection
    await db.raw('SELECT 1');
    logger.info('Database connection established successfully');
    
    return db;
  } catch (error) {
    logger.error('Failed to connect to database', { error: (error as Error).message });
    throw error;
  }
}

export function getDatabase(): Knex {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.destroy();
    logger.info('Database connection closed');
  }
}

// Health check function
export async function checkDatabaseHealth(): Promise<{ status: 'healthy' | 'unhealthy'; responseTime?: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    await db.raw('SELECT 1');
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'healthy',
      responseTime,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: (error as Error).message,
    };
  }
}
