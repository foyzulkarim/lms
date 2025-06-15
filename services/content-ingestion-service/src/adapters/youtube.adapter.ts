import axios, { AxiosInstance } from 'axios';
import youtubedl from 'youtube-dl-exec';
import { v4 as uuidv4 } from 'uuid';
import { config } from '@/config/environment';
import { contentLogger } from '@/utils/logger';
import { 
  ContentItem, 
  ContentSourceType, 
  ProcessingStatus, 
  YouTubeIngestionRequest,
  ExtractionError 
} from '@/types';

interface YouTubeVideoInfo {
  id: string;
  title: string;
  description: string;
  duration: number;
  viewCount: number;
  publishedAt: string;
  channelTitle: string;
  tags: string[];
  thumbnails: any;
  captions?: any[];
}

export class YouTubeAdapter {
  private apiClient: AxiosInstance;
  private apiKey: string;

  constructor() {
    this.apiKey = config.YOUTUBE_API_KEY || '';
    
    this.apiClient = axios.create({
      baseURL: 'https://www.googleapis.com/youtube/v3',
      timeout: 30000,
      params: {
        key: this.apiKey,
      },
    });

    // Request interceptor for logging
    this.apiClient.interceptors.request.use(
      (config) => {
        contentLogger.externalServiceCall('youtube-api', `${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        contentLogger.externalServiceError('youtube-api', 'request', error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Ingest YouTube video content
   */
  async ingestVideo(request: YouTubeIngestionRequest): Promise<ContentItem> {
    const startTime = Date.now();
    
    try {
      contentLogger.info('Starting YouTube video ingestion', {
        videoId: request.videoId,
        extractTranscript: request.extractTranscript,
        extractMetadata: request.extractMetadata,
      });

      // Get video metadata
      const videoInfo = await this.getVideoInfo(request.videoId);
      
      // Extract transcript if requested
      let transcript = '';
      if (request.extractTranscript !== false) {
        transcript = await this.extractTranscript(request.videoId, request.language);
      }

      // Create content item
      const contentItem: ContentItem = {
        id: uuidv4(),
        sourceId: request.videoId,
        sourceType: ContentSourceType.YOUTUBE,
        sourceMetadata: {
          url: `https://youtube.com/watch?v=${request.videoId}`,
          duration: videoInfo.duration,
          viewCount: videoInfo.viewCount,
          publishedAt: videoInfo.publishedAt,
          channelTitle: videoInfo.channelTitle,
          thumbnails: videoInfo.thumbnails,
        },
        title: videoInfo.title,
        description: videoInfo.description,
        content: transcript,
        contentType: 'text/plain',
        language: request.language || 'en',
        processingStatus: ProcessingStatus.EXTRACTING,
        tags: [...(videoInfo.tags || []), ...(request.tags || [])],
        categories: request.categories || [],
        courseId: request.courseId,
        moduleId: request.moduleId,
        version: 1,
        isLatest: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const duration = Date.now() - startTime;
      contentLogger.info('YouTube video ingestion completed', {
        videoId: request.videoId,
        contentLength: transcript.length,
        duration,
      });

      return contentItem;
    } catch (error) {
      const duration = Date.now() - startTime;
      contentLogger.error('YouTube video ingestion failed', error as Error, {
        videoId: request.videoId,
        duration,
      });

      throw new ExtractionError(
        `Failed to ingest YouTube video: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { videoId: request.videoId }
      );
    }
  }

  /**
   * Get video information from YouTube API
   */
  private async getVideoInfo(videoId: string): Promise<YouTubeVideoInfo> {
    try {
      const response = await this.apiClient.get('/videos', {
        params: {
          part: 'snippet,statistics,contentDetails',
          id: videoId,
        },
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error('Video not found');
      }

      const video = response.data.items[0];
      const snippet = video.snippet;
      const statistics = video.statistics;
      const contentDetails = video.contentDetails;

      return {
        id: videoId,
        title: snippet.title,
        description: snippet.description || '',
        duration: this.parseDuration(contentDetails.duration),
        viewCount: parseInt(statistics.viewCount || '0', 10),
        publishedAt: snippet.publishedAt,
        channelTitle: snippet.channelTitle,
        tags: snippet.tags || [],
        thumbnails: snippet.thumbnails,
      };
    } catch (error: any) {
      if (error.response?.status === 403) {
        throw new ExtractionError('YouTube API quota exceeded or invalid API key');
      } else if (error.response?.status === 404) {
        throw new ExtractionError('YouTube video not found');
      }
      
      throw new ExtractionError(`Failed to get video info: ${error.message}`);
    }
  }

  /**
   * Extract transcript from YouTube video
   */
  private async extractTranscript(videoId: string, language: string = 'en'): Promise<string> {
    try {
      // First try to get auto-generated captions
      const transcript = await this.getAutoCaptions(videoId, language);
      if (transcript) {
        return transcript;
      }

      // If no captions available, try to download audio and transcribe
      if (config.ENABLE_SPEECH_TO_TEXT) {
        return await this.downloadAndTranscribe(videoId);
      }

      contentLogger.warn('No transcript available and speech-to-text disabled', {
        videoId,
        language,
      });
      
      return '';
    } catch (error) {
      contentLogger.error('Failed to extract transcript', error as Error, {
        videoId,
        language,
      });
      
      // Don't throw error for transcript extraction failure
      // Return empty string and let the process continue
      return '';
    }
  }

  /**
   * Get auto-generated captions from YouTube
   */
  private async getAutoCaptions(videoId: string, language: string): Promise<string> {
    try {
      const response = await this.apiClient.get('/captions', {
        params: {
          part: 'snippet',
          videoId: videoId,
        },
      });

      const captions = response.data.items || [];
      
      // Find captions in the requested language
      let targetCaption = captions.find((caption: any) => 
        caption.snippet.language === language
      );

      // Fallback to English if requested language not available
      if (!targetCaption && language !== 'en') {
        targetCaption = captions.find((caption: any) => 
          caption.snippet.language === 'en'
        );
      }

      // Fallback to any available caption
      if (!targetCaption && captions.length > 0) {
        targetCaption = captions[0];
      }

      if (!targetCaption) {
        return '';
      }

      // Download caption content
      const captionResponse = await this.apiClient.get(`/captions/${targetCaption.id}`, {
        params: {
          tfmt: 'srt', // SubRip format
        },
      });

      // Parse SRT format to plain text
      return this.parseSRTToText(captionResponse.data);
    } catch (error) {
      contentLogger.warn('Failed to get auto captions', {
        videoId,
        language,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return '';
    }
  }

  /**
   * Download audio and transcribe using external service
   */
  private async downloadAndTranscribe(videoId: string): Promise<string> {
    try {
      // Use youtube-dl to get audio URL
      const info = await youtubedl(
        `https://youtube.com/watch?v=${videoId}`,
        {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          preferFreeFormats: true,
          addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
        }
      );

      // Find best audio format
      const audioFormat = info.formats?.find((format: any) => 
        format.acodec !== 'none' && format.vcodec === 'none'
      ) || info.formats?.[0];

      if (!audioFormat?.url) {
        throw new Error('No audio format available');
      }

      // TODO: Implement audio transcription using Whisper or similar service
      // This would require integration with a speech-to-text service
      contentLogger.info('Audio transcription not implemented yet', {
        videoId,
        audioUrl: audioFormat.url,
      });

      return '';
    } catch (error) {
      contentLogger.error('Failed to download and transcribe audio', error as Error, {
        videoId,
      });
      return '';
    }
  }

  /**
   * Parse SRT subtitle format to plain text
   */
  private parseSRTToText(srtContent: string): string {
    const lines = srtContent.split('\n');
    const textLines: string[] = [];
    
    let isTextLine = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (!trimmedLine) {
        isTextLine = false;
        continue;
      }
      
      // Skip sequence numbers
      if (/^\d+$/.test(trimmedLine)) {
        continue;
      }
      
      // Skip timestamp lines
      if (/^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}$/.test(trimmedLine)) {
        isTextLine = true;
        continue;
      }
      
      // Collect text lines
      if (isTextLine) {
        // Remove HTML tags and clean up text
        const cleanText = trimmedLine
          .replace(/<[^>]*>/g, '') // Remove HTML tags
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .trim();
        
        if (cleanText) {
          textLines.push(cleanText);
        }
      }
    }
    
    return textLines.join(' ').trim();
  }

  /**
   * Parse YouTube duration format (PT4M13S) to seconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Validate YouTube video ID
   */
  isValidVideoId(videoId: string): boolean {
    const youtubeRegex = /^[a-zA-Z0-9_-]{11}$/;
    return youtubeRegex.test(videoId);
  }

  /**
   * Extract video ID from YouTube URL
   */
  extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && this.isValidVideoId(match[1])) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Check if YouTube API is available
   */
  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) {
      contentLogger.warn('YouTube API key not configured');
      return false;
    }

    try {
      // Test with a simple API call
      await this.apiClient.get('/search', {
        params: {
          part: 'snippet',
          q: 'test',
          maxResults: 1,
          type: 'video',
        },
      });
      
      return true;
    } catch (error) {
      contentLogger.error('YouTube API health check failed', error as Error);
      return false;
    }
  }

  /**
   * Get adapter statistics
   */
  getStats(): any {
    return {
      apiKeyConfigured: !!this.apiKey,
      baseURL: this.apiClient.defaults.baseURL,
      timeout: this.apiClient.defaults.timeout,
    };
  }
}

// Export singleton instance
export const youTubeAdapter = new YouTubeAdapter();
