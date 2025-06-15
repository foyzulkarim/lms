import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs/promises';
import { 
  VideoVariant, 
  HLSPlaylist, 
  HLSVariant, 
  ProcessingError,
  ProcessingJobType 
} from '@/types';
import { getProcessingConfig } from '@/config/env';
import { getStorageProvider } from '@/storage/storage-factory';
import { FileServiceLogger, PerformanceTimer } from '@/utils/logger';

export interface VideoProcessingOptions {
  generateThumbnail?: boolean;
  generateVariants?: boolean;
  generateHLS?: boolean;
  qualities?: string[];
  hlsSegmentDuration?: number;
}

export interface VideoProcessingResult {
  variants?: VideoVariant[];
  hlsPlaylist?: HLSPlaylist;
  thumbnailPath?: string;
  duration?: number;
  metadata?: any;
}

export class VideoProcessor {
  private storageProvider = getStorageProvider();
  private config = getProcessingConfig();

  async processVideo(
    fileId: string, 
    inputPath: string, 
    options: VideoProcessingOptions = {}
  ): Promise<VideoProcessingResult> {
    const timer = new PerformanceTimer('video_processing');
    FileServiceLogger.logFileProcessingStart(fileId, ProcessingJobType.VIDEO_TRANSCODING);

    try {
      const result: VideoProcessingResult = {};
      
      // Get video metadata first
      const metadata = await this.getVideoMetadata(inputPath);
      result.metadata = metadata;
      result.duration = metadata.duration;

      // Generate thumbnail if requested
      if (options.generateThumbnail !== false) {
        result.thumbnailPath = await this.generateThumbnail(fileId, inputPath);
      }

      // Generate video variants if requested
      if (options.generateVariants !== false) {
        result.variants = await this.generateVideoVariants(fileId, inputPath, options.qualities);
      }

      // Generate HLS playlist if requested
      if (options.generateHLS !== false) {
        result.hlsPlaylist = await this.generateHLSPlaylist(fileId, inputPath, options);
      }

      const duration = timer.end({ fileId, variants: result.variants?.length });
      FileServiceLogger.logFileProcessingComplete(fileId, ProcessingJobType.VIDEO_TRANSCODING, duration);

      return result;
    } catch (error) {
      timer.end({ fileId, error: (error as Error).message });
      FileServiceLogger.logFileProcessingError(fileId, ProcessingJobType.VIDEO_TRANSCODING, error as Error);
      throw new ProcessingError(`Video processing failed: ${(error as Error).message}`, error);
    }
  }

