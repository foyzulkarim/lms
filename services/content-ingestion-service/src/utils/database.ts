import knex, { Knex } from 'knex';
import { config } from '@/config/environment';
import { contentLogger } from '@/utils/logger';

// Database configuration
const databaseConfig: Knex.Config = {
  client: 'postgresql',
  connection: config.DATABASE_URL,
  pool: {
    min: config.DB_POOL_MIN,
    max: config.DB_POOL_MAX,
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
  debug: config.NODE_ENV === 'development',
};

// Vector database configuration (if separate)
const vectorDatabaseConfig: Knex.Config = {
  client: 'postgresql',
  connection: config.VECTOR_DB_URL || config.DATABASE_URL,
  pool: {
    min: config.DB_POOL_MIN,
    max: config.DB_POOL_MAX,
  },
};

// Create database instances
export const db = knex(databaseConfig);
export const vectorDb = knex(vectorDatabaseConfig);

// Database health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await db.raw('SELECT 1');
    return true;
  } catch (error) {
    contentLogger.error('Database health check failed', error as Error);
    return false;
  }
}

// Vector database health check
export async function checkVectorDatabaseHealth(): Promise<boolean> {
  try {
    await vectorDb.raw('SELECT 1');
    return true;
  } catch (error) {
    contentLogger.error('Vector database health check failed', error as Error);
    return false;
  }
}

// Database connection with retry logic
export async function connectDatabase(): Promise<void> {
  const maxRetries = 5;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      await db.raw('SELECT 1');
      contentLogger.info('Database connected successfully');
      
      // Enable pgvector extension if not exists
      await db.raw('CREATE EXTENSION IF NOT EXISTS vector');
      contentLogger.info('pgvector extension enabled');
      
      return;
    } catch (error) {
      retries++;
      contentLogger.error(`Database connection attempt ${retries} failed`, error as Error);
      
      if (retries >= maxRetries) {
        throw new Error(`Failed to connect to database after ${maxRetries} attempts`);
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000 * retries));
    }
  }
}

// Graceful database shutdown
export async function disconnectDatabase(): Promise<void> {
  try {
    await db.destroy();
    await vectorDb.destroy();
    contentLogger.info('Database connections closed');
  } catch (error) {
    contentLogger.error('Error closing database connections', error as Error);
  }
}

// Query logging middleware
db.on('query', (queryData) => {
  if (config.NODE_ENV === 'development') {
    contentLogger.databaseQuery(queryData.sql, 0);
  }
});

db.on('query-error', (error, queryData) => {
  contentLogger.databaseError(queryData.sql, error);
});

// Transaction helper
export async function withTransaction<T>(
  callback: (trx: Knex.Transaction) => Promise<T>
): Promise<T> {
  const trx = await db.transaction();
  
  try {
    const result = await callback(trx);
    await trx.commit();
    return result;
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}

// Pagination helper
export interface PaginationOptions {
  page?: number;
  limit?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export async function paginate<T>(
  query: Knex.QueryBuilder,
  options: PaginationOptions = {}
): Promise<PaginationResult<T>> {
  const {
    page = 1,
    limit = 20,
    orderBy = 'created_at',
    orderDirection = 'desc'
  } = options;
  
  const offset = (page - 1) * limit;
  
  // Get total count
  const countQuery = query.clone().clearSelect().clearOrder().count('* as count').first();
  const { count } = await countQuery as any;
  const total = parseInt(count, 10);
  
  // Get paginated data
  const data = await query
    .orderBy(orderBy, orderDirection)
    .limit(limit)
    .offset(offset);
  
  const totalPages = Math.ceil(total / limit);
  
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

// Vector similarity search helper
export async function vectorSimilaritySearch(
  embedding: number[],
  limit: number = 10,
  threshold: number = 0.7,
  filters?: Record<string, any>
): Promise<any[]> {
  let query = vectorDb('content_embeddings as ce')
    .select([
      'ce.chunk_id',
      'ce.content_id',
      'cc.text',
      'cc.metadata',
      'ci.title',
      'ci.course_id',
      vectorDb.raw('1 - (ce.embedding <=> ?) as similarity', [JSON.stringify(embedding)])
    ])
    .join('content_chunks as cc', 'ce.chunk_id', 'cc.id')
    .join('content_items as ci', 'ce.content_id', 'ci.id')
    .where(vectorDb.raw('1 - (ce.embedding <=> ?) > ?', [JSON.stringify(embedding), threshold]))
    .orderBy(vectorDb.raw('ce.embedding <=> ?', [JSON.stringify(embedding)]))
    .limit(limit);
  
  // Apply filters
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (key.startsWith('ci.')) {
        query = query.where(key, value);
      } else if (key.startsWith('cc.')) {
        query = query.where(key, value);
      }
    });
  }
  
  return await query;
}

// Bulk insert helper
export async function bulkInsert<T>(
  tableName: string,
  data: T[],
  chunkSize: number = 1000
): Promise<void> {
  if (data.length === 0) return;
  
  const chunks = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize));
  }
  
  for (const chunk of chunks) {
    await db(tableName).insert(chunk);
  }
}

// Database schema validation
export async function validateDatabaseSchema(): Promise<boolean> {
  try {
    const requiredTables = [
      'content_items',
      'content_chunks',
      'content_embeddings',
      'ingestion_jobs'
    ];
    
    for (const table of requiredTables) {
      const exists = await db.schema.hasTable(table);
      if (!exists) {
        contentLogger.error(`Required table '${table}' does not exist`);
        return false;
      }
    }
    
    // Check for pgvector extension
    const vectorExtension = await db.raw(
      "SELECT * FROM pg_extension WHERE extname = 'vector'"
    );
    
    if (vectorExtension.rows.length === 0) {
      contentLogger.error('pgvector extension is not installed');
      return false;
    }
    
    contentLogger.info('Database schema validation passed');
    return true;
  } catch (error) {
    contentLogger.error('Database schema validation failed', error as Error);
    return false;
  }
}

// Export types
export type Database = typeof db;
export type VectorDatabase = typeof vectorDb;
