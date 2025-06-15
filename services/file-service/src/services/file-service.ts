import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { 
  FileMetadata, 
  FileStatus, 
  FilePermissions,
  ProcessingMetadata,
  PaginationResult,
  FileListQuery,
  AuthContext,
  NotFoundError,
  AuthorizationError,
  ValidationError,
  StorageError,
  ProcessingError
} from '@/types';
import { getDatabase } from '@/database/connection';
import { getStorageProvider } from '@/storage/storage-factory';
import { VideoProcessor } from '@/processors/video-processor';
import { ImageProcessor } from '@/processors/image-processor';
import { FileServiceLogger, PerformanceTimer } from '@/utils/logger';
import { getFeatureFlags } from '@/config/env';

export interface UploadFileOptions {
  courseId?: string;
  permissions?: Partial<FilePermissions>;
  isTemporary?: boolean;
  expiresIn?: number; // seconds
  skipProcessing?: boolean;
}

export interface FileServiceOptions {
  enableProcessing?: boolean;
  enableVersioning?: boolean;
  enableAuditLogging?: boolean;
}

export class FileService {
  private db = getDatabase();
  private storageProvider = getStorageProvider();
  private videoProcessor = new VideoProcessor();
  private imageProcessor = new ImageProcessor();
  private featureFlags = getFeatureFlags();

  constructor(private options: FileServiceOptions = {}) {}

