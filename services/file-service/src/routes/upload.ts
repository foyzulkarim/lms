import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { 
  UploadRequestSchema, 
  FileResponseSchema, 
  BatchUploadResponseSchema,
  ChunkedUploadInitSchema,
  ChunkedUploadInitResponseSchema,
  ChunkUploadResponseSchema,
  CompleteChunkedUploadSchema,
  ValidationError 
} from '@/types';
import { FileService } from '@/services/file-service';
import { requireAuth, getAuthContext } from '@/middleware/auth';
import { FileServiceLogger } from '@/utils/logger';
import { getSecurityConfig } from '@/config/env';

export async function uploadRoutes(fastify: FastifyInstance) {
  const fileService = new FileService();
  const securityConfig = getSecurityConfig();

  // Single file upload
  fastify.post('/upload', {
    preHandler: [requireAuth],
    schema: {
      consumes: ['multipart/form-data'],
      body: Type.Object({
        file: Type.Any(),
        courseId: Type.Optional(Type.String()),
        permissions: Type.Optional(Type.Object({
          isPublic: Type.Optional(Type.Boolean()),
          allowedRoles: Type.Optional(Type.Array(Type.String())),
          allowedUsers: Type.Optional(Type.Array(Type.String())),
          requiresAuth: Type.Optional(Type.Boolean())
        })),
        isTemporary: Type.Optional(Type.Boolean()),
        expiresIn: Type.Optional(Type.Number())
      }),
      response: {
        201: FileResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = getAuthContext(request);
    
    try {
      const data = await request.file();
      
      if (!data) {
        throw new ValidationError('No file provided');
      }

      // Validate file size
      if (data.file.bytesRead > securityConfig.maxFileSize) {
        throw new ValidationError(`File too large. Maximum size: ${securityConfig.maxFileSize} bytes`);
      }

      // Validate MIME type
      const allowedTypes = securityConfig.allowedMimeTypes;
      const isAllowed = allowedTypes.some(type => {
        if (type.endsWith('*')) {
          return data.mimetype.startsWith(type.slice(0, -1));
        }
        return data.mimetype === type;
      });

      if (!isAllowed) {
        throw new ValidationError(`File type not allowed: ${data.mimetype}`);
      }

      // Read file buffer
      const buffer = await data.file.toBuffer();
      
      // Parse additional fields
      const fields = data.fields as any;
      const options = {
        courseId: fields.courseId?.value,
        permissions: fields.permissions ? JSON.parse(fields.permissions.value) : undefined,
        isTemporary: fields.isTemporary ? JSON.parse(fields.isTemporary.value) : false,
        expiresIn: fields.expiresIn ? parseInt(fields.expiresIn.value) : undefined
      };

      // Upload file
      const fileMetadata = await fileService.uploadFile(
        buffer,
        data.filename,
        data.mimetype,
        auth.userId,
        options
      );

      reply.status(201).send({
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

    } catch (error) {
      FileServiceLogger.logFileUploadError('unknown', auth.userId, 'unknown', error as Error);
      throw error;
    }
  });

  // Multiple file upload
  fastify.post('/upload/batch', {
    preHandler: [requireAuth],
    schema: {
      consumes: ['multipart/form-data'],
      response: {
        201: BatchUploadResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = getAuthContext(request);
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const files = request.files();
      const uploadedFiles = [];
      
      for await (const data of files) {
        try {
          // Validate file
          if (data.file.bytesRead > securityConfig.maxFileSize) {
            uploadedFiles.push({
              originalName: data.filename,
              error: 'File too large'
            });
            continue;
          }

          const buffer = await data.file.toBuffer();
          
          // Parse fields for this file
          const fields = data.fields as any;
          const options = {
            courseId: fields.courseId?.value,
            permissions: fields.permissions ? JSON.parse(fields.permissions.value) : undefined
          };

          const fileMetadata = await fileService.uploadFile(
            buffer,
            data.filename,
            data.mimetype,
            auth.userId,
            options
          );

          uploadedFiles.push({
            id: fileMetadata.id,
            originalName: fileMetadata.originalName,
            url: `/api/v1/files/${fileMetadata.id}/download`,
            publicUrl: fileMetadata.publicUrl,
            mimeType: fileMetadata.mimeType,
            size: fileMetadata.size,
            status: fileMetadata.status,
            uploadedAt: fileMetadata.createdAt.toISOString()
          });

        } catch (error) {
          uploadedFiles.push({
            originalName: data.filename,
            error: (error as Error).message
          });
        }
      }

      reply.status(201).send({
        files: uploadedFiles,
        batchId
      });

    } catch (error) {
      FileServiceLogger.logFileUploadError('batch', auth.userId, 'batch', error as Error);
      throw error;
    }
  });

  // Initialize chunked upload
  fastify.post('/upload/chunked/init', {
    preHandler: [requireAuth],
    schema: {
      body: ChunkedUploadInitSchema,
      response: {
        201: ChunkedUploadInitResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const auth = getAuthContext(request);
    const { fileName, fileSize, mimeType, chunkSize, courseId } = request.body;

    // Validate file size
    if (fileSize > securityConfig.maxFileSize) {
      throw new ValidationError(`File too large. Maximum size: ${securityConfig.maxFileSize} bytes`);
    }

    // Calculate total chunks
    const totalChunks = Math.ceil(fileSize / chunkSize);
    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    // Store chunked upload metadata in database
    await fastify.pg.query(`
      INSERT INTO chunked_uploads (id, file_name, file_size, mime_type, chunk_size, total_chunks, uploaded_by, course_id, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [uploadId, fileName, fileSize, mimeType, chunkSize, totalChunks, auth.userId, courseId, expiresAt]);

    reply.status(201).send({
      uploadId,
      chunkSize,
      totalChunks,
      expiresAt: expiresAt.toISOString()
    });
  });

  // Upload chunk
  fastify.put('/upload/chunked/:uploadId/chunks/:chunkNumber', {
    preHandler: [requireAuth],
    schema: {
      params: Type.Object({
        uploadId: Type.String(),
        chunkNumber: Type.Number()
      }),
      response: {
        200: ChunkUploadResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: any }>, reply: FastifyReply) => {
    const auth = getAuthContext(request);
    const { uploadId, chunkNumber } = request.params;

    // Get chunked upload metadata
    const uploadResult = await fastify.pg.query(
      'SELECT * FROM chunked_uploads WHERE id = $1 AND uploaded_by = $2',
      [uploadId, auth.userId]
    );

    if (uploadResult.rows.length === 0) {
      throw new ValidationError('Upload session not found');
    }

    const upload = uploadResult.rows[0];

    // Check if upload has expired
    if (new Date() > new Date(upload.expires_at)) {
      throw new ValidationError('Upload session expired');
    }

    // Read chunk data
    const chunkBuffer = await request.body as Buffer;
    
    // Calculate checksum
    const crypto = require('crypto');
    const checksum = crypto.createHash('sha256').update(chunkBuffer).digest('hex');

    // Store chunk temporarily (in production, you might use Redis or file system)
    const chunkPath = `/tmp/${uploadId}_chunk_${chunkNumber}`;
    await require('fs/promises').writeFile(chunkPath, chunkBuffer);

    // Update uploaded chunks list
    const uploadedChunks = JSON.parse(upload.uploaded_chunks || '[]');
    if (!uploadedChunks.includes(chunkNumber)) {
      uploadedChunks.push(chunkNumber);
    }

    await fastify.pg.query(
      'UPDATE chunked_uploads SET uploaded_chunks = $1 WHERE id = $2',
      [JSON.stringify(uploadedChunks), uploadId]
    );

    reply.send({
      chunkNumber,
      uploaded: true,
      checksum
    });
  });

  // Complete chunked upload
  fastify.post('/upload/chunked/:uploadId/complete', {
    preHandler: [requireAuth],
    schema: {
      params: Type.Object({
        uploadId: Type.String()
      }),
      body: CompleteChunkedUploadSchema,
      response: {
        201: FileResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: any; Body: any }>, reply: FastifyReply) => {
    const auth = getAuthContext(request);
    const { uploadId } = request.params;
    const { chunks } = request.body;

    // Get chunked upload metadata
    const uploadResult = await fastify.pg.query(
      'SELECT * FROM chunked_uploads WHERE id = $1 AND uploaded_by = $2',
      [uploadId, auth.userId]
    );

    if (uploadResult.rows.length === 0) {
      throw new ValidationError('Upload session not found');
    }

    const upload = uploadResult.rows[0];

    // Verify all chunks are uploaded
    const uploadedChunks = JSON.parse(upload.uploaded_chunks || '[]');
    const expectedChunks = Array.from({ length: upload.total_chunks }, (_, i) => i + 1);
    
    const missingChunks = expectedChunks.filter(chunk => !uploadedChunks.includes(chunk));
    if (missingChunks.length > 0) {
      throw new ValidationError(`Missing chunks: ${missingChunks.join(', ')}`);
    }

    try {
      // Combine chunks into final file
      const fs = require('fs/promises');
      const finalBuffer = Buffer.alloc(upload.file_size);
      let offset = 0;

      for (let i = 1; i <= upload.total_chunks; i++) {
        const chunkPath = `/tmp/${uploadId}_chunk_${i}`;
        const chunkBuffer = await fs.readFile(chunkPath);
        chunkBuffer.copy(finalBuffer, offset);
        offset += chunkBuffer.length;
        
        // Clean up chunk file
        await fs.unlink(chunkPath).catch(() => {});
      }

      // Upload final file
      const fileMetadata = await fileService.uploadFile(
        finalBuffer,
        upload.file_name,
        upload.mime_type,
        auth.userId,
        {
          courseId: upload.course_id
        }
      );

      // Clean up chunked upload record
      await fastify.pg.query('DELETE FROM chunked_uploads WHERE id = $1', [uploadId]);

      reply.status(201).send({
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

    } catch (error) {
      // Clean up on error
      for (let i = 1; i <= upload.total_chunks; i++) {
        const chunkPath = `/tmp/${uploadId}_chunk_${i}`;
        await require('fs/promises').unlink(chunkPath).catch(() => {});
      }
      throw error;
    }
  });

  // Get upload progress
  fastify.get('/upload/chunked/:uploadId/progress', {
    preHandler: [requireAuth],
    schema: {
      params: Type.Object({
        uploadId: Type.String()
      }),
      response: {
        200: Type.Object({
          uploadId: Type.String(),
          totalChunks: Type.Number(),
          uploadedChunks: Type.Number(),
          progress: Type.Number(),
          status: Type.String(),
          expiresAt: Type.String()
        })
      }
    }
  }, async (request: FastifyRequest<{ Params: any }>, reply: FastifyReply) => {
    const auth = getAuthContext(request);
    const { uploadId } = request.params;

    const uploadResult = await fastify.pg.query(
      'SELECT * FROM chunked_uploads WHERE id = $1 AND uploaded_by = $2',
      [uploadId, auth.userId]
    );

    if (uploadResult.rows.length === 0) {
      throw new ValidationError('Upload session not found');
    }

    const upload = uploadResult.rows[0];
    const uploadedChunks = JSON.parse(upload.uploaded_chunks || '[]');
    const progress = Math.floor((uploadedChunks.length / upload.total_chunks) * 100);

    reply.send({
      uploadId,
      totalChunks: upload.total_chunks,
      uploadedChunks: uploadedChunks.length,
      progress,
      status: upload.status,
      expiresAt: upload.expires_at
    });
  });
}