  private async getVideoMetadata(inputPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          reject(new ProcessingError(`Failed to get video metadata: ${err.message}`));
        } else {
          resolve(metadata);
        }
      });
    });
  }

  private async generateThumbnail(fileId: string, inputPath: string): Promise<string> {
    const thumbnailPath = `processed/${fileId}/thumbnail.jpg`;
    const tempThumbnailPath = `/tmp/${fileId}_thumbnail.jpg`;

    return new Promise(async (resolve, reject) => {
      ffmpeg(inputPath)
        .screenshots({
          timestamps: ['10%'],
          filename: path.basename(tempThumbnailPath),
          folder: path.dirname(tempThumbnailPath),
          size: '320x240'
        })
        .on('end', async () => {
          try {
            // Upload thumbnail to storage
            const thumbnailBuffer = await fs.readFile(tempThumbnailPath);
            await this.storageProvider.upload(thumbnailBuffer, thumbnailPath, {
              contentType: 'image/jpeg',
              cacheControl: 'public, max-age=31536000'
            });

            // Clean up temp file
            await fs.unlink(tempThumbnailPath).catch(() => {});
            
            resolve(thumbnailPath);
          } catch (error) {
            reject(new ProcessingError(`Failed to upload thumbnail: ${(error as Error).message}`));
          }
        })
        .on('error', (err) => {
          reject(new ProcessingError(`Failed to generate thumbnail: ${err.message}`));
        });
    });
  }

  private async generateVideoVariants(
    fileId: string, 
    inputPath: string, 
    qualities?: string[]
  ): Promise<VideoVariant[]> {
    const targetQualities = qualities || this.config.videoPresets;
    const variants: VideoVariant[] = [];

    for (const quality of targetQualities) {
      try {
        const variant = await this.generateVideoVariant(fileId, inputPath, quality);
        variants.push(variant);
      } catch (error) {
        FileServiceLogger.logFileProcessingError(
          fileId, 
          `video_variant_${quality}`, 
          error as Error
        );
        // Continue with other qualities even if one fails
      }
    }

    return variants;
  }

  private async generateVideoVariant(
    fileId: string, 
    inputPath: string, 
    quality: string
  ): Promise<VideoVariant> {
    const config = this.getQualityConfig(quality);
    const variantPath = `processed/${fileId}/variants/${quality}.mp4`;
    const tempVariantPath = `/tmp/${fileId}_${quality}.mp4`;

    return new Promise(async (resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .size(`${config.width}x${config.height}`)
        .videoBitrate(config.bitrate)
        .audioBitrate('128k')
        .format('mp4')
        .output(tempVariantPath)
        .on('end', async () => {
          try {
            // Upload variant to storage
            const variantBuffer = await fs.readFile(tempVariantPath);
            const uploadResult = await this.storageProvider.upload(variantBuffer, variantPath, {
              contentType: 'video/mp4',
              cacheControl: 'public, max-age=31536000'
            });

            // Clean up temp file
            await fs.unlink(tempVariantPath).catch(() => {});

            resolve({
              quality,
              width: config.width,
              height: config.height,
              path: variantPath,
              duration: 0, // Will be filled from metadata
              bitrate: config.bitrate,
              fileSize: uploadResult.size,
              codec: 'h264'
            });
          } catch (error) {
            reject(new ProcessingError(`Failed to upload video variant: ${(error as Error).message}`));
          }
        })
        .on('error', (err) => {
          reject(new ProcessingError(`Failed to generate video variant: ${err.message}`));
        })
        .run();
    });
  }

  private async generateHLSPlaylist(
    fileId: string, 
    inputPath: string, 
    options: VideoProcessingOptions
  ): Promise<HLSPlaylist> {
    const hlsDir = `processed/${fileId}/hls`;
    const tempHlsDir = `/tmp/${fileId}_hls`;
    const segmentDuration = options.hlsSegmentDuration || this.config.hls.segmentDuration;

    // Create temp directory
    await fs.mkdir(tempHlsDir, { recursive: true });

    const qualities = options.qualities || this.config.videoPresets;
    const variants: HLSVariant[] = [];

    try {
      // Generate HLS variants for each quality
      for (const quality of qualities) {
        const variant = await this.generateHLSVariant(
          fileId, 
          inputPath, 
          quality, 
          tempHlsDir, 
          segmentDuration
        );
        variants.push(variant);
      }

      // Generate master playlist
      const masterPlaylistContent = this.generateMasterPlaylist(variants);
      const masterPlaylistPath = `${hlsDir}/master.m3u8`;
      
      await this.storageProvider.upload(
        Buffer.from(masterPlaylistContent), 
        masterPlaylistPath,
        {
          contentType: 'application/vnd.apple.mpegurl',
          cacheControl: 'public, max-age=300' // 5 minutes for playlists
        }
      );

      // Upload all variant files to storage
      for (const variant of variants) {
        // Upload playlist file
        const playlistContent = await fs.readFile(
          path.join(tempHlsDir, `${variant.quality}.m3u8`), 
          'utf-8'
        );
        await this.storageProvider.upload(
          Buffer.from(playlistContent),
          variant.playlistPath,
          {
            contentType: 'application/vnd.apple.mpegurl',
            cacheControl: 'public, max-age=300'
          }
        );

        // Upload segment files
        for (const segmentPath of variant.segmentPaths) {
          const segmentBuffer = await fs.readFile(
            path.join(tempHlsDir, path.basename(segmentPath))
          );
          await this.storageProvider.upload(segmentBuffer, segmentPath, {
            contentType: 'video/MP2T',
            cacheControl: 'public, max-age=31536000' // 1 year for segments
          });
        }
      }

      // Clean up temp directory
      await fs.rmdir(tempHlsDir, { recursive: true }).catch(() => {});

      return {
        masterPlaylistPath,
        variants,
        segmentDuration,
        totalDuration: 0 // Will be filled from metadata
      };
    } catch (error) {
      // Clean up temp directory on error
      await fs.rmdir(tempHlsDir, { recursive: true }).catch(() => {});
      throw new ProcessingError(`HLS generation failed: ${(error as Error).message}`, error);
    }
  }

  private async generateHLSVariant(
    fileId: string,
    inputPath: string,
    quality: string,
    tempDir: string,
    segmentDuration: number
  ): Promise<HLSVariant> {
    const config = this.getQualityConfig(quality);
    const playlistName = `${quality}.m3u8`;
    const segmentPattern = `${quality}_%03d.ts`;

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .size(`${config.width}x${config.height}`)
        .videoBitrate(config.bitrate)
        .audioBitrate('128k')
        .format('hls')
        .outputOptions([
          `-hls_time ${segmentDuration}`,
          '-hls_list_size 0',
          '-hls_segment_filename', path.join(tempDir, segmentPattern)
        ])
        .output(path.join(tempDir, playlistName))
        .on('end', async () => {
          try {
            // Read the generated playlist to get segment information
            const playlistContent = await fs.readFile(
              path.join(tempDir, playlistName), 
              'utf-8'
            );
            
            const segmentPaths = this.extractSegmentPaths(
              playlistContent, 
              `processed/${fileId}/hls`,
              quality
            );

            resolve({
              quality,
              bandwidth: config.bitrate * 1000, // Convert to bits per second
              resolution: `${config.width}x${config.height}`,
              playlistPath: `processed/${fileId}/hls/${playlistName}`,
              segmentPaths
            });
          } catch (error) {
            reject(new ProcessingError(`Failed to process HLS variant: ${(error as Error).message}`));
          }
        })
        .on('error', (err) => {
          reject(new ProcessingError(`Failed to generate HLS variant: ${err.message}`));
        })
        .run();
    });
  }

  private generateMasterPlaylist(variants: HLSVariant[]): string {
    let content = '#EXTM3U\n#EXT-X-VERSION:3\n\n';
    
    for (const variant of variants) {
      content += `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=${variant.resolution}\n`;
      content += `${path.basename(variant.playlistPath)}\n\n`;
    }
    
    return content;
  }

  private extractSegmentPaths(playlistContent: string, basePath: string, quality: string): string[] {
    const lines = playlistContent.split('\n');
    const segmentPaths: string[] = [];
    
    for (const line of lines) {
      if (line.endsWith('.ts')) {
        segmentPaths.push(`${basePath}/${line}`);
      }
    }
    
    return segmentPaths;
  }

  private getQualityConfig(quality: string): { width: number; height: number; bitrate: number } {
    const configs = {
      '360p': { width: 640, height: 360, bitrate: 800 },
      '480p': { width: 854, height: 480, bitrate: 1200 },
      '720p': { width: 1280, height: 720, bitrate: 2500 },
      '1080p': { width: 1920, height: 1080, bitrate: 5000 },
    };
    
    return configs[quality as keyof typeof configs] || configs['720p'];
  }

  // Utility method to get video duration
  async getVideoDuration(inputPath: string): Promise<number> {
    const metadata = await this.getVideoMetadata(inputPath);
    return metadata.format?.duration || 0;
  }

  // Utility method to extract video frame as image
  async extractFrame(inputPath: string, timestamp: string = '10%'): Promise<Buffer> {
    const tempFramePath = `/tmp/frame_${Date.now()}.jpg`;
    
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .screenshots({
          timestamps: [timestamp],
          filename: path.basename(tempFramePath),
          folder: path.dirname(tempFramePath),
          size: '1280x720'
        })
        .on('end', async () => {
          try {
            const frameBuffer = await fs.readFile(tempFramePath);
            await fs.unlink(tempFramePath).catch(() => {});
            resolve(frameBuffer);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  }
}
