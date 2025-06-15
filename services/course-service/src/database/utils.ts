import { Knex } from 'knex';

/**
 * Convert snake_case to camelCase
 */
export const toCamelCase = (str: string): string => {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
};

/**
 * Convert camelCase to snake_case
 */
export const toSnakeCase = (str: string): string => {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
};

/**
 * Convert object keys from snake_case to camelCase
 */
export const keysToCamelCase = <T = any>(obj: any): T => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(keysToCamelCase) as T;
  }

  if (typeof obj === 'object' && obj.constructor === Object) {
    const camelObj: any = {};
    for (const [key, value] of Object.entries(obj)) {
      camelObj[toCamelCase(key)] = keysToCamelCase(value);
    }
    return camelObj;
  }

  return obj;
};

/**
 * Convert object keys from camelCase to snake_case
 */
export const keysToSnakeCase = <T = any>(obj: any): T => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(keysToSnakeCase) as T;
  }

  if (typeof obj === 'object' && obj.constructor === Object) {
    const snakeObj: any = {};
    for (const [key, value] of Object.entries(obj)) {
      snakeObj[toSnakeCase(key)] = keysToSnakeCase(value);
    }
    return snakeObj;
  }

  return obj;
};

/**
 * Pagination helper
 */
export interface PaginationOptions {
  page?: number;
  limit?: number;
  maxLimit?: number;
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

export const paginate = async <T>(
  query: Knex.QueryBuilder,
  options: PaginationOptions = {}
): Promise<PaginationResult<T>> => {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(options.limit || 20, options.maxLimit || 100);
  const offset = (page - 1) * limit;

  // Clone query for count
  const countQuery = query.clone().clearSelect().clearOrder().count('* as count').first();
  const totalResult = await countQuery;
  const total = parseInt(totalResult?.count as string) || 0;

  // Apply pagination to main query
  const data = await query.offset(offset).limit(limit);

  const totalPages = Math.ceil(total / limit);

  return {
    data: keysToCamelCase(data),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
};

/**
 * Search helper
 */
export interface SearchOptions {
  query?: string;
  fields?: string[];
  exact?: boolean;
}

export const addSearchConditions = (
  queryBuilder: Knex.QueryBuilder,
  options: SearchOptions
): Knex.QueryBuilder => {
  if (!options.query || !options.fields?.length) {
    return queryBuilder;
  }

  const searchTerm = options.exact ? options.query : `%${options.query}%`;
  const operator = options.exact ? '=' : 'ILIKE';

  return queryBuilder.where((builder) => {
    options.fields!.forEach((field, index) => {
      if (index === 0) {
        builder.where(field, operator, searchTerm);
      } else {
        builder.orWhere(field, operator, searchTerm);
      }
    });
  });
};

/**
 * Sorting helper
 */
export interface SortOptions {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  allowedFields?: string[];
}

export const addSortConditions = (
  queryBuilder: Knex.QueryBuilder,
  options: SortOptions
): Knex.QueryBuilder => {
  if (!options.sortBy) {
    return queryBuilder;
  }

  // Validate sort field if allowed fields are specified
  if (options.allowedFields && !options.allowedFields.includes(options.sortBy)) {
    return queryBuilder;
  }

  const sortField = toSnakeCase(options.sortBy);
  const sortOrder = options.sortOrder || 'asc';

  return queryBuilder.orderBy(sortField, sortOrder);
};

/**
 * Filter helper
 */
export interface FilterOptions {
  [key: string]: any;
}

export const addFilterConditions = (
  queryBuilder: Knex.QueryBuilder,
  filters: FilterOptions,
  allowedFields?: string[]
): Knex.QueryBuilder => {
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    // Validate filter field if allowed fields are specified
    if (allowedFields && !allowedFields.includes(key)) {
      return;
    }

    const dbField = toSnakeCase(key);

    if (Array.isArray(value)) {
      queryBuilder.whereIn(dbField, value);
    } else if (typeof value === 'string' && value.includes('*')) {
      // Wildcard search
      const searchValue = value.replace(/\*/g, '%');
      queryBuilder.where(dbField, 'ILIKE', searchValue);
    } else {
      queryBuilder.where(dbField, value);
    }
  });

  return queryBuilder;
};

/**
 * Transaction helper
 */
export const withTransaction = async <T>(
  db: Knex,
  callback: (trx: Knex.Transaction) => Promise<T>
): Promise<T> => {
  return db.transaction(callback);
};

/**
 * Batch processing helper
 */
export const processBatch = async <T, R>(
  items: T[],
  processor: (batch: T[]) => Promise<R[]>,
  batchSize: number = 100
): Promise<R[]> => {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);
  }
  
  return results;
};

/**
 * Upsert helper (insert or update)
 */
export const upsert = async (
  db: Knex,
  tableName: string,
  data: any,
  conflictColumns: string[]
): Promise<any> => {
  const snakeData = keysToSnakeCase(data);
  const conflictCols = conflictColumns.map(toSnakeCase);
  
  return db(tableName)
    .insert(snakeData)
    .onConflict(conflictCols)
    .merge()
    .returning('*')
    .then(result => keysToCamelCase(result[0]));
};

/**
 * Soft delete helper
 */
export const softDelete = async (
  db: Knex,
  tableName: string,
  id: string,
  deletedAtColumn: string = 'deleted_at'
): Promise<boolean> => {
  const result = await db(tableName)
    .where('id', id)
    .update({
      [deletedAtColumn]: new Date(),
      updated_at: new Date(),
    });
    
  return result > 0;
};

/**
 * Restore soft deleted record
 */
export const restoreSoftDeleted = async (
  db: Knex,
  tableName: string,
  id: string,
  deletedAtColumn: string = 'deleted_at'
): Promise<boolean> => {
  const result = await db(tableName)
    .where('id', id)
    .update({
      [deletedAtColumn]: null,
      updated_at: new Date(),
    });
    
  return result > 0;
};

/**
 * Check if record exists
 */
export const exists = async (
  db: Knex,
  tableName: string,
  conditions: Record<string, any>
): Promise<boolean> => {
  const snakeConditions = keysToSnakeCase(conditions);
  const result = await db(tableName)
    .where(snakeConditions)
    .first();
    
  return !!result;
};

/**
 * Get next sort order for ordered items
 */
export const getNextSortOrder = async (
  db: Knex,
  tableName: string,
  parentConditions: Record<string, any> = {},
  sortColumn: string = 'sort_order'
): Promise<number> => {
  const snakeConditions = keysToSnakeCase(parentConditions);
  const result = await db(tableName)
    .where(snakeConditions)
    .max(`${sortColumn} as max_order`)
    .first();
    
  return (result?.max_order || 0) + 1;
};
