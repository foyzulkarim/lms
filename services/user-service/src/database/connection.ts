import knex, { Knex } from 'knex';
import { databaseConfig } from '@/config';
import { log } from '@/utils/logger';

// Database configuration
const dbConfig: Knex.Config = {
  client: 'postgresql',
  connection: databaseConfig.url || {
    host: databaseConfig.host,
    port: databaseConfig.port,
    database: databaseConfig.name,
    user: databaseConfig.user,
    password: databaseConfig.password,
    ssl: databaseConfig.ssl ? { rejectUnauthorized: false } : false,
  },
  pool: {
    min: databaseConfig.pool.min,
    max: databaseConfig.pool.max,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
  },
  migrations: {
    directory: './src/database/migrations',
    tableName: 'knex_migrations',
    extension: 'ts',
  },
  seeds: {
    directory: './src/database/seeds',
    extension: 'ts',
  },
  debug: process.env.NODE_ENV === 'development',
};

// Create database connection
export const db = knex(dbConfig);

// Database health check
export const checkDatabaseHealth = async (): Promise<{ status: 'connected' | 'disconnected'; responseTime?: number }> => {
  const start = Date.now();
  
  try {
    await db.raw('SELECT 1');
    const responseTime = Date.now() - start;
    
    log.debug('Database health check passed', { responseTime });
    
    return {
      status: 'connected',
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - start;
    
    log.error('Database health check failed', error, { responseTime });
    
    return {
      status: 'disconnected',
      responseTime,
    };
  }
};

// Initialize database connection
export const initializeDatabase = async (): Promise<void> => {
  try {
    log.info('Initializing database connection...');
    
    // Test connection
    await db.raw('SELECT 1');
    
    log.info('Database connection established successfully', {
      host: databaseConfig.host,
      port: databaseConfig.port,
      database: databaseConfig.name,
    });
    
    // Run migrations in production
    if (process.env.NODE_ENV === 'production') {
      log.info('Running database migrations...');
      await db.migrate.latest();
      log.info('Database migrations completed');
    }
    
  } catch (error) {
    log.error('Failed to initialize database connection', error);
    throw error;
  }
};

// Close database connection
export const closeDatabaseConnection = async (): Promise<void> => {
  try {
    log.info('Closing database connection...');
    await db.destroy();
    log.info('Database connection closed successfully');
  } catch (error) {
    log.error('Error closing database connection', error);
    throw error;
  }
};

// Database transaction helper
export const withTransaction = async <T>(
  callback: (trx: Knex.Transaction) => Promise<T>
): Promise<T> => {
  const trx = await db.transaction();
  
  try {
    const result = await callback(trx);
    await trx.commit();
    return result;
  } catch (error) {
    await trx.rollback();
    throw error;
  }
};

// Query builder helpers
export const buildPaginationQuery = (
  query: Knex.QueryBuilder,
  page: number = 1,
  limit: number = 20
): Knex.QueryBuilder => {
  const offset = (page - 1) * limit;
  return query.offset(offset).limit(limit);
};

export const buildSortQuery = (
  query: Knex.QueryBuilder,
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'desc'
): Knex.QueryBuilder => {
  if (sortBy) {
    return query.orderBy(sortBy, sortOrder);
  }
  return query.orderBy('created_at', 'desc');
};

export const buildSearchQuery = (
  query: Knex.QueryBuilder,
  searchTerm: string,
  searchFields: string[]
): Knex.QueryBuilder => {
  if (!searchTerm || searchFields.length === 0) {
    return query;
  }
  
  return query.where((builder) => {
    searchFields.forEach((field, index) => {
      const method = index === 0 ? 'where' : 'orWhere';
      builder[method](field, 'ILIKE', `%${searchTerm}%`);
    });
  });
};

// Database utility functions
export const camelToSnake = (obj: Record<string, any>): Record<string, any> => {
  const result: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    result[snakeKey] = value;
  }
  
  return result;
};

export const snakeToCamel = (obj: Record<string, any>): Record<string, any> => {
  const result: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = value;
  }
  
  return result;
};

// Database row transformation helpers
export const transformRowToCamelCase = <T>(row: any): T => {
  if (!row) return row;
  
  if (Array.isArray(row)) {
    return row.map(transformRowToCamelCase) as T;
  }
  
  if (typeof row === 'object' && row !== null) {
    return snakeToCamel(row) as T;
  }
  
  return row;
};

export const transformObjectToSnakeCase = (obj: Record<string, any>): Record<string, any> => {
  if (!obj) return obj;
  
  return camelToSnake(obj);
};

// Database error handling
export const isDuplicateKeyError = (error: any): boolean => {
  return error.code === '23505' || error.constraint;
};

export const isForeignKeyError = (error: any): boolean => {
  return error.code === '23503';
};

export const isNotNullError = (error: any): boolean => {
  return error.code === '23502';
};

// Connection pool monitoring
export const getConnectionPoolStats = () => {
  const pool = db.client.pool;
  
  return {
    used: pool.numUsed(),
    free: pool.numFree(),
    pending: pool.numPendingAcquires(),
    pendingCreates: pool.numPendingCreates(),
    min: pool.min,
    max: pool.max,
  };
};

// Database metrics
export const getDatabaseMetrics = async () => {
  try {
    const [
      connectionStats,
      tableStats,
    ] = await Promise.all([
      db.raw(`
        SELECT 
          count(*) as total_connections,
          count(*) FILTER (WHERE state = 'active') as active_connections,
          count(*) FILTER (WHERE state = 'idle') as idle_connections
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `),
      db.raw(`
        SELECT 
          schemaname,
          tablename,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes,
          n_live_tup as live_tuples,
          n_dead_tup as dead_tuples
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC
      `),
    ]);
    
    return {
      connections: connectionStats.rows[0],
      tables: tableStats.rows,
      pool: getConnectionPoolStats(),
    };
  } catch (error) {
    log.error('Failed to get database metrics', error);
    return null;
  }
};

// Export default connection
export default db;
