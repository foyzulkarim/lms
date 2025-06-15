import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { 
  FileResponseSchema,
  FileListQuerySchema,
  DownloadQuerySchema,
  ProcessingStatusResponseSchema,
  NotFoundError
} from '@/types';
import { FileService } from '@/services/file-service';
import { requireAuth, optionalAuth, getAuthContext } from '@/middleware/auth';
import { FileServiceLogger } from '@/utils/logger';

export async function fileRoutes(fastify: FastifyInstance) {
  const fileService = new FileService();

  // Get file metadata
  fastify.get('/:fileId', {
    preHandler: [requireAuth],
    schema: {
      params: Type.Object({
        fileId: Type.String()
      }),
      response: {
        200: FileResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: any }>, reply: FastifyReply) => {
    const auth = getAuthContext(request);
    const { fileId } = request.params;

    const fileMetadata = await fileService.getFile(fileId, auth);

    reply.send({
      id: fileMetadata.id,
      originalName: fileMetadata.originalName,
      url: `/api/v1/files/${fileMetadata.id}/download`,
      publicUrl: fileMetadata.publicUrl,
      mimeType: fileMetadata.mimeType,
      size: fileMetadata.size,
      status: fileMetadata.status,
      uploadedAt: fileMetadata.createdAt.toISOString(),
      processingMetadata: fileMetadata.processingMetadata
    });
  });

  // Download file
  fastify.get('/:fileId/download', {
    preHandler: [optionalAuth],
    schema: {
      params: Type.Object({
        fileId: Type.String()
      }),
      querystring: DownloadQuerySchema
    }
  }, async (request: FastifyRequest<{ Params: any; Querystring: any }>, reply: FastifyReply) => {
    const { fileId } = request.params;
    const { variant, quality, inline = true } = request.querystring;
    
    // For public files, auth might not be required
    const auth = request.auth || { 
      userId: 'anonymous', 
      roles: [], 
      permissions: [] 
    };

    try {
      const downloadResult = await fileService.downloadFile(fileId, auth, variant || quality);
      
      // Set appropriate headers
      reply.header('Content-Type', downloadResult.contentType);
      reply.header('Content-Length', downloadResult.buffer.length);
      reply.header('Content-Disposition', 
        `${inline ? 'inline' : 'attachment'}; filename="${downloadResult.filename}"`
      );
      
      // Cache headers for static content
      if (downloadResult.metadata.status === 'ready') {
        reply.header('Cache-Control', 'public, max-age=31536000'); // 1 year
        reply.header('ETag', `"${downloadResult.metadata.checksum}"`);
      }

      // Handle range requests for video streaming
      const range = request.headers.range;
      if (range && downloadResult.contentType.startsWith('video/')) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : downloadResult.buffer.length - 1;
        const chunksize = (end - start) + 1;
        const chunk = downloadResult.buffer.slice(start, end + 1);

        reply.status(206);
        reply.header('Content-Range', `bytes ${start}-${end}/${downloadResult.buffer.length}`);
        reply.header('Accept-Ranges', 'bytes');
        reply.header('Content-Length', chunksize);
        
        return reply.send(chunk);
      }

      reply.send(downloadResult.buffer);

    } catch (error) {
      if (error instanceof NotFoundError) {
        reply.status(404).send({ error: 'File not found' });
      } else {
        throw error;
      }
    }
  });

  // Stream file (for large files)
  fastify.get('/:fileId/stream', {
    preHandler: [optionalAuth],
    schema: {
      params: Type.Object({
        fileId: Type.String()
      })
    }
  }, async (request: FastifyRequest<{ Params: any }>, reply: FastifyReply) => {
    const { fileId } = request.params;
    const auth = request.auth || { 
      userId: 'anonymous', 
      roles: [], 
      permissions: [] 
    };

    const downloadResult = await fileService.downloadFile(fileId, auth);
    
    // Set streaming headers
    reply.header('Content-Type', downloadResult.contentType);
    reply.header('Accept-Ranges', 'bytes');
    
    const range = request.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : downloadResult.buffer.length - 1;
      const chunksize = (end - start) + 1;
      const chunk = downloadResult.buffer.slice(start, end + 1);

      reply.status(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${downloadResult.buffer.length}`);
      reply.header('Content-Length', chunksize);
      
      return reply.send(chunk);
    }

    reply.send(downloadResult.buffer);
  });

  // List files
  fastify.get('/', {
    preHandler: [requireAuth],
    schema: {
      querystring: FileListQuerySchema,
      response: {
        200: Type.Object({
          files: Type.Array(FileResponseSchema),
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
    const auth = getAuthContext(request);
    const query = request.query;

    const result = await fileService.listFiles(query, auth);

    const files = result.data.map(file => ({
      id: file.id,
      originalName: file.originalName,
      url: `/api/v1/files/${file.id}/download`,
      publicUrl: file.publicUrl,
      mimeType: file.mimeType,
      size: file.size,
      status: file.status,
      uploadedAt: file.createdAt.toISOString(),
      processingMetadata: file.processingMetadata
    }));

    reply.send({
      files,
      pagination: result.pagination
    });
  });

  // Update file metadata
  fastify.patch('/:fileId', {
    preHandler: [requireAuth],
    schema: {
      params: Type.Object({
        fileId: Type.String()
      }),
      body: Type.Object({
        originalName: Type.Optional(Type.String()),
        courseId: Type.Optional(Type.String()),
        permissions: Type.Optional(Type.Object({
          isPublic: Type.Optional(Type.Boolean()),
          allowedRoles: Type.Optional(Type.Array(Type.String())),
          allowedUsers: Type.Optional(Type.Array(Type.String())),
          requiresAuth: Type.Optional(Type.Boolean())
        }))
      }),
      response: {
        200: FileResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: any; Body: any }>, reply: FastifyReply) => {
    const auth = getAuthContext(request);
    const { fileId } = request.params;
    const updates = request.body;

    const updatedFile = await fileService.updateFileMetadata(fileId, updates, auth);

    reply.send({
      id: updatedFile.id,
      originalName: updatedFile.originalName,
      url: `/api/v1/files/${updatedFile.id}/download`,
      publicUrl: updatedFile.publicUrl,
      mimeType: updatedFile.mimeType,
      size: updatedFile.size,
      status: updatedFile.status,
      uploadedAt: updatedFile.createdAt.toISOString(),
      processingMetadata: updatedFile.processingMetadata
    });
  });

  // Delete file
  fastify.delete('/:fileId', {
    preHandler: [requireAuth],
    schema: {
      params: Type.Object({
        fileId: Type.String()
      }),
      querystring: Type.Object({
        force: Type.Optional(Type.Boolean())
      })
    }
  }, async (request: FastifyRequest<{ Params: any; Querystring: any }>, reply: FastifyReply) => {
    const auth = getAuthContext(request);
    const { fileId } = request.params;
    const { force = false } = request.query;

    await fileService.deleteFile(fileId, auth, force);

    reply.status(204).send();
  });

  // Get processing status
  fastify.get('/:fileId/processing', {
    preHandler: [requireAuth],
    schema: {
      params: Type.Object({
        fileId: Type.String()
      }),
      response: {
        200: ProcessingStatusResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: any }>, reply: FastifyReply) => {
    const auth = getAuthContext(request);
    const { fileId } = request.params;

    const status = await fileService.getProcessingStatus(fileId, auth);

    reply.send(status);
  });

  // Retry processing
  fastify.post('/:fileId/processing/retry', {
    preHandler: [requireAuth],
    schema: {
      params: Type.Object({
        fileId: Type.String()
      }),
      response: {
        202: Type.Object({
          message: Type.String(),
          jobId: Type.String()
        })
      }
    }
  }, async (request: FastifyRequest<{ Params: any }>, reply: FastifyReply) => {
    const auth = getAuthContext(request);
    const { fileId } = request.params;

    // Get file to verify access
    await fileService.getFile(fileId, auth);

    // Queue processing retry
    const jobId = `retry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // In a real implementation, you would queue the job here
    FileServiceLogger.logFileProcessingStart(fileId, 'retry');

    reply.status(202).send({
      message: 'Processing retry initiated',
      jobId
    });
  });

  // Get file variants (for processed files)
  fastify.get('/:fileId/variants', {
    preHandler: [requireAuth],
    schema: {
      params: Type.Object({
        fileId: Type.String()
      }),
      response: {
        200: Type.Object({
          fileId: Type.String(),
          variants: Type.Object({
            images: Type.Optional(Type.Array(Type.Object({
              size: Type.String(),
              width: Type.Number(),
              height: Type.Number(),
              url: Type.String(),
              format: Type.String()
            }))),
            videos: Type.Optional(Type.Array(Type.Object({
              quality: Type.String(),
              width: Type.Number(),
              height: Type.Number(),
              url: Type.String(),
              duration: Type.Number(),
              bitrate: Type.Number()
            }))),
            hls: Type.Optional(Type.Object({
              masterPlaylist: Type.String(),
              variants: Type.Array(Type.Object({
                quality: Type.String(),
                bandwidth: Type.Number(),
                resolution: Type.String(),
                playlist: Type.String()
              }))
            }))
          })
        })
      }
    }
  }, async (request: FastifyRequest<{ Params: any }>, reply: FastifyReply) => {
    const auth = getAuthContext(request);
    const { fileId } = request.params;

    const file = await fileService.getFile(fileId, auth);

    const variants: any = {};

    if (file.processingMetadata?.imageVariants) {
      variants.images = file.processingMetadata.imageVariants.map(variant => ({
        size: variant.size,
        width: variant.width,
        height: variant.height,
        url: `/api/v1/files/${fileId}/download?variant=${variant.size}`,
        format: variant.format
      }));
    }

    if (file.processingMetadata?.videoVariants) {
      variants.videos = file.processingMetadata.videoVariants.map(variant => ({
        quality: variant.quality,
        width: variant.width,
        height: variant.height,
        url: `/api/v1/files/${fileId}/download?variant=${variant.quality}`,
        duration: variant.duration,
        bitrate: variant.bitrate
      }));
    }

    if (file.processingMetadata?.hlsPlaylist) {
      variants.hls = {
        masterPlaylist: `/api/v1/files/${fileId}/hls/master.m3u8`,
        variants: file.processingMetadata.hlsPlaylist.variants.map(variant => ({
          quality: variant.quality,
          bandwidth: variant.bandwidth,
          resolution: variant.resolution,
          playlist: `/api/v1/files/${fileId}/hls/${variant.quality}.m3u8`
        }))
      };
    }

    reply.send({
      fileId,
      variants
    });
  });

  // Serve HLS playlists and segments
  fastify.get('/:fileId/hls/:filename', {
    preHandler: [optionalAuth],
    schema: {
      params: Type.Object({
        fileId: Type.String(),
        filename: Type.String()
      })
    }
  }, async (request: FastifyRequest<{ Params: any }>, reply: FastifyReply) => {
    const { fileId, filename } = request.params;
    const auth = request.auth || { 
      userId: 'anonymous', 
      roles: [], 
      permissions: [] 
    };

    try {
      const file = await fileService.getFile(fileId, auth);
      
      if (!file.processingMetadata?.hlsPlaylist) {
        throw new NotFoundError('HLS playlist not available');
      }

      // Determine the file path based on filename
      let filePath: string;
      
      if (filename === 'master.m3u8') {
        filePath = file.processingMetadata.hlsPlaylist.masterPlaylistPath;
      } else if (filename.endsWith('.m3u8')) {
        // Find variant playlist
        const variant = file.processingMetadata.hlsPlaylist.variants.find(v => 
          filename === `${v.quality}.m3u8`
        );
        if (!variant) {
          throw new NotFoundError('Playlist variant not found');
        }
        filePath = variant.playlistPath;
      } else if (filename.endsWith('.ts')) {
        // Find segment file
        let segmentPath: string | undefined;
        for (const variant of file.processingMetadata.hlsPlaylist.variants) {
          segmentPath = variant.segmentPaths.find(path => 
            path.endsWith(filename)
          );
          if (segmentPath) break;
        }
        
        if (!segmentPath) {
          throw new NotFoundError('Segment not found');
        }
        filePath = segmentPath;
      } else {
        throw new NotFoundError('Invalid HLS file');
      }

      // Download file from storage
      const storageProvider = require('@/storage/storage-factory').getStorageProvider();
      const buffer = await storageProvider.download(filePath);

      // Set appropriate content type
      let contentType = 'application/octet-stream';
      if (filename.endsWith('.m3u8')) {
        contentType = 'application/vnd.apple.mpegurl';
      } else if (filename.endsWith('.ts')) {
        contentType = 'video/MP2T';
      }

      reply.header('Content-Type', contentType);
      reply.header('Cache-Control', filename.endsWith('.m3u8') ? 
        'public, max-age=300' : 'public, max-age=31536000'
      );
      
      reply.send(buffer);

    } catch (error) {
      if (error instanceof NotFoundError) {
        reply.status(404).send({ error: 'File not found' });
      } else {
        throw error;
      }
    }
  });
}
