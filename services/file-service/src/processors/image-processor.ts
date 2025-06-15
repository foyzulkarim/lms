import sharp from 'sharp';
import { 
  ImageVariant, 
  ProcessingError,
  ProcessingJobType 
} from '@/types';
import { getProcessingConfig } from '@/config/env';
import { getStorageProvider } from '@/storage/storage-factory';
import { FileServiceLogger, PerformanceTimer } from '@/utils/logger';

export interface ImageProcessingOptions {
  generateVariants?: boolean;
  variants?: string[];
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  preserveMetadata?: boolean;
}

export interface ImageProcessingResult {
  variants: ImageVariant[];
  originalMetadata?: any;
}

export class ImageProcessor {
  private storageProvider = getStorageProvider();
  private config = getProcessingConfig();

  async processImage(
    fileId: string, 
    inputBuffer: Buffer, 
    options: ImageProcessingOptions = {}
  ): Promise<ImageProcessingResult> {
    const timer = new PerformanceTimer('image_processing');
    FileServiceLogger.logFileProcessingStart(fileId, ProcessingJobType.IMAGE_OPTIMIZATION);

    try {
      const result: ImageProcessingResult = {
        variants: []
      };

      // Get original image metadata
      const metadata = await sharp(inputBuffer).metadata();
      result.originalMetadata = metadata;

      // Generate image variants
      if (options.generateVariants !== false) {
        result.variants = await this.generateImageVariants(fileId, inputBuffer, options);
      }

      const duration = timer.end({ fileId, variants: result.variants.length });
      FileServiceLogger.logFileProcessingComplete(fileId, ProcessingJobType.IMAGE_OPTIMIZATION, duration);

      return result;
    } catch (error) {
      timer.end({ fileId, error: (error as Error).message });
      FileServiceLogger.logFileProcessingError(fileId, ProcessingJobType.IMAGE_OPTIMIZATION, error as Error);
      throw new ProcessingError(`Image processing failed: ${(error as Error).message}`, error);
    }
  }

  private async generateImageVariants(
    fileId: string, 
    inputBuffer: Buffer, 
    options: ImageProcessingOptions
  ): Promise<ImageVariant[]> {
    const variants: ImageVariant[] = [];
    const targetSizes = options.variants || ['thumbnail', 'small', 'medium', 'large'];
    const quality = options.quality || this.config.imageQuality;
    const format = options.format || 'jpeg';

    for (const size of targetSizes) {
      try {
        const variant = await this.generateImageVariant(
          fileId, 
          inputBuffer, 
          size, 
          quality, 
          format,
          options.preserveMetadata
        );
        variants.push(variant);
      } catch (error) {
        FileServiceLogger.logFileProcessingError(
          fileId, 
          `image_variant_${size}`, 
          error as Error
        );
        // Continue with other sizes even if one fails
      }
    }

    return variants;
  }

  private async generateImageVariant(
    fileId: string,
    inputBuffer: Buffer,
    size: string,
    quality: number,
    format: 'jpeg' | 'png' | 'webp',
    preserveMetadata?: boolean
  ): Promise<ImageVariant> {
    const dimensions = this.getSizeDimensions(size);
    const variantPath = `processed/${fileId}/images/${size}.${format}`;

    let processor = sharp(inputBuffer)
      .resize(dimensions.width, dimensions.height, { 
        fit: 'inside',
        withoutEnlargement: true
      });

    // Apply format-specific optimizations
    switch (format) {
      case 'jpeg':
        processor = processor.jpeg({ 
          quality,
          progressive: true,
          mozjpeg: true
        });
        break;
      case 'png':
        processor = processor.png({ 
          quality,
          compressionLevel: 9,
          progressive: true
        });
        break;
      case 'webp':
        processor = processor.webp({ 
          quality,
          effort: 6
        });
        break;
    }

    // Remove metadata unless explicitly preserved
    if (!preserveMetadata) {
      processor = processor.withMetadata(false);
    }

    try {
      const processedBuffer = await processor.toBuffer({ resolveWithObject: true });
      
      // Upload processed image to storage
      const uploadResult = await this.storageProvider.upload(
        processedBuffer.data, 
        variantPath,
        {
          contentType: `image/${format}`,
          cacheControl: 'public, max-age=31536000' // 1 year
        }
      );

      return {
        size: size as any,
        width: processedBuffer.info.width,
        height: processedBuffer.info.height,
        path: variantPath,
        format,
        fileSize: processedBuffer.info.size
      };
    } catch (error) {
      throw new ProcessingError(`Failed to generate image variant ${size}: ${(error as Error).message}`, error);
    }
  }

