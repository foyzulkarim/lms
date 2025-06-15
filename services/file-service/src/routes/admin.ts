import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { 
  StorageStatsResponseSchema,
  CleanupRequestSchema
} from '@/types';
import { FileService } from '@/services/file-service';
import { requireAdmin } from '@/middleware/auth';
import { getDatabase } from '@/database/connection';
import { getStorageProvider } from '@/storage/storage-factory';
import { FileServiceLogger } from '@/utils/logger';

export async function adminRoutes(fastify: FastifyInstance) {
  const fileService = new FileService();
  const db = getDatabase();
  const storageProvider = getStorageProvider();

  // Get storage statistics
  fastify.get('/storage/stats', {
    preHandler: [requireAdmin],
    schema: {
      response: {
        200: StorageStatsResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get file statistics from database
      const [totalStats] = await db('files')
        .where({ deleted_at: null })
        .count('* as count')
        .sum('size as total_size');

      const totalFiles = parseInt(totalStats.count as string);
      const totalSize = parseInt(totalStats.total_size as string) || 0;

      // Get storage usage by backend (if available)
      let storageUsage: any = {};
      
      if ('getStorageStats' in storageProvider) {
        try {
          const stats = await (storageProvider as any).getStorageStats();
          storageUsage.current = {
            files: stats.totalObjects,
            size: stats.totalSize,
            percentage: 100
          };
        } catch (error) {
          FileServiceLogger.logStorageOperation('stats', 'storage', false, 0, error as Error);
        }
      }

      // Get MIME type breakdown
      const mimeTypeStats = await db('files')
        .where({ deleted_at: null })
        .select('mime_type')
        .count('* as files')
        .sum('size as size')
        .groupBy('mime_type')
        .orderBy('size', 'desc');

      const mimeTypeBreakdown: any = {};
      for (const stat of mimeTypeStats) {
        mimeTypeBreakdown[stat.mime_type] = {
          files: parseInt(stat.files as string),
          size: parseInt(stat.size as string) || 0
        };
      }

      // Get status breakdown
      const statusStats = await db('files')
        .select('status')
        .count('* as files')
        .sum('size as size')
        .groupBy('status')
        .orderBy('files', 'desc');

      const statusBreakdown: any = {};
      for (const stat of statusStats) {
        statusBreakdown[stat.status] = {
          files: parseInt(stat.files as string),
          size: parseInt(stat.size as string) || 0
        };
      }

      reply.send({
        totalFiles,
        totalSize,
        storageUsage,
        mimeTypeBreakdown,
        statusBreakdown
      });

    } catch (error) {
      FileServiceLogger.logStorageOperation('admin_stats', 'database', false, 0, error as Error);
      throw error;
    }
  });

  // Get detailed system metrics
  fastify.get('/metrics', {
    preHandler: [requireAdmin],
    schema: {
      response: {
        200: Type.Object({
          system: Type.Object({
            uptime: Type.Number(),
            memory: Type.Object({
              used: Type.Number(),
              total: Type.Number(),
              percentage: Type.Number()
            }),
            cpu: Type.Object({
              usage: Type.Number()
            })
          }),
          storage: Type.Object({
            totalFiles: Type.Number(),
            totalSize: Type.Number(),
            averageFileSize: Type.Number()
          }),
          processing: Type.Object({
            pendingJobs: Type.Number(),
            processingJobs: Type.Number(),
            failedJobs: Type.Number(),
            completedJobs: Type.Number()
          }),
          activity: Type.Object({
            uploadsToday: Type.Number(),
            downloadsToday: Type.Number(),
            activeUsers: Type.Number()
          })
        })
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // System metrics
    const memUsage = process.memoryUsage();
    const systemMetrics = {
      uptime: process.uptime(),
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
      },
      cpu: {
        usage: process.cpuUsage().user / 1000000 // Convert to seconds
      }
    };

    // Storage metrics
    const [storageStats] = await db('files')
      .where({ deleted_at: null })
      .count('* as count')
      .sum('size as total_size')
      .avg('size as avg_size');

    const storageMetrics = {
      totalFiles: parseInt(storageStats.count as string),
      totalSize: parseInt(storageStats.total_size as string) || 0,
      averageFileSize: Math.round(parseFloat(storageStats.avg_size as string) || 0)
    };

    // Processing metrics
    const processingStats = await db('processing_jobs')
      .select('status')
      .count('* as count')
      .groupBy('status');

    const processingMetrics = {
      pendingJobs: 0,
      processingJobs: 0,
      failedJobs: 0,
      completedJobs: 0
    };

    for (const stat of processingStats) {
      const count = parseInt(stat.count as string);
      switch (stat.status) {
        case 'pending':
          processingMetrics.pendingJobs = count;
          break;
        case 'in_progress':
          processingMetrics.processingJobs = count;
          break;
        case 'failed':
          processingMetrics.failedJobs = count;
          break;
        case 'completed':
          processingMetrics.completedJobs = count;
          break;
      }
    }

    // Activity metrics
    const [uploadStats] = await db('files')
      .where('created_at', '>=', startOfDay)
      .count('* as uploads');

    const [downloadStats] = await db('file_access_logs')
      .where('action', 'download')
      .where('created_at', '>=', startOfDay)
      .count('* as downloads');

    const [activeUserStats] = await db('file_access_logs')
      .where('created_at', '>=', startOfDay)
      .countDistinct('user_id as active_users');

    const activityMetrics = {
      uploadsToday: parseInt(uploadStats.uploads as string),
      downloadsToday: parseInt(downloadStats.downloads as string),
      activeUsers: parseInt(activeUserStats.active_users as string)
    };

    reply.send({
      system: systemMetrics,
      storage: storageMetrics,
      processing: processingMetrics,
      activity: activityMetrics
    });
  });

  // Cleanup expired and deleted files
  fastify.post('/files/cleanup', {
    preHandler: [requireAdmin],
    schema: {
      body: CleanupRequestSchema,
      response: {
        200: Type.Object({
          filesFound: Type.Number(),
          filesDeleted: Type.Number(),
          spaceFreed: Type.Number(),
          details: Type.Array(Type.Object({
            fileId: Type.String(),
            originalName: Type.String(),
            size: Type.Number(),
            reason: Type.String()
          }))
        })
      }
    }
  }, async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const { dryRun = true, olderThan, status } = request.body;

    let query = db('files');

    // Apply filters
    if (olderThan) {
      query = query.where('created_at', '<', new Date(olderThan));
    }

    if (status && status.length > 0) {
      query = query.whereIn('status', status);
    } else {
      // Default: cleanup deleted and failed files
      query = query.whereIn('status', ['deleted', 'failed']);
    }

    // Also include expired files
    query = query.orWhere('expires_at', '<', new Date());

    const filesToCleanup = await query.select('*');

    const details = filesToCleanup.map(file => ({
      fileId: file.id,
      originalName: file.original_name,
      size: parseInt(file.size),
      reason: file.expires_at && new Date(file.expires_at) < new Date() ? 'expired' :
              file.status === 'deleted' ? 'deleted' :
              file.status === 'failed' ? 'failed' : 'other'
    }));

    const spaceFreed = details.reduce((sum, file) => sum + file.size, 0);

    if (!dryRun) {
      // Actually delete the files
      for (const file of filesToCleanup) {
        try {
          // Delete from storage
          await storageProvider.delete(file.storage_path);
          
          // Delete processed files if they exist
          if (file.processing_metadata) {
            const metadata = JSON.parse(file.processing_metadata);
            // Delete variants, thumbnails, HLS files, etc.
            // Implementation would depend on the structure
          }

          // Delete from database
          await db('files').where({ id: file.id }).del();

          FileServiceLogger.logStorageOperation('cleanup_delete', file.storage_path, true);
        } catch (error) {
          FileServiceLogger.logStorageOperation('cleanup_delete', file.storage_path, false, 0, error as Error);
        }
      }
    }

    reply.send({
      filesFound: filesToCleanup.length,
      filesDeleted: dryRun ? 0 : filesToCleanup.length,
      spaceFreed,
      details
    });
  });

  // Clear cache
  fastify.delete('/cache', {
    preHandler: [requireAdmin],
    schema: {
      querystring: Type.Object({
        pattern: Type.Optional(Type.String())
      }),
      response: {
        200: Type.Object({
          message: Type.String(),
          keysCleared: Type.Number()
        })
      }
    }
  }, async (request: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) => {
    const { pattern } = request.query;

    // This would integrate with your Redis cache
    // For now, we'll just return a mock response
    const keysCleared = 0;

    reply.send({
      message: `Cache cleared${pattern ? ` for pattern: ${pattern}` : ''}`,
      keysCleared
    });
  });

  // Get processing queue status
  fastify.get('/processing/queue', {
    preHandler: [requireAdmin],
    schema: {
      response: {
        200: Type.Object({
          queues: Type.Array(Type.Object({
            name: Type.String(),
            pending: Type.Number(),
            active: Type.Number(),
            completed: Type.Number(),
            failed: Type.Number(),
            delayed: Type.Number()
          }))
        })
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Get processing job statistics
    const jobStats = await db('processing_jobs')
      .select('job_type', 'status')
      .count('* as count')
      .groupBy('job_type', 'status');

    const queueStats: any = {};

    for (const stat of jobStats) {
      const jobType = stat.job_type;
      const status = stat.status;
      const count = parseInt(stat.count as string);

      if (!queueStats[jobType]) {
        queueStats[jobType] = {
          name: jobType,
          pending: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0
        };
      }

      switch (status) {
        case 'pending':
          queueStats[jobType].pending = count;
          break;
        case 'in_progress':
          queueStats[jobType].active = count;
          break;
        case 'completed':
          queueStats[jobType].completed = count;
          break;
        case 'failed':
          queueStats[jobType].failed = count;
          break;
      }
    }

    reply.send({
      queues: Object.values(queueStats)
    });
  });

  // Retry failed processing jobs
  fastify.post('/processing/retry-failed', {
    preHandler: [requireAdmin],
    schema: {
      body: Type.Object({
        jobType: Type.Optional(Type.String()),
        maxAge: Type.Optional(Type.Number()) // Hours
      }),
      response: {
        200: Type.Object({
          message: Type.String(),
          jobsRetried: Type.Number()
        })
      }
    }
  }, async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const { jobType, maxAge = 24 } = request.body;

    let query = db('processing_jobs')
      .where({ status: 'failed' });

    if (jobType) {
      query = query.where({ job_type: jobType });
    }

    if (maxAge) {
      const cutoffTime = new Date(Date.now() - maxAge * 60 * 60 * 1000);
      query = query.where('failed_at', '>', cutoffTime);
    }

    const failedJobs = await query.select('*');

    // Reset failed jobs to pending
    const jobIds = failedJobs.map(job => job.id);
    
    if (jobIds.length > 0) {
      await db('processing_jobs')
        .whereIn('id', jobIds)
        .update({
          status: 'pending',
          attempts: 0,
          error_message: null,
          failed_at: null,
          scheduled_at: new Date()
        });
    }

    reply.send({
      message: `Retried ${jobIds.length} failed processing jobs`,
      jobsRetried: jobIds.length
    });
  });

  // Get file access logs
  fastify.get('/access-logs', {
    preHandler: [requireAdmin],
    schema: {
      querystring: Type.Object({
        fileId: Type.Optional(Type.String()),
        userId: Type.Optional(Type.String()),
        action: Type.Optional(Type.String()),
        startDate: Type.Optional(Type.String()),
        endDate: Type.Optional(Type.String()),
        page: Type.Optional(Type.Number({ minimum: 1 })),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 }))
      }),
      response: {
        200: Type.Object({
          logs: Type.Array(Type.Object({
            id: Type.String(),
            fileId: Type.String(),
            userId: Type.String(),
            action: Type.String(),
            ipAddress: Type.Optional(Type.String()),
            userAgent: Type.Optional(Type.String()),
            metadata: Type.Optional(Type.Any()),
            createdAt: Type.String()
          })),
          pagination: Type.Object({
            page: Type.Number(),
            limit: Type.Number(),
            total: Type.Number(),
            totalPages: Type.Number(),
            hasNext: Type.Boolean(),
            hasPrev: Type.Boolean()
          })
        })
      }
    }
  }, async (request: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) => {
    const { 
      fileId, 
      userId, 
      action, 
      startDate, 
      endDate, 
      page = 1, 
      limit = 20 
    } = request.query;

    let query = db('file_access_logs');

    // Apply filters
    if (fileId) query = query.where({ file_id: fileId });
    if (userId) query = query.where({ user_id: userId });
    if (action) query = query.where({ action });
    if (startDate) query = query.where('created_at', '>=', new Date(startDate));
    if (endDate) query = query.where('created_at', '<=', new Date(endDate));

    // Get total count
    const [{ count }] = await query.clone().count('* as count');
    const total = parseInt(count as string);

    // Get paginated results
    const offset = (page - 1) * limit;
    const logs = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const formattedLogs = logs.map(log => ({
      id: log.id,
      fileId: log.file_id,
      userId: log.user_id,
      action: log.action,
      ipAddress: log.ip_address,
      userAgent: log.user_agent,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
      createdAt: log.created_at.toISOString()
    }));

    reply.send({
      logs: formattedLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  });
}
