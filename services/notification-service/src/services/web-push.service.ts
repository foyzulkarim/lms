import webpush from 'web-push';
import { config, webPushConfig } from '@/config/env';
import { logger } from '@/utils/logger';
import { 
  PushSubscription, 
  WebPushPayload, 
  PushDeliveryData,
  DeliveryError 
} from '@/types';

export class WebPushService {
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    try {
      // Set VAPID details
      webpush.setVapidDetails(
        webPushConfig.vapidDetails.subject,
        webPushConfig.vapidDetails.publicKey,
        webPushConfig.vapidDetails.privateKey
      );

      this.isInitialized = true;
      logger.info('Web Push service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Web Push service', error);
      throw new Error('Web Push service initialization failed');
    }
  }

  /**
   * Send push notification to a single subscription
   */
  async sendNotification(
    subscription: PushSubscription,
    payload: WebPushPayload,
    options?: {
      TTL?: number;
      urgency?: 'very-low' | 'low' | 'normal' | 'high';
      topic?: string;
    }
  ): Promise<{ success: boolean; response?: any; error?: string }> {
    if (!this.isInitialized) {
      throw new Error('Web Push service not initialized');
    }

    try {
      logger.debug('Sending push notification', {
        endpoint: this.maskEndpoint(subscription.endpoint),
        title: payload.title,
        urgency: options?.urgency || 'normal'
      });

      const pushOptions = {
        TTL: options?.TTL || payload.ttl || webPushConfig.defaultOptions.TTL,
        urgency: options?.urgency || 'normal',
        topic: options?.topic,
        vapidDetails: webPushConfig.vapidDetails
      };

      const response = await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: subscription.keys
        },
        JSON.stringify(this.preparePayload(payload)),
        pushOptions
      );

      logger.info('Push notification sent successfully', {
        endpoint: this.maskEndpoint(subscription.endpoint),
        statusCode: response.statusCode,
        title: payload.title
      });

      return {
        success: true,
        response: {
          statusCode: response.statusCode,
          headers: response.headers,
          body: response.body
        }
      };
    } catch (error: any) {
      logger.error('Failed to send push notification', {
        endpoint: this.maskEndpoint(subscription.endpoint),
        error: error.message,
        statusCode: error.statusCode,
        body: error.body
      });

      return {
        success: false,
        error: this.handlePushError(error)
      };
    }
  }

  /**
   * Send push notifications to multiple subscriptions
   */
  async sendBulkNotifications(
    subscriptions: PushSubscription[],
    payload: WebPushPayload,
    options?: {
      TTL?: number;
      urgency?: 'very-low' | 'low' | 'normal' | 'high';
      topic?: string;
      batchSize?: number;
      delayMs?: number;
    }
  ): Promise<{
    successful: number;
    failed: number;
    results: Array<{ subscription: PushSubscription; success: boolean; error?: string }>;
  }> {
    const batchSize = options?.batchSize || 100;
    const delayMs = options?.delayMs || 100;
    const results: Array<{ subscription: PushSubscription; success: boolean; error?: string }> = [];

    logger.info('Sending bulk push notifications', {
      totalSubscriptions: subscriptions.length,
      batchSize,
      title: payload.title
    });

    // Process in batches to avoid overwhelming the service
    for (let i = 0; i < subscriptions.length; i += batchSize) {
      const batch = subscriptions.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (subscription) => {
        const result = await this.sendNotification(subscription, payload, options);
        return {
          subscription,
          success: result.success,
          error: result.error
        };
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            subscription: batch[results.length % batch.length],
            success: false,
            error: result.reason?.message || 'Unknown error'
          });
        }
      });

      // Add delay between batches
      if (i + batchSize < subscriptions.length && delayMs > 0) {
        await this.delay(delayMs);
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    logger.info('Bulk push notifications completed', {
      total: subscriptions.length,
      successful,
      failed,
      successRate: (successful / subscriptions.length * 100).toFixed(2) + '%'
    });

    return { successful, failed, results };
  }

  /**
   * Validate push subscription
   */
  async validateSubscription(subscription: PushSubscription): Promise<boolean> {
    try {
      // Send a test notification with minimal payload
      const testPayload: WebPushPayload = {
        title: 'Test',
        body: 'Subscription validation',
        silent: true,
        tag: 'validation-test'
      };

      const result = await this.sendNotification(subscription, testPayload, {
        TTL: 60, // 1 minute
        urgency: 'very-low'
      });

      return result.success;
    } catch (error) {
      logger.debug('Subscription validation failed', {
        endpoint: this.maskEndpoint(subscription.endpoint),
        error
      });
      return false;
    }
  }

  /**
   * Generate VAPID public key (for client-side subscription)
   */
  getVapidPublicKey(): string {
    return webPushConfig.vapidDetails.publicKey;
  }

  /**
   * Create subscription object from client data
   */
  createSubscription(subscriptionData: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  }): PushSubscription {
    return {
      id: this.generateSubscriptionId(subscriptionData.endpoint),
      endpoint: subscriptionData.endpoint,
      keys: subscriptionData.keys,
      isActive: true,
      subscribedAt: new Date()
    };
  }

  /**
   * Check if subscription is expired or invalid
   */
  isSubscriptionExpired(error: any): boolean {
    if (!error.statusCode) return false;
    
    // Common status codes for expired/invalid subscriptions
    const expiredStatusCodes = [410, 404, 400];
    return expiredStatusCodes.includes(error.statusCode);
  }

  /**
   * Get push service from endpoint
   */
  getPushService(endpoint: string): string {
    if (endpoint.includes('fcm.googleapis.com')) return 'FCM';
    if (endpoint.includes('push.services.mozilla.com')) return 'Mozilla';
    if (endpoint.includes('wns.windows.com')) return 'WNS';
    if (endpoint.includes('push.apple.com')) return 'APNS';
    return 'Unknown';
  }

  /**
   * Prepare payload for sending
   */
  private preparePayload(payload: WebPushPayload): WebPushPayload {
    const preparedPayload: WebPushPayload = {
      title: payload.title,
      body: payload.body,
      icon: payload.icon || webPushConfig.defaultOptions.icon,
      badge: payload.badge || webPushConfig.defaultOptions.badge,
      timestamp: payload.timestamp || Date.now()
    };

    // Add optional fields
    if (payload.image) preparedPayload.image = payload.image;
    if (payload.actions?.length) preparedPayload.actions = payload.actions;
    if (payload.data) preparedPayload.data = payload.data;
    if (payload.requireInteraction !== undefined) preparedPayload.requireInteraction = payload.requireInteraction;
    if (payload.silent !== undefined) preparedPayload.silent = payload.silent;
    if (payload.tag) preparedPayload.tag = payload.tag;
    if (payload.vibrate?.length) preparedPayload.vibrate = payload.vibrate;

    return preparedPayload;
  }

  /**
   * Handle push notification errors
   */
  private handlePushError(error: any): string {
    if (error.statusCode === 410) {
      return 'Subscription expired or invalid';
    } else if (error.statusCode === 413) {
      return 'Payload too large';
    } else if (error.statusCode === 429) {
      return 'Rate limit exceeded';
    } else if (error.statusCode === 400) {
      return 'Invalid subscription or payload';
    } else if (error.statusCode === 404) {
      return 'Subscription not found';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return 'Push service unavailable';
    } else {
      return error.message || 'Unknown push notification error';
    }
  }

  /**
   * Mask endpoint for logging (privacy)
   */
  private maskEndpoint(endpoint: string): string {
    try {
      const url = new URL(endpoint);
      const pathParts = url.pathname.split('/');
      if (pathParts.length > 2) {
        pathParts[pathParts.length - 1] = '***';
        url.pathname = pathParts.join('/');
      }
      return url.toString();
    } catch {
      return endpoint.substring(0, 50) + '***';
    }
  }

  /**
   * Generate unique subscription ID
   */
  private generateSubscriptionId(endpoint: string): string {
    // Create a hash of the endpoint for consistent ID generation
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(endpoint).digest('hex').substring(0, 16);
  }

  /**
   * Delay utility for batch processing
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      initialized: boolean;
      vapidConfigured: boolean;
      lastError?: string;
    };
  }> {
    const details = {
      initialized: this.isInitialized,
      vapidConfigured: !!(webPushConfig.vapidDetails.publicKey && webPushConfig.vapidDetails.privateKey)
    };

    const status = details.initialized && details.vapidConfigured ? 'healthy' : 'unhealthy';

    return { status, details };
  }

  /**
   * Test push notification functionality
   */
  async testPushService(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      if (!this.isInitialized) {
        return {
          success: false,
          message: 'Web Push service not initialized'
        };
      }

      // Validate VAPID configuration
      if (!webPushConfig.vapidDetails.publicKey || !webPushConfig.vapidDetails.privateKey) {
        return {
          success: false,
          message: 'VAPID keys not configured'
        };
      }

      return {
        success: true,
        message: 'Web Push service is ready',
        details: {
          vapidSubject: webPushConfig.vapidDetails.subject,
          publicKey: webPushConfig.vapidDetails.publicKey.substring(0, 20) + '...',
          defaultTTL: webPushConfig.defaultOptions.TTL
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Web Push service test failed',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }
}

// Singleton instance
export const webPushService = new WebPushService();
