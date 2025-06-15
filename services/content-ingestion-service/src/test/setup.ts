import { config } from '@/config/environment';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Mock external services for testing
jest.mock('@/services/llm-gateway.service', () => ({
  llmGatewayService: {
    generateEmbeddings: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    generateEmbeddingsBatch: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    healthCheck: jest.fn().mockResolvedValue(true),
    getStats: jest.fn().mockReturnValue({}),
  },
}));

jest.mock('@/services/file.service', () => ({
  fileService: {
    getFile: jest.fn().mockResolvedValue({
      id: 'test-file-id',
      originalName: 'test.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      url: 'http://test.com/file',
      buffer: Buffer.from('test content'),
    }),
    getFileMetadata: jest.fn().mockResolvedValue({
      id: 'test-file-id',
      originalName: 'test.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      url: 'http://test.com/file',
    }),
    downloadFile: jest.fn().mockResolvedValue(Buffer.from('test content')),
    healthCheck: jest.fn().mockResolvedValue(true),
    isSupportedFileType: jest.fn().mockReturnValue(true),
    getStats: jest.fn().mockReturnValue({}),
  },
}));

jest.mock('@/adapters/youtube.adapter', () => ({
  youTubeAdapter: {
    ingestVideo: jest.fn().mockResolvedValue({
      id: 'test-content-id',
      sourceId: 'test-video-id',
      sourceType: 'youtube',
      title: 'Test Video',
      content: 'Test transcript content',
      processingStatus: 'processing',
    }),
    healthCheck: jest.fn().mockResolvedValue(true),
    getStats: jest.fn().mockReturnValue({}),
  },
}));

jest.mock('@/adapters/github.adapter', () => ({
  gitHubAdapter: {
    ingestRepository: jest.fn().mockResolvedValue([{
      id: 'test-content-id',
      sourceId: 'test-repo:README.md',
      sourceType: 'github',
      title: 'Test Repository README',
      content: 'Test repository content',
      processingStatus: 'processing',
    }]),
    healthCheck: jest.fn().mockResolvedValue(true),
    getStats: jest.fn().mockReturnValue({}),
  },
}));

// Mock database
jest.mock('@/utils/database', () => ({
  db: {
    insert: jest.fn().mockResolvedValue([]),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
    count: jest.fn().mockResolvedValue([{ count: '0' }]),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    clone: jest.fn().mockReturnThis(),
    clearSelect: jest.fn().mockReturnThis(),
    clearOrder: jest.fn().mockReturnThis(),
  },
  vectorDb: {
    select: jest.fn().mockReturnThis(),
    join: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
  },
  withTransaction: jest.fn().mockImplementation((callback) => callback({
    insert: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
  })),
  checkDatabaseHealth: jest.fn().mockResolvedValue(true),
  checkVectorDatabaseHealth: jest.fn().mockResolvedValue(true),
  connectDatabase: jest.fn().mockResolvedValue(undefined),
  disconnectDatabase: jest.fn().mockResolvedValue(undefined),
  validateDatabaseSchema: jest.fn().mockResolvedValue(true),
}));

// Global test timeout
jest.setTimeout(30000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export {};
