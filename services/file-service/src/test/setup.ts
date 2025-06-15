import { loadConfig } from '@/config/env';

// Load test configuration
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Load configuration before tests run
loadConfig();

// Global test setup
beforeAll(async () => {
  // Setup test database, storage, etc.
});

afterAll(async () => {
  // Cleanup after all tests
});

// Mock external dependencies for testing
jest.mock('@/storage/storage-factory', () => ({
  getStorageProvider: jest.fn(() => ({
    upload: jest.fn(),
    download: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
    getMetadata: jest.fn(),
    generatePresignedUrl: jest.fn(),
    listObjects: jest.fn()
  }))
}));
