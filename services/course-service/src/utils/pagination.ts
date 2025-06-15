// Pagination utilities
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

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Default pagination settings
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// Normalize pagination options
export const normalizePaginationOptions = (options: PaginationOptions = {}): Required<PaginationOptions> => {
  const page = Math.max(1, options.page || DEFAULT_PAGE);
  const limit = Math.min(
    Math.max(1, options.limit || DEFAULT_LIMIT),
    options.maxLimit || MAX_LIMIT
  );
  const maxLimit = options.maxLimit || MAX_LIMIT;

  return { page, limit, maxLimit };
};

// Calculate pagination metadata
export const calculatePaginationMeta = (
  page: number,
  limit: number,
  total: number
): PaginationMeta => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};

// Calculate offset for database queries
export const calculateOffset = (page: number, limit: number): number => {
  return (page - 1) * limit;
};

// Create pagination result
export const createPaginationResult = <T>(
  data: T[],
  page: number,
  limit: number,
  total: number
): PaginationResult<T> => {
  const pagination = calculatePaginationMeta(page, limit, total);
  
  return {
    data,
    pagination,
  };
};

// Validate pagination parameters
export const validatePaginationParams = (
  page?: number,
  limit?: number,
  maxLimit: number = MAX_LIMIT
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (page !== undefined) {
    if (!Number.isInteger(page) || page < 1) {
      errors.push('Page must be a positive integer');
    }
  }

  if (limit !== undefined) {
    if (!Number.isInteger(limit) || limit < 1) {
      errors.push('Limit must be a positive integer');
    } else if (limit > maxLimit) {
      errors.push(`Limit cannot exceed ${maxLimit}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Generate pagination links (for API responses)
export const generatePaginationLinks = (
  baseUrl: string,
  page: number,
  limit: number,
  totalPages: number,
  queryParams: Record<string, any> = {}
): {
  first?: string;
  prev?: string;
  next?: string;
  last?: string;
} => {
  const createUrl = (targetPage: number): string => {
    const params = new URLSearchParams({
      ...queryParams,
      page: targetPage.toString(),
      limit: limit.toString(),
    });
    return `${baseUrl}?${params.toString()}`;
  };

  const links: any = {};

  // First page link
  if (page > 1) {
    links.first = createUrl(1);
  }

  // Previous page link
  if (page > 1) {
    links.prev = createUrl(page - 1);
  }

  // Next page link
  if (page < totalPages) {
    links.next = createUrl(page + 1);
  }

  // Last page link
  if (page < totalPages) {
    links.last = createUrl(totalPages);
  }

  return links;
};

// Cursor-based pagination utilities
export interface CursorPaginationOptions {
  cursor?: string;
  limit?: number;
  direction?: 'forward' | 'backward';
}

export interface CursorPaginationResult<T> {
  data: T[];
  pagination: {
    limit: number;
    hasNext: boolean;
    hasPrev: boolean;
    nextCursor?: string;
    prevCursor?: string;
  };
}

// Encode cursor (base64 encoding of timestamp or ID)
export const encodeCursor = (value: string | number | Date): string => {
  const stringValue = value instanceof Date ? value.toISOString() : String(value);
  return Buffer.from(stringValue).toString('base64');
};

// Decode cursor
export const decodeCursor = (cursor: string): string => {
  try {
    return Buffer.from(cursor, 'base64').toString('utf-8');
  } catch (error) {
    throw new Error('Invalid cursor format');
  }
};

// Create cursor pagination result
export const createCursorPaginationResult = <T>(
  data: T[],
  limit: number,
  getCursorValue: (item: T) => string | number | Date,
  hasMore: boolean = false
): CursorPaginationResult<T> => {
  const hasNext = data.length === limit && hasMore;
  const hasPrev = data.length > 0; // This would need more context in real implementation
  
  let nextCursor: string | undefined;
  let prevCursor: string | undefined;

  if (hasNext && data.length > 0) {
    nextCursor = encodeCursor(getCursorValue(data[data.length - 1]));
  }

  if (hasPrev && data.length > 0) {
    prevCursor = encodeCursor(getCursorValue(data[0]));
  }

  return {
    data,
    pagination: {
      limit,
      hasNext,
      hasPrev,
      nextCursor,
      prevCursor,
    },
  };
};

// Validate cursor pagination parameters
export const validateCursorPaginationParams = (
  cursor?: string,
  limit?: number,
  direction?: string
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (cursor !== undefined) {
    try {
      decodeCursor(cursor);
    } catch (error) {
      errors.push('Invalid cursor format');
    }
  }

  if (limit !== undefined) {
    if (!Number.isInteger(limit) || limit < 1) {
      errors.push('Limit must be a positive integer');
    } else if (limit > MAX_LIMIT) {
      errors.push(`Limit cannot exceed ${MAX_LIMIT}`);
    }
  }

  if (direction !== undefined) {
    if (!['forward', 'backward'].includes(direction)) {
      errors.push('Direction must be either "forward" or "backward"');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export default {
  normalizePaginationOptions,
  calculatePaginationMeta,
  calculateOffset,
  createPaginationResult,
  validatePaginationParams,
  generatePaginationLinks,
  encodeCursor,
  decodeCursor,
  createCursorPaginationResult,
  validateCursorPaginationParams,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