  async uploadFile(
    file: Buffer,
    originalName: string,
    mimeType: string,
    uploadedBy: string,
    options: UploadFileOptions = {}
  ): Promise<FileMetadata> {
    const timer = new PerformanceTimer('file_upload');
    const fileId = uuidv4();
    
    FileServiceLogger.logFileUpload(fileId, uploadedBy, originalName, file.length, mimeType);

    try {
      // Generate file checksum
      const checksum = crypto.createHash('sha256').update(file).digest('hex');
      
      // Check for duplicate files
      const existingFile = await this.findFileByChecksum(checksum);
      if (existingFile && this.featureFlags.fileVersioningEnabled) {
        return this.createFileVersion(existingFile, uploadedBy, options);
      }

      // Generate storage path
      const storagePath = this.generateStoragePath(fileId, originalName, mimeType);
      
      // Upload to storage
      const uploadResult = await this.storageProvider.upload(file, storagePath, {
        contentType: mimeType,
        metadata: {
          originalName,
          uploadedBy,
          fileId
        }
      });

      // Create file metadata
      const fileMetadata: Omit<FileMetadata, 'createdAt' | 'updatedAt'> = {
        id: fileId,
        originalName,
        storagePath,
        publicUrl: uploadResult.url,
        mimeType,
        size: file.length,
        checksum,
        uploadedBy,
        organizationId: options.courseId ? await this.getOrganizationIdFromCourse(options.courseId) : undefined,
        courseId: options.courseId,
        permissions: this.buildFilePermissions(options.permissions),
        status: options.skipProcessing ? FileStatus.READY : FileStatus.PENDING,
        processingMetadata: undefined,
        version: 1,
        parentId: undefined,
        isLatest: true,
        deletedAt: undefined,
        expiresAt: options.isTemporary && options.expiresIn 
          ? new Date(Date.now() + options.expiresIn * 1000) 
          : undefined
      };

      // Save to database
      const [savedFile] = await this.db('files')
        .insert({
          ...fileMetadata,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');

      const result = this.mapDbRowToFileMetadata(savedFile);

      // Log access
      if (this.featureFlags.auditLoggingEnabled) {
        await this.logFileAccess(fileId, uploadedBy, 'upload');
      }

      // Queue processing if enabled
      if (!options.skipProcessing && this.shouldProcessFile(mimeType)) {
        await this.queueFileProcessing(fileId, mimeType);
      }

      const duration = timer.end({ fileId, size: file.length });
      FileServiceLogger.logFileUploadComplete(fileId, uploadedBy, originalName, duration);

      return result;
    } catch (error) {
      timer.end({ fileId, error: (error as Error).message });
      FileServiceLogger.logFileUploadError(fileId, uploadedBy, originalName, error as Error);
      throw error;
    }
  }

  async getFile(fileId: string, context: AuthContext): Promise<FileMetadata> {
    const file = await this.db('files')
      .where({ id: fileId, deleted_at: null })
      .first();

    if (!file) {
      throw new NotFoundError('File not found');
    }

    const fileMetadata = this.mapDbRowToFileMetadata(file);

    // Check permissions
    if (!await this.canAccessFile(fileMetadata, context, 'read')) {
      throw new AuthorizationError('Insufficient permissions to access file');
    }

    return fileMetadata;
  }

  async downloadFile(fileId: string, context: AuthContext, variant?: string): Promise<{
    buffer: Buffer;
    metadata: FileMetadata;
    contentType: string;
    filename: string;
  }> {
    const timer = new PerformanceTimer('file_download');
    
    try {
      const fileMetadata = await this.getFile(fileId, context);
      
      FileServiceLogger.logFileDownload(fileId, context.userId, fileMetadata.originalName, variant);

      let downloadPath = fileMetadata.storagePath;
      let contentType = fileMetadata.mimeType;
      let filename = fileMetadata.originalName;

      // Handle variant downloads
      if (variant && fileMetadata.processingMetadata) {
        const variantPath = this.getVariantPath(fileMetadata.processingMetadata, variant);
        if (variantPath) {
          downloadPath = variantPath.path;
          contentType = variantPath.contentType;
          filename = `${fileMetadata.originalName}_${variant}`;
        }
      }

      const buffer = await this.storageProvider.download(downloadPath);

      // Log access
      if (this.featureFlags.auditLoggingEnabled) {
        await this.logFileAccess(fileId, context.userId, 'download', { variant });
      }

      timer.end({ fileId, size: buffer.length, variant });

      return {
        buffer,
        metadata: fileMetadata,
        contentType,
        filename
      };
    } catch (error) {
      timer.end({ fileId, error: (error as Error).message });
      throw error;
    }
  }

  async listFiles(query: FileListQuery, context: AuthContext): Promise<PaginationResult<FileMetadata>> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const offset = (page - 1) * limit;

    let dbQuery = this.db('files')
      .where({ deleted_at: null });

    // Apply filters
    if (query.courseId) {
      dbQuery = dbQuery.where({ course_id: query.courseId });
    }

    if (query.mimeType) {
      if (query.mimeType.includes('*')) {
        const pattern = query.mimeType.replace('*', '%');
        dbQuery = dbQuery.where('mime_type', 'like', pattern);
      } else {
        dbQuery = dbQuery.where({ mime_type: query.mimeType });
      }
    }

    if (query.status) {
      dbQuery = dbQuery.where({ status: query.status });
    }

    if (query.uploadedBy) {
      dbQuery = dbQuery.where({ uploaded_by: query.uploadedBy });
    }

    // Apply sorting
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    const dbSortBy = sortBy === 'createdAt' ? 'created_at' : 
                     sortBy === 'name' ? 'original_name' : sortBy;
    
    dbQuery = dbQuery.orderBy(dbSortBy, sortOrder);

    // Get total count
    const [{ count }] = await dbQuery.clone().count('* as count');
    const total = parseInt(count as string);

    // Get paginated results
    const files = await dbQuery.limit(limit).offset(offset);

    // Filter files based on permissions
    const accessibleFiles = [];
    for (const file of files) {
      const fileMetadata = this.mapDbRowToFileMetadata(file);
      if (await this.canAccessFile(fileMetadata, context, 'read')) {
        accessibleFiles.push(fileMetadata);
      }
    }

    return {
      data: accessibleFiles,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };
  }

  async updateFileMetadata(
    fileId: string,
    updates: Partial<Pick<FileMetadata, 'originalName' | 'courseId' | 'permissions'>>,
    context: AuthContext
  ): Promise<FileMetadata> {
    const file = await this.getFile(fileId, context);

    // Check permissions
    if (!await this.canAccessFile(file, context, 'write')) {
      throw new AuthorizationError('Insufficient permissions to update file');
    }

    const updateData: any = {
      updated_at: new Date()
    };

    if (updates.originalName) {
      updateData.original_name = updates.originalName;
    }

    if (updates.courseId) {
      updateData.course_id = updates.courseId;
      updateData.organization_id = await this.getOrganizationIdFromCourse(updates.courseId);
    }

    if (updates.permissions) {
      // Update permissions table
      await this.updateFilePermissions(fileId, updates.permissions, context.userId);
    }

    await this.db('files')
      .where({ id: fileId })
      .update(updateData);

    // Log access
    if (this.featureFlags.auditLoggingEnabled) {
      await this.logFileAccess(fileId, context.userId, 'update', updates);
    }

    return this.getFile(fileId, context);
  }

  async deleteFile(fileId: string, context: AuthContext, force: boolean = false): Promise<void> {
    const file = await this.getFile(fileId, context);

    // Check permissions
    if (!await this.canAccessFile(file, context, 'delete')) {
      throw new AuthorizationError('Insufficient permissions to delete file');
    }

    if (force) {
      // Hard delete - remove from storage and database
      await this.storageProvider.delete(file.storagePath);
      
      // Delete variants and processed files
      if (file.processingMetadata) {
        await this.deleteProcessedFiles(file.processingMetadata);
      }

      await this.db('files').where({ id: fileId }).del();
    } else {
      // Soft delete
      await this.db('files')
        .where({ id: fileId })
        .update({
          status: FileStatus.DELETED,
          deleted_at: new Date(),
          updated_at: new Date()
        });
    }

    // Log access
    if (this.featureFlags.auditLoggingEnabled) {
      await this.logFileAccess(fileId, context.userId, 'delete', { force });
    }

    FileServiceLogger.logFileDownload(fileId, context.userId, file.originalName);
  }

  async getProcessingStatus(fileId: string, context: AuthContext): Promise<{
    fileId: string;
    status: FileStatus;
    progress: number;
    estimatedTimeRemaining?: number;
    processingSteps: any[];
  }> {
    const file = await this.getFile(fileId, context);

    // Get processing jobs
    const jobs = await this.db('processing_jobs')
      .where({ file_id: fileId })
      .orderBy('created_at', 'desc');

    const processingSteps = jobs.map(job => ({
      step: job.job_type,
      status: job.status,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      error: job.error_message,
      progress: this.calculateJobProgress(job)
    }));

    const overallProgress = this.calculateOverallProgress(jobs);

    return {
      fileId,
      status: file.status,
      progress: overallProgress,
      estimatedTimeRemaining: this.estimateTimeRemaining(jobs),
      processingSteps
    };
  }

  // Private helper methods
  private generateStoragePath(fileId: string, originalName: string, mimeType: string): string {
    const ext = originalName.split('.').pop() || '';
    const category = this.getCategoryFromMimeType(mimeType);
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    
    return `${category}/${year}/${month}/${fileId}.${ext}`;
  }

  private getCategoryFromMimeType(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'images';
    if (mimeType.startsWith('video/')) return 'videos';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf')) return 'documents';
    if (mimeType.startsWith('text/')) return 'documents';
    return 'files';
  }

  private buildFilePermissions(permissions?: Partial<FilePermissions>): FilePermissions {
    return {
      isPublic: permissions?.isPublic || false,
      allowedRoles: permissions?.allowedRoles || [],
      allowedUsers: permissions?.allowedUsers || [],
      requiresAuth: permissions?.requiresAuth !== false
    };
  }

  private async canAccessFile(
    file: FileMetadata, 
    context: AuthContext, 
    action: 'read' | 'write' | 'delete'
  ): Promise<boolean> {
    // Owner can always access
    if (file.uploadedBy === context.userId) {
      return true;
    }

    // Admin can always access
    if (context.roles.includes('admin')) {
      return true;
    }

    // Check public access for read operations
    if (action === 'read' && file.permissions.isPublic) {
      return true;
    }

    // Check role-based permissions
    if (file.permissions.allowedRoles.some(role => context.roles.includes(role))) {
      return true;
    }

    // Check user-specific permissions
    if (file.permissions.allowedUsers.includes(context.userId)) {
      return true;
    }

    return false;
  }

  private shouldProcessFile(mimeType: string): boolean {
    return mimeType.startsWith('image/') || mimeType.startsWith('video/');
  }

  private async queueFileProcessing(fileId: string, mimeType: string): Promise<void> {
    const jobs = [];

    if (mimeType.startsWith('image/')) {
      jobs.push({
        file_id: fileId,
        job_type: 'image_optimization',
        priority: 1
      });
    }

    if (mimeType.startsWith('video/')) {
      jobs.push(
        {
          file_id: fileId,
          job_type: 'video_transcoding',
          priority: 2
        },
        {
          file_id: fileId,
          job_type: 'hls_generation',
          priority: 3
        }
      );
    }

    if (jobs.length > 0) {
      await this.db('processing_jobs').insert(jobs);
    }
  }

  private mapDbRowToFileMetadata(row: any): FileMetadata {
    return {
      id: row.id,
      originalName: row.original_name,
      storagePath: row.storage_path,
      publicUrl: row.public_url,
      mimeType: row.mime_type,
      size: parseInt(row.size),
      checksum: row.checksum,
      uploadedBy: row.uploaded_by,
      organizationId: row.organization_id,
      courseId: row.course_id,
      permissions: this.buildFilePermissions(), // Would need to load from permissions table
      status: row.status,
      processingMetadata: row.processing_metadata,
      version: row.version,
      parentId: row.parent_id,
      isLatest: row.is_latest,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      expiresAt: row.expires_at
    };
  }

  private async findFileByChecksum(checksum: string): Promise<FileMetadata | null> {
    const file = await this.db('files')
      .where({ checksum, deleted_at: null })
      .first();

    return file ? this.mapDbRowToFileMetadata(file) : null;
  }

  private async createFileVersion(
    existingFile: FileMetadata, 
    uploadedBy: string, 
    options: UploadFileOptions
  ): Promise<FileMetadata> {
    // Implementation for file versioning
    throw new Error('File versioning not implemented yet');
  }

  private async getOrganizationIdFromCourse(courseId: string): Promise<string | undefined> {
    // This would typically query the course service or database
    // For now, return undefined
    return undefined;
  }

  private async logFileAccess(
    fileId: string, 
    userId: string, 
    action: string, 
    metadata?: any
  ): Promise<void> {
    await this.db('file_access_logs').insert({
      file_id: fileId,
      user_id: userId,
      action,
      metadata: metadata ? JSON.stringify(metadata) : null,
      created_at: new Date()
    });
  }

  private getVariantPath(
    processingMetadata: ProcessingMetadata, 
    variant: string
  ): { path: string; contentType: string } | null {
    // Check image variants
    if (processingMetadata.imageVariants) {
      const imageVariant = processingMetadata.imageVariants.find(v => v.size === variant);
      if (imageVariant) {
        return {
          path: imageVariant.path,
          contentType: `image/${imageVariant.format}`
        };
      }
    }

    // Check video variants
    if (processingMetadata.videoVariants) {
      const videoVariant = processingMetadata.videoVariants.find(v => v.quality === variant);
      if (videoVariant) {
        return {
          path: videoVariant.path,
          contentType: 'video/mp4'
        };
      }
    }

    return null;
  }

  private async updateFilePermissions(
    fileId: string, 
    permissions: Partial<FilePermissions>, 
    grantedBy: string
  ): Promise<void> {
    // Delete existing permissions
    await this.db('file_permissions').where({ file_id: fileId }).del();

    // Insert new permissions
    const permissionRows = [];

    if (permissions.isPublic) {
      permissionRows.push({
        file_id: fileId,
        permission_type: 'public',
        permission_value: 'true',
        granted_by: grantedBy
      });
    }

    if (permissions.allowedRoles) {
      for (const role of permissions.allowedRoles) {
        permissionRows.push({
          file_id: fileId,
          permission_type: 'role',
          permission_value: role,
          granted_by: grantedBy
        });
      }
    }

    if (permissions.allowedUsers) {
      for (const userId of permissions.allowedUsers) {
        permissionRows.push({
          file_id: fileId,
          permission_type: 'user',
          permission_value: userId,
          granted_by: grantedBy
        });
      }
    }

    if (permissionRows.length > 0) {
      await this.db('file_permissions').insert(permissionRows);
    }
  }

  private async deleteProcessedFiles(processingMetadata: ProcessingMetadata): Promise<void> {
    const pathsToDelete = [];

    if (processingMetadata.imageVariants) {
      pathsToDelete.push(...processingMetadata.imageVariants.map(v => v.path));
    }

    if (processingMetadata.videoVariants) {
      pathsToDelete.push(...processingMetadata.videoVariants.map(v => v.path));
    }

    if (processingMetadata.hlsPlaylist) {
      pathsToDelete.push(processingMetadata.hlsPlaylist.masterPlaylistPath);
      for (const variant of processingMetadata.hlsPlaylist.variants) {
        pathsToDelete.push(variant.playlistPath);
        pathsToDelete.push(...variant.segmentPaths);
      }
    }

    if (processingMetadata.thumbnailPath) {
      pathsToDelete.push(processingMetadata.thumbnailPath);
    }

    // Delete all paths
    for (const path of pathsToDelete) {
      try {
        await this.storageProvider.delete(path);
      } catch (error) {
        // Log error but continue with other deletions
        FileServiceLogger.logStorageOperation('delete', path, false, 0, error as Error);
      }
    }
  }

  private calculateJobProgress(job: any): number {
    if (job.status === 'completed') return 100;
    if (job.status === 'failed') return 0;
    if (job.status === 'pending') return 0;
    
    // For in-progress jobs, estimate based on time elapsed
    if (job.started_at) {
      const elapsed = Date.now() - new Date(job.started_at).getTime();
      const estimatedTotal = 60000; // 1 minute estimate
      return Math.min(90, Math.floor((elapsed / estimatedTotal) * 100));
    }
    
    return 0;
  }

  private calculateOverallProgress(jobs: any[]): number {
    if (jobs.length === 0) return 0;
    
    const totalProgress = jobs.reduce((sum, job) => sum + this.calculateJobProgress(job), 0);
    return Math.floor(totalProgress / jobs.length);
  }

  private estimateTimeRemaining(jobs: any[]): number | undefined {
    const inProgressJobs = jobs.filter(job => job.status === 'in_progress');
    if (inProgressJobs.length === 0) return undefined;
    
    // Simple estimation based on average job time
    return inProgressJobs.length * 30; // 30 seconds per job estimate
  }
}
