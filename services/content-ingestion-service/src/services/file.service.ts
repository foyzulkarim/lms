import axios, { AxiosInstance } from 'axios';
import { config } from '@/config/environment';
import { contentLogger } from '@/utils/logger';
import { FileServiceFile, ContentIngestionError } from '@/types';

export class FileService {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.FILE_SERVICE_URL;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'content-ingestion-service/1.0.0',
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        contentLogger.externalServiceCall('file-service', `${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        contentLogger.externalServiceError('file-service', 'request', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        const duration = response.config.metadata?.startTime 
          ? Date.now() - response.config.metadata.startTime 
          : 0;
        contentLogger.externalServiceCall(
          'file-service', 
          `${response.config.method?.toUpperCase()} ${response.config.url}`,
          duration
        );
        return response;
      },
      (error) => {
        contentLogger.externalServiceError('file-service', 'response', error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get file metadata by ID
   */
  async getFileMetadata(fileId: string, authToken?: string): Promise<FileServiceFile> {
    try {
      const headers: any = {};
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const response = await this.client.get(`/api/v1/files/${fileId}`, { headers });
      
      return {
        id: response.data.id,
        originalName: response.data.originalName,
        mimeType: response.data.mimeType,
        size: response.data.size,
        url: response.data.url || `${this.baseUrl}/api/v1/files/${fileId}/download`,
      };
    } catch (error: any) {
      const statusCode = error.response?.status || 500;
      const errorMessage = error.response?.data?.message || error.message;
      
      contentLogger.error('Failed to get file metadata', error, {
        fileId,
        statusCode,
        errorMessage,
      });

      throw new ContentIngestionError(
        `Failed to get file metadata: ${errorMessage}`,
        'FILE_SERVICE_ERROR',
        statusCode,
        { fileId }
      );
    }
  }

  /**
   * Download file content as buffer
   */
  async downloadFile(fileId: string, authToken?: string): Promise<Buffer> {
    try {
      const headers: any = {};
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const response = await this.client.get(`/api/v1/files/${fileId}/download`, {
        headers,
        responseType: 'arraybuffer',
        timeout: 300000, // 5 minutes for large files
      });

      return Buffer.from(response.data);
    } catch (error: any) {
      const statusCode = error.response?.status || 500;
      const errorMessage = error.response?.data?.message || error.message;
      
      contentLogger.error('Failed to download file', error, {
        fileId,
        statusCode,
        errorMessage,
      });

      throw new ContentIngestionError(
        `Failed to download file: ${errorMessage}`,
        'FILE_DOWNLOAD_ERROR',
        statusCode,
        { fileId }
      );
    }
  }

  /**
   * Get file with content buffer
   */
  async getFile(fileId: string, authToken?: string): Promise<FileServiceFile> {
    const [metadata, buffer] = await Promise.all([
      this.getFileMetadata(fileId, authToken),
      this.downloadFile(fileId, authToken),
    ]);

    return {
      ...metadata,
      buffer,
    };
  }

  /**
   * Stream file content (for large files)
   */
  async streamFile(fileId: string, authToken?: string): Promise<NodeJS.ReadableStream> {
    try {
      const headers: any = {};
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const response = await this.client.get(`/api/v1/files/${fileId}/stream`, {
        headers,
        responseType: 'stream',
        timeout: 0, // No timeout for streaming
      });

      return response.data;
    } catch (error: any) {
      const statusCode = error.response?.status || 500;
      const errorMessage = error.response?.data?.message || error.message;
      
      contentLogger.error('Failed to stream file', error, {
        fileId,
        statusCode,
        errorMessage,
      });

      throw new ContentIngestionError(
        `Failed to stream file: ${errorMessage}`,
        'FILE_STREAM_ERROR',
        statusCode,
        { fileId }
      );
    }
  }

  /**
   * Check if file exists and is accessible
   */
  async fileExists(fileId: string, authToken?: string): Promise<boolean> {
    try {
      await this.getFileMetadata(fileId, authToken);
      return true;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file processing status (for video/audio files)
   */
  async getProcessingStatus(fileId: string, authToken?: string): Promise<any> {
    try {
      const headers: any = {};
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const response = await this.client.get(`/api/v1/files/${fileId}/processing`, { headers });
      return response.data;
    } catch (error: any) {
      // Processing status might not be available for all files
      if (error.response?.status === 404) {
        return { status: 'not_applicable' };
      }
      
      contentLogger.warn('Failed to get file processing status', {
        fileId,
        error: error.message,
      });
      
      return { status: 'unknown' };
    }
  }

  /**
   * Get file variants (thumbnails, transcoded versions, etc.)
   */
  async getFileVariants(fileId: string, authToken?: string): Promise<any[]> {
    try {
      const headers: any = {};
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const response = await this.client.get(`/api/v1/files/${fileId}/variants`, { headers });
      return response.data.variants || [];
    } catch (error: any) {
      // Variants might not be available for all files
      if (error.response?.status === 404) {
        return [];
      }
      
      contentLogger.warn('Failed to get file variants', {
        fileId,
        error: error.message,
      });
      
      return [];
    }
  }

  /**
   * Check if file type is supported for content extraction
   */
  isSupportedFileType(mimeType: string): boolean {
    const supportedTypes = [
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/html',
      'text/markdown',
      'application/rtf',
      
      // Images (for OCR)
      'image/jpeg',
      'image/png',
      'image/tiff',
      'image/bmp',
      'image/webp',
      
      // Audio (for speech-to-text)
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/mp4',
      'audio/webm',
      
      // Video (for speech-to-text)
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/webm',
      'video/avi',
      
      // Archives (for extraction)
      'application/zip',
      'application/x-tar',
      'application/gzip',
    ];

    return supportedTypes.some(type => {
      if (type.endsWith('/*')) {
        return mimeType.startsWith(type.slice(0, -1));
      }
      return mimeType === type;
    });
  }

  /**
   * Determine extraction method based on file type
   */
  getRecommendedExtractionMethod(mimeType: string): string {
    if (mimeType === 'application/pdf') {
      return 'pdf_js';
    }
    
    if (mimeType.startsWith('image/')) {
      return 'ocr';
    }
    
    if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) {
      return 'speech_to_text';
    }
    
    if (mimeType === 'text/html') {
      return 'html_parser';
    }
    
    if (mimeType === 'text/markdown') {
      return 'markdown_parser';
    }
    
    return 'plain_text';
  }

  /**
   * Health check for file service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', {
        timeout: 5000,
      });
      
      return response.status === 200;
    } catch (error) {
      contentLogger.error('File service health check failed', error as Error);
      return false;
    }
  }

  /**
   * Get service statistics
   */
  getStats(): any {
    return {
      baseUrl: this.baseUrl,
      timeout: this.client.defaults.timeout,
    };
  }
}

// Export singleton instance
export const fileService = new FileService();
