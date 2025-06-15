import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import tesseract from 'node-tesseract-ocr';
import mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import { marked } from 'marked';
import { config, processingConfig } from '@/config/environment';
import { contentLogger } from '@/utils/logger';
import { 
  ExtractionResult, 
  ExtractionMethod, 
  ChunkMetadata, 
  ExtractionError,
  FileServiceFile 
} from '@/types';

export class TextExtractor {
  constructor() {
    // Configure PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = require('pdfjs-dist/legacy/build/pdf.worker.entry');
  }

  /**
   * Extract text from file based on MIME type and method
   */
  async extractFromFile(
    file: FileServiceFile, 
    method: ExtractionMethod = ExtractionMethod.AUTO
  ): Promise<ExtractionResult> {
    if (!file.buffer) {
      throw new ExtractionError('File buffer is required for extraction');
    }

    const startTime = Date.now();
    contentLogger.extractionStarted(file.id, method, file.mimeType);

    try {
      let result: ExtractionResult;

      // Determine extraction method if auto
      if (method === ExtractionMethod.AUTO) {
        method = this.determineExtractionMethod(file.mimeType);
      }

      // Extract based on method and file type
      switch (method) {
        case ExtractionMethod.PDF_JS:
          result = await this.extractFromPDF(file);
          break;
        case ExtractionMethod.OCR:
          result = await this.extractFromImage(file);
          break;
        case ExtractionMethod.HTML_PARSER:
          result = await this.extractFromHTML(file);
          break;
        case ExtractionMethod.MARKDOWN_PARSER:
          result = await this.extractFromMarkdown(file);
          break;
        case ExtractionMethod.PLAIN_TEXT:
          result = await this.extractPlainText(file);
          break;
        default:
          result = await this.extractByMimeType(file);
      }

      const duration = Date.now() - startTime;
      contentLogger.extractionCompleted(file.id, method, duration, result.confidence);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      contentLogger.extractionFailed(file.id, method, error as Error);
      
      throw new ExtractionError(
        `Failed to extract text from file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { fileId: file.id, method, mimeType: file.mimeType, duration }
      );
    }
  }

  /**
   * Extract text from PDF using PDF.js
   */
  private async extractFromPDF(file: FileServiceFile): Promise<ExtractionResult> {
    try {
      const pdf = await pdfjsLib.getDocument({
        data: file.buffer,
        verbosity: 0, // Suppress warnings
      }).promise;

      let content = '';
      const metadata: ChunkMetadata[] = [];
      let totalConfidence = 0;

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ')
          .trim();

        if (pageText) {
          content += pageText + '\n\n';
          
          metadata.push({
            page: pageNum,
            section: `Page ${pageNum}`,
            confidence: 1.0, // PDF.js extraction is highly reliable
          });
          
          totalConfidence += 1.0;
        }
      }

      // Clean up the content
      content = this.cleanText(content);

      return {
        content,
        title: file.originalName.replace(/\.[^/.]+$/, ''), // Remove extension
        metadata,
        extractionMethod: ExtractionMethod.PDF_JS,
        confidence: metadata.length > 0 ? totalConfidence / metadata.length : 0,
        contentType: 'text/plain',
        language: 'en', // TODO: Add language detection
      };
    } catch (error) {
      throw new ExtractionError(`PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from image using OCR (Tesseract)
   */
  private async extractFromImage(file: FileServiceFile): Promise<ExtractionResult> {
    if (!processingConfig.extraction.enableOCR) {
      throw new ExtractionError('OCR is disabled in configuration');
    }

    try {
      const ocrOptions = {
        lang: processingConfig.extraction.tesseractLang,
        oem: 1, // LSTM OCR Engine Mode
        psm: 3, // Fully automatic page segmentation
      };

      const text = await tesseract.recognize(file.buffer!, ocrOptions);
      const cleanedText = this.cleanText(text);
      
      // Calculate confidence based on text quality
      const confidence = this.calculateOCRConfidence(cleanedText);

      if (confidence < processingConfig.extraction.confidenceThreshold) {
        contentLogger.warn('OCR confidence below threshold', {
          fileId: file.id,
          confidence,
          threshold: processingConfig.extraction.confidenceThreshold,
        });
      }

      return {
        content: cleanedText,
        title: file.originalName.replace(/\.[^/.]+$/, ''),
        metadata: [{
          confidence,
          section: 'OCR Result',
        }],
        extractionMethod: ExtractionMethod.OCR,
        confidence,
        contentType: 'text/plain',
        language: processingConfig.extraction.tesseractLang,
      };
    } catch (error) {
      throw new ExtractionError(`OCR extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from HTML
   */
  private async extractFromHTML(file: FileServiceFile): Promise<ExtractionResult> {
    try {
      const html = file.buffer!.toString('utf-8');
      const $ = cheerio.load(html);

      // Remove script and style elements
      $('script, style, nav, footer, aside, .advertisement').remove();

      // Extract title
      const title = $('title').text() || $('h1').first().text() || file.originalName;

      // Extract description
      const description = $('meta[name="description"]').attr('content') || 
                         $('meta[property="og:description"]').attr('content');

      // Extract main content
      let content = '';
      const contentSelectors = [
        'main',
        'article',
        '.content',
        '#content',
        '.post-content',
        '.entry-content',
        'body'
      ];

      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
          content = element.text();
          break;
        }
      }

      // Fallback to body if no content found
      if (!content) {
        content = $('body').text();
      }

      content = this.cleanText(content);

      // Extract keywords
      const keywords = $('meta[name="keywords"]').attr('content')?.split(',').map(k => k.trim()) || [];

      return {
        content,
        title: title.trim(),
        description: description?.trim(),
        metadata: [{
          section: 'HTML Document',
          keywords,
          confidence: 0.9,
        }],
        extractionMethod: ExtractionMethod.HTML_PARSER,
        confidence: 0.9,
        contentType: 'text/html',
        language: $('html').attr('lang') || 'en',
      };
    } catch (error) {
      throw new ExtractionError(`HTML extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from Markdown
   */
  private async extractFromMarkdown(file: FileServiceFile): Promise<ExtractionResult> {
    try {
      const markdown = file.buffer!.toString('utf-8');
      
      // Convert markdown to HTML first
      const html = marked(markdown);
      
      // Then extract text from HTML
      const $ = cheerio.load(html);
      const content = this.cleanText($.text());
      
      // Extract title from first heading
      const title = $(html).find('h1').first().text() || 
                   file.originalName.replace(/\.[^/.]+$/, '');

      return {
        content,
        title: title.trim(),
        metadata: [{
          section: 'Markdown Document',
          confidence: 1.0,
        }],
        extractionMethod: ExtractionMethod.MARKDOWN_PARSER,
        confidence: 1.0,
        contentType: 'text/markdown',
        language: 'en',
      };
    } catch (error) {
      throw new ExtractionError(`Markdown extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract plain text
   */
  private async extractPlainText(file: FileServiceFile): Promise<ExtractionResult> {
    try {
      const content = this.cleanText(file.buffer!.toString('utf-8'));
      
      return {
        content,
        title: file.originalName.replace(/\.[^/.]+$/, ''),
        metadata: [{
          section: 'Plain Text',
          confidence: 1.0,
        }],
        extractionMethod: ExtractionMethod.PLAIN_TEXT,
        confidence: 1.0,
        contentType: 'text/plain',
        language: 'en',
      };
    } catch (error) {
      throw new ExtractionError(`Plain text extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract from Word document
   */
  private async extractFromWord(file: FileServiceFile): Promise<ExtractionResult> {
    try {
      const result = await mammoth.extractRawText({ buffer: file.buffer! });
      const content = this.cleanText(result.value);
      
      return {
        content,
        title: file.originalName.replace(/\.[^/.]+$/, ''),
        metadata: [{
          section: 'Word Document',
          confidence: 0.95,
        }],
        extractionMethod: ExtractionMethod.PLAIN_TEXT,
        confidence: 0.95,
        contentType: 'text/plain',
        language: 'en',
      };
    } catch (error) {
      throw new ExtractionError(`Word document extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract based on MIME type
   */
  private async extractByMimeType(file: FileServiceFile): Promise<ExtractionResult> {
    switch (file.mimeType) {
      case 'application/pdf':
        return this.extractFromPDF(file);
      
      case 'text/html':
        return this.extractFromHTML(file);
      
      case 'text/markdown':
        return this.extractFromMarkdown(file);
      
      case 'application/msword':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return this.extractFromWord(file);
      
      default:
        if (file.mimeType.startsWith('image/')) {
          return this.extractFromImage(file);
        } else if (file.mimeType.startsWith('text/')) {
          return this.extractPlainText(file);
        } else {
          throw new ExtractionError(`Unsupported file type: ${file.mimeType}`);
        }
    }
  }

  /**
   * Determine extraction method based on MIME type
   */
  private determineExtractionMethod(mimeType: string): ExtractionMethod {
    switch (mimeType) {
      case 'application/pdf':
        return ExtractionMethod.PDF_JS;
      case 'text/html':
        return ExtractionMethod.HTML_PARSER;
      case 'text/markdown':
        return ExtractionMethod.MARKDOWN_PARSER;
      default:
        if (mimeType.startsWith('image/')) {
          return ExtractionMethod.OCR;
        } else if (mimeType.startsWith('text/')) {
          return ExtractionMethod.PLAIN_TEXT;
        } else {
          return ExtractionMethod.PLAIN_TEXT;
        }
    }
  }

  /**
   * Clean extracted text
   */
  private cleanText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove excessive line breaks
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      // Remove leading/trailing whitespace
      .trim()
      // Remove control characters
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Normalize quotes
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'");
  }

  /**
   * Calculate OCR confidence based on text quality
   */
  private calculateOCRConfidence(text: string): number {
    if (!text || text.length < 10) {
      return 0.1;
    }

    let score = 0.5; // Base score

    // Check for common OCR issues
    const specialCharRatio = (text.match(/[^a-zA-Z0-9\s.,!?;:'"()-]/g) || []).length / text.length;
    if (specialCharRatio < 0.1) score += 0.2;

    // Check for reasonable word length
    const words = text.split(/\s+/);
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    if (avgWordLength > 2 && avgWordLength < 15) score += 0.2;

    // Check for sentence structure
    const sentences = text.split(/[.!?]+/);
    if (sentences.length > 1) score += 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * Get supported file types
   */
  getSupportedFileTypes(): string[] {
    return [
      'application/pdf',
      'text/plain',
      'text/html',
      'text/markdown',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/tiff',
      'image/bmp',
    ];
  }

  /**
   * Check if file type is supported
   */
  isSupported(mimeType: string): boolean {
    return this.getSupportedFileTypes().includes(mimeType) ||
           mimeType.startsWith('text/') ||
           mimeType.startsWith('image/');
  }
}

// Export singleton instance
export const textExtractor = new TextExtractor();
