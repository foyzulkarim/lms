import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { config } from '@/config/env';
import { logger } from '@/utils/logger';
import { 
  EmailDispatcherRequest, 
  EmailDispatcherResponse, 
  EmailAttachment,
  DeliveryError 
} from '@/types';

export class EmailDispatcherService {
  private client: AxiosInstance;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor() {
    this.baseUrl = config.EMAIL_DISPATCHER_URL;
    this.apiKey = config.EMAIL_DISPATCHER_API_KEY;
    this.timeout = config.EMAIL_DISPATCHER_TIMEOUT;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'User-Agent': 'LMS-Notification-Service/2.0.0'
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('EMAIL-Dispatcher request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          headers: { ...config.headers, Authorization: '[REDACTED]' }
        });
        return config;
      },
      (error) => {
        logger.error('EMAIL-Dispatcher request error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('EMAIL-Dispatcher response', {
          status: response.status,
          statusText: response.statusText,
          data: response.data
        });
        return response;
      },
      (error) => {
        logger.error('EMAIL-Dispatcher response error', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message
        });
        return Promise.reject(this.handleError(error));
      }
    );
  }

  private handleError(error: any): DeliveryError {
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      return new DeliveryError(
        `EMAIL-Dispatcher API error: ${data?.message || error.message}`,
        {
          status,
          response: data,
          service: 'email-dispatcher'
        }
      );
    } else if (error.request) {
      // Request was made but no response received
      return new DeliveryError(
        'EMAIL-Dispatcher service unavailable',
        {
          timeout: this.timeout,
          service: 'email-dispatcher'
        }
      );
    } else {
      // Something else happened
      return new DeliveryError(
        `EMAIL-Dispatcher error: ${error.message}`,
        { service: 'email-dispatcher' }
      );
    }
  }

  /**
   * Send a single email via EMAIL-Dispatcher
   */
  async sendEmail(request: EmailDispatcherRequest): Promise<EmailDispatcherResponse> {
    try {
      logger.info('Sending email via EMAIL-Dispatcher', {
        to: Array.isArray(request.to) ? request.to.length : 1,
        subject: request.subject,
        hasAttachments: !!request.attachments?.length,
        trackOpens: request.trackOpens,
        trackClicks: request.trackClicks
      });

      const payload = this.prepareEmailPayload(request);
      const response: AxiosResponse<EmailDispatcherResponse> = await this.client.post('/api/v1/email/send', payload);

      logger.info('Email sent successfully via EMAIL-Dispatcher', {
        messageId: response.data.messageId,
        jobId: response.data.jobId,
        status: response.data.status
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to send email via EMAIL-Dispatcher', error);
      throw error;
    }
  }

  /**
   * Send bulk emails via EMAIL-Dispatcher
   */
  async sendBulkEmails(requests: EmailDispatcherRequest[]): Promise<EmailDispatcherResponse[]> {
    try {
      logger.info('Sending bulk emails via EMAIL-Dispatcher', {
        count: requests.length
      });

      const payload = {
        emails: requests.map(req => this.prepareEmailPayload(req)),
        batchSize: config.BATCH_SIZE,
        throttleMs: config.BULK_THROTTLE_MS
      };

      const response: AxiosResponse<{ results: EmailDispatcherResponse[] }> = 
        await this.client.post('/api/v1/email/send/bulk', payload);

      logger.info('Bulk emails sent successfully via EMAIL-Dispatcher', {
        count: response.data.results.length,
        successful: response.data.results.filter(r => r.status === 'queued' || r.status === 'sent').length
      });

      return response.data.results;
    } catch (error) {
      logger.error('Failed to send bulk emails via EMAIL-Dispatcher', error);
      throw error;
    }
  }

  /**
   * Get email delivery status from EMAIL-Dispatcher
   */
  async getDeliveryStatus(messageId: string): Promise<EmailDispatcherResponse> {
    try {
      const response: AxiosResponse<EmailDispatcherResponse> = 
        await this.client.get(`/api/v1/email/status/${messageId}`);

      return response.data;
    } catch (error) {
      logger.error('Failed to get delivery status from EMAIL-Dispatcher', { messageId, error });
      throw error;
    }
  }

  /**
   * Get delivery statistics from EMAIL-Dispatcher
   */
  async getDeliveryStats(params: {
    from?: Date;
    to?: Date;
    tags?: string[];
  }): Promise<any> {
    try {
      const queryParams = new URLSearchParams();
      
      if (params.from) queryParams.append('from', params.from.toISOString());
      if (params.to) queryParams.append('to', params.to.toISOString());
      if (params.tags) params.tags.forEach(tag => queryParams.append('tags', tag));

      const response: AxiosResponse<any> = 
        await this.client.get(`/api/v1/email/stats?${queryParams.toString()}`);

      return response.data;
    } catch (error) {
      logger.error('Failed to get delivery stats from EMAIL-Dispatcher', error);
      throw error;
    }
  }

  /**
   * Validate email addresses via EMAIL-Dispatcher
   */
  async validateEmails(emails: string[]): Promise<{ valid: string[]; invalid: string[] }> {
    try {
      const response: AxiosResponse<{ valid: string[]; invalid: string[] }> = 
        await this.client.post('/api/v1/email/validate', { emails });

      return response.data;
    } catch (error) {
      logger.error('Failed to validate emails via EMAIL-Dispatcher', error);
      throw error;
    }
  }

  /**
   * Create unsubscribe link via EMAIL-Dispatcher
   */
  async createUnsubscribeLink(params: {
    email: string;
    userId: string;
    type?: string;
    metadata?: Record<string, any>;
  }): Promise<string> {
    try {
      const response: AxiosResponse<{ unsubscribeUrl: string }> = 
        await this.client.post('/api/v1/email/unsubscribe/create', params);

      return response.data.unsubscribeUrl;
    } catch (error) {
      logger.error('Failed to create unsubscribe link via EMAIL-Dispatcher', error);
      throw error;
    }
  }

  /**
   * Health check for EMAIL-Dispatcher service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response: AxiosResponse<{ status: string }> = 
        await this.client.get('/health');

      return response.data.status === 'healthy';
    } catch (error) {
      logger.warn('EMAIL-Dispatcher health check failed', error);
      return false;
    }
  }

  /**
   * Prepare email payload for EMAIL-Dispatcher API
   */
  private prepareEmailPayload(request: EmailDispatcherRequest): any {
    const payload: any = {
      to: request.to,
      subject: request.subject,
      fromName: request.fromName || config.DEFAULT_FROM_NAME,
      fromEmail: request.fromEmail || config.DEFAULT_FROM_EMAIL
    };

    // Add optional fields
    if (request.htmlBody) payload.htmlBody = request.htmlBody;
    if (request.textBody) payload.textBody = request.textBody;
    if (request.replyTo) payload.replyTo = request.replyTo;
    if (request.attachments?.length) payload.attachments = this.prepareAttachments(request.attachments);
    if (request.metadata) payload.metadata = request.metadata;
    if (request.tags?.length) payload.tags = request.tags;

    // Tracking options
    payload.trackOpens = request.trackOpens ?? config.ENABLE_OPEN_TRACKING;
    payload.trackClicks = request.trackClicks ?? config.ENABLE_CLICK_TRACKING;

    return payload;
  }

  /**
   * Prepare attachments for EMAIL-Dispatcher API
   */
  private prepareAttachments(attachments: EmailAttachment[]): any[] {
    return attachments.map(attachment => ({
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType,
      disposition: attachment.disposition || 'attachment',
      contentId: attachment.contentId
    }));
  }

  /**
   * Test EMAIL-Dispatcher connection and authentication
   */
  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      // Try to get service info
      const response = await this.client.get('/api/v1/info');
      
      return {
        success: true,
        message: 'EMAIL-Dispatcher connection successful',
        details: {
          service: response.data?.service || 'EMAIL-Dispatcher',
          version: response.data?.version,
          status: response.data?.status
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'EMAIL-Dispatcher connection failed',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          baseUrl: this.baseUrl,
          timeout: this.timeout
        }
      };
    }
  }

  /**
   * Get EMAIL-Dispatcher service metrics
   */
  async getServiceMetrics(): Promise<any> {
    try {
      const response: AxiosResponse<any> = await this.client.get('/api/v1/metrics');
      return response.data;
    } catch (error) {
      logger.error('Failed to get EMAIL-Dispatcher metrics', error);
      throw error;
    }
  }

  /**
   * Create email template in EMAIL-Dispatcher (if supported)
   */
  async createTemplate(template: {
    name: string;
    subject: string;
    htmlBody: string;
    textBody: string;
    variables?: string[];
  }): Promise<{ templateId: string }> {
    try {
      const response: AxiosResponse<{ templateId: string }> = 
        await this.client.post('/api/v1/templates', template);

      return response.data;
    } catch (error) {
      logger.error('Failed to create template in EMAIL-Dispatcher', error);
      throw error;
    }
  }

  /**
   * Send templated email via EMAIL-Dispatcher
   */
  async sendTemplatedEmail(params: {
    templateId: string;
    to: string | string[];
    variables: Record<string, any>;
    metadata?: Record<string, any>;
  }): Promise<EmailDispatcherResponse> {
    try {
      const response: AxiosResponse<EmailDispatcherResponse> = 
        await this.client.post('/api/v1/email/send/template', params);

      return response.data;
    } catch (error) {
      logger.error('Failed to send templated email via EMAIL-Dispatcher', error);
      throw error;
    }
  }
}

// Singleton instance
export const emailDispatcherService = new EmailDispatcherService();
