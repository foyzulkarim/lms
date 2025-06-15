import * as Minio from 'minio';
import { 
  StorageProvider, 
  StorageResult, 
  StorageMetadata, 
  StorageObject, 
  UploadOptions,
  StorageError 
} from '@/types';
import { getStorageConfig } from '@/config/env';
import { logger, FileServiceLogger } from '@/utils/logger';

export class MinIOProvider implements StorageProvider {
  private client: Minio.Client;
  private bucket: string;

  constructor() {
    const config = getStorageConfig();
    
    this.client = new Minio.Client({
      endPoint: config.minio.endpoint.split(':')[0],
      port: config.minio.port,
      useSSL: config.minio.useSSL,
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
    });

    this.bucket = config.bucket;
    this.initializeBucket();
  }

  private async initializeBucket(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket, 'us-east-1');
        logger.info(`Created MinIO bucket: ${this.bucket}`);
      }
    } catch (error) {
      logger.error('Failed to initialize MinIO bucket', { 
        bucket: this.bucket, 
        error: (error as Error).message 
      });
      throw new StorageError('Failed to initialize storage bucket', error);
    }
  }

  async upload(file: Buffer, path: string, options?: UploadOptions): Promise<StorageResult> {
    const startTime = Date.now();
    
    try {
      const metadata: Record<string, string> = {
        'Content-Type': options?.contentType || 'application/octet-stream',
        ...options?.metadata,
      };

      if (options?.cacheControl) {
        metadata['Cache-Control'] = options.cacheControl;
      }

      if (options?.contentDisposition) {
        metadata['Content-Disposition'] = options.contentDisposition;
      }

      const uploadInfo = await this.client.putObject(
        this.bucket,
        path,
        file,
        file.length,
        metadata
      );

      const duration = Date.now() - startTime;
      FileServiceLogger.logStorageOperation('upload', path, true, duration);

      return {
        path,
        url: await this.generatePresignedUrl(path),
        etag: uploadInfo.etag,
        size: file.length,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      FileServiceLogger.logStorageOperation('upload', path, false, duration, error as Error);
      throw new StorageError(`Failed to upload file to MinIO: ${(error as Error).message}`, error);
    }
  }

  async download(path: string): Promise<Buffer> {
    const startTime = Date.now();
    
    try {
      const stream = await this.client.getObject(this.bucket, path);
      const chunks: Buffer[] = [];
      
      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const duration = Date.now() - startTime;
          FileServiceLogger.logStorageOperation('download', path, true, duration);
          resolve(buffer);
        });
        stream.on('error', (error) => {
          const duration = Date.now() - startTime;
          FileServiceLogger.logStorageOperation('download', path, false, duration, error);
          reject(new StorageError(`Failed to download file from MinIO: ${error.message}`, error));
        });
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      FileServiceLogger.logStorageOperation('download', path, false, duration, error as Error);
      throw new StorageError(`Failed to download file from MinIO: ${(error as Error).message}`, error);
    }
  }

  async delete(path: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      await this.client.removeObject(this.bucket, path);
      const duration = Date.now() - startTime;
      FileServiceLogger.logStorageOperation('delete', path, true, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      FileServiceLogger.logStorageOperation('delete', path, false, duration, error as Error);
      throw new StorageError(`Failed to delete file from MinIO: ${(error as Error).message}`, error);
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, path);
      return true;
    } catch (error) {
      // MinIO throws an error if object doesn't exist
      return false;
    }
  }

  async getMetadata(path: string): Promise<StorageMetadata> {
    try {
      const stat = await this.client.statObject(this.bucket, path);
      
      return {
        size: stat.size,
        lastModified: stat.lastModified,
        contentType: stat.metaData['content-type'] || 'application/octet-stream',
        etag: stat.etag,
        metadata: stat.metaData,
      };
    } catch (error) {
      throw new StorageError(`Failed to get metadata from MinIO: ${(error as Error).message}`, error);
    }
  }

  async generatePresignedUrl(path: string, expiresIn: number = 3600): Promise<string> {
    try {
      return await this.client.presignedGetObject(this.bucket, path, expiresIn);
    } catch (error) {
      throw new StorageError(`Failed to generate presigned URL: ${(error as Error).message}`, error);
    }
  }

  async generatePresignedUploadUrl(path: string, expiresIn: number = 3600): Promise<string> {
    try {
      return await this.client.presignedPutObject(this.bucket, path, expiresIn);
    } catch (error) {
      throw new StorageError(`Failed to generate presigned upload URL: ${(error as Error).message}`, error);
    }
  }

  async listObjects(prefix?: string): Promise<StorageObject[]> {
    try {
      const objects: StorageObject[] = [];
      const stream = this.client.listObjects(this.bucket, prefix, true);
      
      return new Promise((resolve, reject) => {
        stream.on('data', (obj) => {
          objects.push({
            key: obj.name!,
            size: obj.size!,
            lastModified: obj.lastModified!,
            etag: obj.etag!,
          });
        });
        
        stream.on('end', () => resolve(objects));
        stream.on('error', (error) => {
          reject(new StorageError(`Failed to list objects: ${error.message}`, error));
        });
      });
    } catch (error) {
      throw new StorageError(`Failed to list objects from MinIO: ${(error as Error).message}`, error);
    }
  }

  // MinIO specific methods
  async createMultipartUpload(path: string, metadata?: Record<string, string>): Promise<string> {
    try {
      // MinIO doesn't expose multipart upload directly, but we can use streams
      // This is a placeholder for future implementation
      throw new Error('Multipart upload not implemented for MinIO provider');
    } catch (error) {
      throw new StorageError(`Failed to create multipart upload: ${(error as Error).message}`, error);
    }
  }

  async setBucketPolicy(policy: any): Promise<void> {
    try {
      await this.client.setBucketPolicy(this.bucket, JSON.stringify(policy));
    } catch (error) {
      throw new StorageError(`Failed to set bucket policy: ${(error as Error).message}`, error);
    }
  }

  async getBucketPolicy(): Promise<any> {
    try {
      const policy = await this.client.getBucketPolicy(this.bucket);
      return JSON.parse(policy);
    } catch (error) {
      throw new StorageError(`Failed to get bucket policy: ${(error as Error).message}`, error);
    }
  }

  // Health check
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; error?: string }> {
    try {
      await this.client.bucketExists(this.bucket);
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
}
