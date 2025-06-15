import { Knex, knex } from 'knex';
import { getDatabaseUrl, env } from '@/config/environment';
import { logger } from './logger';
import { DatabaseError } from '@/types/analytics.types';

class DatabaseManager {
  private static instance: DatabaseManager;
  private db: Knex | null = null;
  private isConnected = false;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public async connect(): Promise<Knex> {
    if (this.db && this.isConnected) {
      return this.db;
    }

    try {
      this.db = knex({
        client: 'postgresql',
        connection: getDatabaseUrl(),
        pool: {
          min: env.DB_POOL_MIN,
          max: env.DB_POOL_MAX,
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
        debug: env.NODE_ENV === 'development',
        asyncStackTraces: env.NODE_ENV === 'development',
      });

      // Test the connection
      await this.db.raw('SELECT 1');
      this.isConnected = true;

      logger.info('✅ Database connected successfully');
      return this.db;
    } catch (error) {
      logger.error('❌ Database connection failed:', error);
      throw new DatabaseError('Failed to connect to database', error);
    }
  }

  public getConnection(): Knex {
    if (!this.db || !this.isConnected) {
      throw new DatabaseError('Database not connected');
    }
    return this.db;
  }

  public async disconnect(): Promise<void> {
    if (this.db) {
      try {
        await this.db.destroy();
        this.isConnected = false;
        this.db = null;
        logger.info('✅ Database disconnected successfully');
      } catch (error) {
        logger.error('❌ Error disconnecting from database:', error);
        throw new DatabaseError('Failed to disconnect from database', error);
      }
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      if (!this.db || !this.isConnected) {
        return false;
      }
      
      await this.db.raw('SELECT 1');
      return true;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }

  public async runMigrations(): Promise<void> {
    try {
      if (!this.db) {
        throw new DatabaseError('Database not connected');
      }

      const [batchNo, log] = await this.db.migrate.latest();
      
      if (log.length === 0) {
        logger.info('Database is already up to date');
      } else {
        logger.info(`Ran ${log.length} migrations:`, log);
      }
    } catch (error) {
      logger.error('Migration failed:', error);
      throw new DatabaseError('Failed to run migrations', error);
    }
  }

  public async rollbackMigrations(steps = 1): Promise<void> {
    try {
      if (!this.db) {
        throw new DatabaseError('Database not connected');
      }

      const [batchNo, log] = await this.db.migrate.rollback(undefined, false);
      logger.info(`Rolled back ${log.length} migrations:`, log);
    } catch (error) {
      logger.error('Migration rollback failed:', error);
      throw new DatabaseError('Failed to rollback migrations', error);
    }
  }

  public async transaction<T>(
    callback: (trx: Knex.Transaction) => Promise<T>
  ): Promise<T> {
    if (!this.db) {
      throw new DatabaseError('Database not connected');
    }

    return this.db.transaction(callback);
  }

  public async batchInsert<T>(
    tableName: string,
    data: T[],
    batchSize = env.BATCH_SIZE
  ): Promise<void> {
    if (!this.db) {
      throw new DatabaseError('Database not connected');
    }

    try {
      await this.db.batchInsert(tableName, data, batchSize);
    } catch (error) {
      logger.error(`Batch insert failed for table ${tableName}:`, error);
      throw new DatabaseError(`Failed to batch insert into ${tableName}`, error);
    }
  }

  public async executeQuery<T = any>(
    query: string,
    bindings?: any[]
  ): Promise<T[]> {
    if (!this.db) {
      throw new DatabaseError('Database not connected');
    }

    try {
      const result = await this.db.raw(query, bindings);
      return result.rows || result;
    } catch (error) {
      logger.error('Query execution failed:', { query, bindings, error });
      throw new DatabaseError('Failed to execute query', error);
    }
  }

  public async getTableStats(tableName: string): Promise<{
    rowCount: number;
    tableSize: string;
    indexSize: string;
  }> {
    if (!this.db) {
      throw new DatabaseError('Database not connected');
    }

    try {
      const [countResult] = await this.db(tableName).count('* as count');
      const rowCount = parseInt(countResult.count as string, 10);

      const [sizeResult] = await this.db.raw(`
        SELECT 
          pg_size_pretty(pg_total_relation_size(?)) as table_size,
          pg_size_pretty(pg_indexes_size(?)) as index_size
      `, [tableName, tableName]);

      return {
        rowCount,
        tableSize: sizeResult.table_size,
        indexSize: sizeResult.index_size,
      };
    } catch (error) {
      logger.error(`Failed to get stats for table ${tableName}:`, error);
      throw new DatabaseError(`Failed to get table stats for ${tableName}`, error);
    }
  }

  public async vacuum(tableName?: string): Promise<void> {
    if (!this.db) {
      throw new DatabaseError('Database not connected');
    }

    try {
      const query = tableName ? `VACUUM ANALYZE ${tableName}` : 'VACUUM ANALYZE';
      await this.db.raw(query);
      logger.info(`Vacuum completed${tableName ? ` for table ${tableName}` : ''}`);
    } catch (error) {
      logger.error('Vacuum failed:', error);
      throw new DatabaseError('Failed to vacuum database', error);
    }
  }
}

// Export singleton instance
export const db = DatabaseManager.getInstance();

// Helper functions for common database operations
export const withTransaction = async <T>(
  callback: (trx: Knex.Transaction) => Promise<T>
): Promise<T> => {
  return db.transaction(callback);
};

export const batchInsert = async <T>(
  tableName: string,
  data: T[],
  batchSize?: number
): Promise<void> => {
  return db.batchInsert(tableName, data, batchSize);
};

export const executeQuery = async <T = any>(
  query: string,
  bindings?: any[]
): Promise<T[]> => {
  return db.executeQuery<T>(query, bindings);
};

// Database health check utility
export const checkDatabaseHealth = async (): Promise<{
  status: 'healthy' | 'unhealthy';
  details: {
    connected: boolean;
    responseTime?: number;
    error?: string;
  };
}> => {
  const startTime = Date.now();
  
  try {
    const isHealthy = await db.healthCheck();
    const responseTime = Date.now() - startTime;
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      details: {
        connected: isHealthy,
        responseTime,
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
};

export default db;
