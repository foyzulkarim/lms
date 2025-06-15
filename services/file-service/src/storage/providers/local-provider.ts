import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { 
  StorageProvider, 
  StorageResult, 
  StorageMetadata, 
  StorageObject, 
  UploadOptions,
  StorageError 
} from '@/types';
import { getStorageConfig } from '@/config/env';
import { FileServiceLogger } from '@/utils/logger';

export class LocalProvider implements StorageProvider {
  private basePath: string;
  private publicUrl: string;

  constructor() {
    const config = getStorageConfig();
    this.basePath = path.resolve(config.local.path);
    this.publicUrl = config.local.publicUrl;
    this.initializeStorage();
  }

  private async initializeStorage(): Promise<void> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
      
      // Create subdirectories for organization
      const subdirs = ['images', 'videos', 'documents', 'temp', 'processed'];
      for (const subdir of subdirs) {
        await fs.mkdir(path.join(this.basePath, subdir), { recursive: true });
      }
    } catch (error) {
      throw new StorageError('Failed to initialize local storage', error);
    }
  }

  private getFullPath(storagePath: string): string {
    return path.join(this.basePath, storagePath);
  }

  private getPublicUrl(storagePath: string): string {
    return `${this.publicUrl}/${storagePath}`;
  }

  async upload(file: Buffer, storagePath: string, options?: UploadOptions): Promise<StorageResult> {
    const startTime = Date.now();
    const fullPath = this.getFullPath(storagePath);
    
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      
      // Write file
      await fs.writeFile(fullPath, file);
      
      // Set metadata as extended attributes (if supported)
      if (options?.metadata) {
        try {
          const metadataPath = `${fullPath}.metadata`;
          await fs.writeFile(metadataPath, JSON.stringify({
            contentType: options.contentType,
            ...options.metadata,
            uploadedAt: new Date().toISOString(),
          }));
        } catch (error) {
          // Metadata storage is optional, don't fail the upload
          FileServiceLogger.logStorageOperation('metadata_write', storagePath, false, 0, error as Error);
        }
      }

      const duration = Date.now() - startTime;
      FileServiceLogger.logStorageOperation('upload', storagePath, true, duration);

      return {
        path: storagePath,
        url: this.getPublicUrl(storagePath),
        etag: crypto.createHash('md5').update(file).digest('hex'),
        size: file.length,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      FileServiceLogger.logStorageOperation('upload', storagePath, false, duration, error as Error);
      throw new StorageError(`Failed to upload file locally: ${(error as Error).message}`, error);
    }
  }

  async download(storagePath: string): Promise<Buffer> {
    const startTime = Date.now();
    const fullPath = this.getFullPath(storagePath);
    
    try {
      const buffer = await fs.readFile(fullPath);
      const duration = Date.now() - startTime;
      FileServiceLogger.logStorageOperation('download', storagePath, true, duration);
      return buffer;
    } catch (error) {
      const duration = Date.now() - startTime;
      FileServiceLogger.logStorageOperation('download', storagePath, false, duration, error as Error);
      throw new StorageError(`Failed to download file locally: ${(error as Error).message}`, error);
    }
  }

  async delete(storagePath: string): Promise<void> {
    const startTime = Date.now();
    const fullPath = this.getFullPath(storagePath);
    
    try {
      await fs.unlink(fullPath);
      
      // Also delete metadata file if it exists
      try {
        await fs.unlink(`${fullPath}.metadata`);
      } catch {
        // Metadata file might not exist, ignore error
      }
      
      const duration = Date.now() - startTime;
      FileServiceLogger.logStorageOperation('delete', storagePath, true, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      FileServiceLogger.logStorageOperation('delete', storagePath, false, duration, error as Error);
      throw new StorageError(`Failed to delete file locally: ${(error as Error).message}`, error);
    }
  }

  async exists(storagePath: string): Promise<boolean> {
    const fullPath = this.getFullPath(storagePath);
    
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(storagePath: string): Promise<StorageMetadata> {
    const fullPath = this.getFullPath(storagePath);
    
    try {
      const stats = await fs.stat(fullPath);
      let metadata: Record<string, string> = {};
      
      // Try to read metadata file
      try {
        const metadataContent = await fs.readFile(`${fullPath}.metadata`, 'utf-8');
        const parsedMetadata = JSON.parse(metadataContent);
        metadata = parsedMetadata;
      } catch {
        // Metadata file doesn't exist or is invalid, use defaults
      }
      
      return {
        size: stats.size,
        lastModified: stats.mtime,
        contentType: metadata.contentType || 'application/octet-stream',
        etag: crypto.createHash('md5').update(await fs.readFile(fullPath)).digest('hex'),
        metadata,
      };
    } catch (error) {
      throw new StorageError(`Failed to get metadata locally: ${(error as Error).message}`, error);
    }
  }

  async generatePresignedUrl(storagePath: string, expiresIn: number = 3600): Promise<string> {
    // For local storage, we just return the public URL
    // In a real implementation, you might want to generate a signed URL with expiration
    return this.getPublicUrl(storagePath);
  }

  async listObjects(prefix?: string): Promise<StorageObject[]> {
    try {
      const objects: StorageObject[] = [];
      const searchPath = prefix ? path.join(this.basePath, prefix) : this.basePath;
      
      const listDirectory = async (dirPath: string, currentPrefix: string = ''): Promise<void> => {
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const relativePath = currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name;
            
            if (entry.isDirectory()) {
              await listDirectory(fullPath, relativePath);
            } else if (entry.isFile() && !entry.name.endsWith('.metadata')) {
              const stats = await fs.stat(fullPath);
              const buffer = await fs.readFile(fullPath);
              
              objects.push({
                key: relativePath,
                size: stats.size,
                lastModified: stats.mtime,
                etag: crypto.createHash('md5').update(buffer).digest('hex'),
              });
            }
          }
        } catch (error) {
          // Directory might not exist, ignore
        }
      };
      
      await listDirectory(searchPath, prefix);
      return objects;
    } catch (error) {
      throw new StorageError(`Failed to list objects locally: ${(error as Error).message}`, error);
    }
  }

  // Local storage specific methods
  async createDirectory(dirPath: string): Promise<void> {
    const fullPath = this.getFullPath(dirPath);
    
    try {
      await fs.mkdir(fullPath, { recursive: true });
    } catch (error) {
      throw new StorageError(`Failed to create directory: ${(error as Error).message}`, error);
    }
  }

  async deleteDirectory(dirPath: string): Promise<void> {
    const fullPath = this.getFullPath(dirPath);
    
    try {
      await fs.rmdir(fullPath, { recursive: true });
    } catch (error) {
      throw new StorageError(`Failed to delete directory: ${(error as Error).message}`, error);
    }
  }

  async moveFile(sourcePath: string, destinationPath: string): Promise<void> {
    const sourceFullPath = this.getFullPath(sourcePath);
    const destFullPath = this.getFullPath(destinationPath);
    
    try {
      // Ensure destination directory exists
      await fs.mkdir(path.dirname(destFullPath), { recursive: true });
      
      // Move file
      await fs.rename(sourceFullPath, destFullPath);
      
      // Move metadata file if it exists
      try {
        await fs.rename(`${sourceFullPath}.metadata`, `${destFullPath}.metadata`);
      } catch {
        // Metadata file might not exist, ignore error
      }
    } catch (error) {
      throw new StorageError(`Failed to move file: ${(error as Error).message}`, error);
    }
  }

  async copyFile(sourcePath: string, destinationPath: string): Promise<void> {
    const sourceFullPath = this.getFullPath(sourcePath);
    const destFullPath = this.getFullPath(destinationPath);
    
    try {
      // Ensure destination directory exists
      await fs.mkdir(path.dirname(destFullPath), { recursive: true });
      
      // Copy file
      await fs.copyFile(sourceFullPath, destFullPath);
      
      // Copy metadata file if it exists
      try {
        await fs.copyFile(`${sourceFullPath}.metadata`, `${destFullPath}.metadata`);
      } catch {
        // Metadata file might not exist, ignore error
      }
    } catch (error) {
      throw new StorageError(`Failed to copy file: ${(error as Error).message}`, error);
    }
  }

  // Health check
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; error?: string }> {
    try {
      // Check if base directory is accessible
      await fs.access(this.basePath);
      
      // Try to write a test file
      const testPath = path.join(this.basePath, '.health-check');
      await fs.writeFile(testPath, 'health-check');
      await fs.unlink(testPath);
      
      return { status: 'healthy' };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: (error as Error).message 
      };
    }
  }

  // Get storage statistics
  async getStorageStats(): Promise<{ totalObjects: number; totalSize: number }> {
    try {
      const objects = await this.listObjects();
      const totalObjects = objects.length;
      const totalSize = objects.reduce((sum, obj) => sum + obj.size, 0);
      
      return { totalObjects, totalSize };
    } catch (error) {
      throw new StorageError(`Failed to get storage stats: ${(error as Error).message}`, error);
    }
  }

  // Get disk usage
  async getDiskUsage(): Promise<{ used: number; available: number; total: number }> {
    try {
      const stats = await fs.statfs(this.basePath);
      
      return {
        used: (stats.blocks - stats.bavail) * stats.bsize,
        available: stats.bavail * stats.bsize,
        total: stats.blocks * stats.bsize,
      };
    } catch (error) {
      throw new StorageError(`Failed to get disk usage: ${(error as Error).message}`, error);
    }
  }
}
