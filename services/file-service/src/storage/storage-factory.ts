import { StorageProvider, StorageBackend } from '@/types';
import { getStorageConfig } from '@/config/env';
import { MinIOProvider } from './providers/minio-provider';
import { LocalProvider } from './providers/local-provider';
import { logger } from '@/utils/logger';

export class StorageFactory {
  private static instance: StorageProvider;

  static getInstance(): StorageProvider {
    if (!this.instance) {
      this.instance = this.createProvider();
    }
    return this.instance;
  }

  private static createProvider(): StorageProvider {
    const config = getStorageConfig();
    
    logger.info(`Initializing storage provider: ${config.backend}`);
    
    switch (config.backend) {
      case StorageBackend.MINIO:
        return new MinIOProvider();
      
      case StorageBackend.LOCAL:
        return new LocalProvider();
      
      case StorageBackend.S3:
        // For now, use MinIO provider for S3 compatibility
        // In the future, you could create a dedicated S3Provider
        return new MinIOProvider();
      
      default:
        throw new Error(`Unsupported storage backend: ${config.backend}`);
    }
  }

  // Method to switch providers (useful for testing)
  static setProvider(provider: StorageProvider): void {
    this.instance = provider;
  }

  // Health check for the current provider
  static async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; error?: string }> {
    try {
      const provider = this.getInstance();
      
      // Check if provider has health check method
      if ('healthCheck' in provider && typeof provider.healthCheck === 'function') {
        return await (provider as any).healthCheck();
      }
      
      // Fallback: try to list objects
      await provider.listObjects();
      return { status: 'healthy' };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: (error as Error).message 
      };
    }
  }
}

// Convenience function to get the storage provider
export function getStorageProvider(): StorageProvider {
  return StorageFactory.getInstance();
}