  private getSizeDimensions(size: string): { width: number; height: number } {
    const dimensions = {
      thumbnail: { width: 150, height: 150 },
      small: { width: 300, height: 300 },
      medium: { width: 600, height: 600 },
      large: { width: 1200, height: 1200 },
      xlarge: { width: 1920, height: 1920 }
    };

    return dimensions[size as keyof typeof dimensions] || dimensions.medium;
  }

  // Utility methods
  async optimizeImage(
    inputBuffer: Buffer, 
    options: {
      quality?: number;
      format?: 'jpeg' | 'png' | 'webp';
      maxWidth?: number;
      maxHeight?: number;
    } = {}
  ): Promise<Buffer> {
    let processor = sharp(inputBuffer);

    // Resize if dimensions specified
    if (options.maxWidth || options.maxHeight) {
      processor = processor.resize(options.maxWidth, options.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    // Apply format and quality
    const format = options.format || 'jpeg';
    const quality = options.quality || 85;

    switch (format) {
      case 'jpeg':
        processor = processor.jpeg({ quality, progressive: true });
        break;
      case 'png':
        processor = processor.png({ quality, compressionLevel: 9 });
        break;
      case 'webp':
        processor = processor.webp({ quality });
        break;
    }

    return processor.toBuffer();
  }

  async generateThumbnail(
    inputBuffer: Buffer, 
    size: number = 150,
    format: 'jpeg' | 'png' | 'webp' = 'jpeg'
  ): Promise<Buffer> {
    return sharp(inputBuffer)
      .resize(size, size, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();
  }

  async getImageMetadata(inputBuffer: Buffer): Promise<sharp.Metadata> {
    return sharp(inputBuffer).metadata();
  }

  async convertFormat(
    inputBuffer: Buffer, 
    targetFormat: 'jpeg' | 'png' | 'webp',
    quality: number = 85
  ): Promise<Buffer> {
    let processor = sharp(inputBuffer);

    switch (targetFormat) {
      case 'jpeg':
        processor = processor.jpeg({ quality, progressive: true });
        break;
      case 'png':
        processor = processor.png({ quality, compressionLevel: 9 });
        break;
      case 'webp':
        processor = processor.webp({ quality });
        break;
    }

    return processor.toBuffer();
  }

  async cropImage(
    inputBuffer: Buffer,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<Buffer> {
    return sharp(inputBuffer)
      .extract({ left: x, top: y, width, height })
      .toBuffer();
  }

  async rotateImage(inputBuffer: Buffer, angle: number): Promise<Buffer> {
    return sharp(inputBuffer)
      .rotate(angle)
      .toBuffer();
  }

  async addWatermark(
    inputBuffer: Buffer,
    watermarkBuffer: Buffer,
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' = 'bottom-right',
    opacity: number = 0.5
  ): Promise<Buffer> {
    const image = sharp(inputBuffer);
    const { width, height } = await image.metadata();
    
    if (!width || !height) {
      throw new ProcessingError('Unable to get image dimensions');
    }

    const watermark = sharp(watermarkBuffer)
      .resize(Math.floor(width * 0.2)) // 20% of image width
      .composite([{
        input: Buffer.from([255, 255, 255, Math.floor(255 * opacity)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'multiply'
      }]);

    const watermarkBuffer2 = await watermark.toBuffer();
    const { width: wmWidth, height: wmHeight } = await sharp(watermarkBuffer2).metadata();

    if (!wmWidth || !wmHeight) {
      throw new ProcessingError('Unable to get watermark dimensions');
    }

    let left = 0;
    let top = 0;

    switch (position) {
      case 'top-left':
        left = 10;
        top = 10;
        break;
      case 'top-right':
        left = width - wmWidth - 10;
        top = 10;
        break;
      case 'bottom-left':
        left = 10;
        top = height - wmHeight - 10;
        break;
      case 'bottom-right':
        left = width - wmWidth - 10;
        top = height - wmHeight - 10;
        break;
      case 'center':
        left = Math.floor((width - wmWidth) / 2);
        top = Math.floor((height - wmHeight) / 2);
        break;
    }

    return image
      .composite([{
        input: watermarkBuffer2,
        left,
        top
      }])
      .toBuffer();
  }

  // Batch processing
  async processImageBatch(
    files: Array<{ fileId: string; buffer: Buffer }>,
    options: ImageProcessingOptions = {}
  ): Promise<Array<{ fileId: string; result: ImageProcessingResult; error?: Error }>> {
    const results = [];

    for (const file of files) {
      try {
        const result = await this.processImage(file.fileId, file.buffer, options);
        results.push({ fileId: file.fileId, result });
      } catch (error) {
        results.push({ fileId: file.fileId, result: { variants: [] }, error: error as Error });
      }
    }

    return results;
  }
}
