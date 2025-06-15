import { Worker, Job, Queue } from 'bullmq';
import { config, redisConfig } from '@/config/env';
import { logger } from '@/utils/logger';
import { 
  NotificationDelivery,
  DeliveryStatus,
  PushDeliveryData,
  WebPushPayload,
  NotificationRequest,
  NotificationTemplate,
  PushSubscription
} from '@/types';
import { deliveryRepository } from '@/repositories/delivery.repository';
import { notificationRepository } from '@/repositories/notification.repository';
import { templateRepository } from '@/repositories/template.repository';
import { userService } from '@/services/user.service';
import { preferencesService } from '@/services/preferences.service';
import { templateService } from '@/services/template.service';
import { webPushService } from '@/services/web-push.service';
import { eventPublisher } from '@/services/event-publisher.service';
import { analyticsService } from '@/services/analytics.service';

// Queue for push notification delivery
export const pushDeliveryQueue = new Queue('push-delivery', {
  connection: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3000
    }
  }
});

export class PushDeliveryWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      'push-delivery',
      this.processPushDelivery.bind(this),
      {
        connection: redisConfig,
        concurrency: config.QUEUE_CONCURRENCY,
        limiter: {
          max: 100,
          duration: 60000 // 100 push notifications per minute
        }
      }
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.worker.on('completed', (job: Job) => {
      logger.info('Push delivery completed', {
        jobId: job.id,
        deliveryId: job.data.deliveryId,
        processingTime: Date.now() - job.timestamp
      });
    });

    this.worker.on('failed', (job: Job | undefined, error: Error) => {
      logger.error('Push delivery failed', {
        jobId: job?.id,
        deliveryId: job?.data?.deliveryId,
        error: error.message,
        attempts: job?.attemptsMade
      });
    });

    this.worker.on('stalled', (jobId: string) => {
      logger.warn('Push delivery stalled', { jobId });
    });
  }

  /**
   * Process push notification delivery job
   */
  private async processPushDelivery(job: Job): Promise<void> {
    const { deliveryId, notificationId, userId, templateId } = job.data;
    
    try {
      logger.info('Processing push delivery', { 
        jobId: job.id, 
        deliveryId,
        userId
      });

      // Get delivery record
      const delivery = await deliveryRepository.findById(deliveryId);
      if (!delivery) {
        throw new Error(`Delivery not found: ${deliveryId}`);
      }

      // Check if already delivered
      if (delivery.status === DeliveryStatus.DELIVERED) {
        logger.info('Push notification already delivered, skipping', { deliveryId });
        return;
      }

      // Update delivery status to processing
      delivery.status = DeliveryStatus.PROCESSING;
      delivery.attempts += 1;
      delivery.updatedAt = new Date();
      await deliveryRepository.update(delivery);

      // Get notification and user data
      const [notification, user] = await Promise.all([
        notificationRepository.findById(notificationId),
        userService.getUser(userId)
      ]);

      if (!notification) {
        throw new Error(`Notification not found: ${notificationId}`);
      }

      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      // Get user's push subscriptions
      const preferences = await preferencesService.getUserPreferences(userId);
      const activeSubscriptions = preferences.pushSubscriptions.filter(sub => sub.isActive);

      if (activeSubscriptions.length === 0) {
        throw new Error('No active push subscriptions found for user');
      }

      // Get template if specified
      const template = templateId ? await templateRepository.findById(templateId) : null;

      // Prepare push payload
      const pushPayload = await this.preparePushPayload(notification, user, template);

      // Send to all active subscriptions
      const results = await this.sendToSubscriptions(activeSubscriptions, pushPayload);

      // Check if at least one delivery succeeded
      const successCount = results.filter(r => r.success).length;
      const failedSubscriptions = results.filter(r => !r.success);

      if (successCount > 0) {
        // Update delivery with success
        delivery.status = DeliveryStatus.DELIVERED;
        delivery.deliveredAt = new Date();
        delivery.pushData = {
          endpoint: activeSubscriptions[0].endpoint,
          vapidPublicKey: webPushService.getVapidPublicKey(),
          payload: pushPayload,
          ttl: pushPayload.ttl
        };
        delivery.updatedAt = new Date();

        await deliveryRepository.update(delivery);

        // Record analytics
        await analyticsService.recordDeliveryEvent({
          notificationId,
          deliveryId,
          userId,
          eventType: 'delivered',
          channel: 'web_push',
          metadata: {
            subscriptionsCount: activeSubscriptions.length,
            successCount,
            failedCount: failedSubscriptions.length
          }
        });

        // Publish delivery event
        await eventPublisher.publishNotificationDelivered(delivery);

        // Handle expired subscriptions
        await this.handleExpiredSubscriptions(userId, failedSubscriptions);

        logger.info('Push notification delivered successfully', {
          deliveryId,
          userId,
          subscriptionsCount: activeSubscriptions.length,
          successCount,
          failedCount: failedSubscriptions.length
        });
      } else {
        throw new Error('All push subscriptions failed');
      }

    } catch (error) {
      await this.handleDeliveryError(deliveryId, error as Error, job.attemptsMade || 0);
      throw error;
    }
  }

  /**
   * Prepare push notification payload
   */
  private async preparePushPayload(
    notification: NotificationRequest,
    user: any,
    template?: NotificationTemplate
  ): Promise<WebPushPayload> {
    try {
      // Prepare template data
      const templateData = {
        ...notification.templateData,
        userName: user.name || user.firstName + ' ' + user.lastName,
        userFirstName: user.firstName,
        userLastName: user.lastName,
        notificationId: notification.id,
        notificationType: notification.type,
        courseId: notification.courseId,
        sourceService: notification.sourceService
      };

      let pushPayload: WebPushPayload = {
        title: notification.title,
        body: notification.message,
        icon: config.DEFAULT_PUSH_ICON,
        badge: config.DEFAULT_PUSH_BADGE,
        timestamp: Date.now(),
        data: {
          notificationId: notification.id,
          type: notification.type,
          courseId: notification.courseId,
          sourceId: notification.sourceId,
          url: this.generateNotificationUrl(notification),
          userId: user.id
        },
        requireInteraction: notification.priority >= 3, // High and urgent priorities
        tag: `${notification.type}-${notification.id}`,
        ttl: config.PUSH_TTL
      };

      // Use template if available
      if (template?.pushTemplate) {
        const renderedTemplate = await templateService.renderPushTemplate(
          template.pushTemplate,
          templateData,
          template.id
        );

        pushPayload = {
          ...pushPayload,
          title: renderedTemplate.title,
          body: renderedTemplate.body,
          icon: renderedTemplate.icon || pushPayload.icon,
          badge: renderedTemplate.badge || pushPayload.badge,
          image: renderedTemplate.image,
          tag: renderedTemplate.tag || pushPayload.tag,
          requireInteraction: template.pushTemplate.requireInteraction ?? pushPayload.requireInteraction,
          silent: template.pushTemplate.silent,
          actions: template.pushTemplate.actions,
          ttl: template.pushTemplate.ttl || pushPayload.ttl,
          data: {
            ...pushPayload.data,
            ...(template.pushTemplate.data || {})
          }
        };
      }

      // Add default actions if not specified
      if (!pushPayload.actions?.length) {
        pushPayload.actions = this.getDefaultActions(notification);
      }

      return pushPayload;
    } catch (error) {
      logger.error('Failed to prepare push payload', {
        notificationId: notification.id,
        templateId: template?.id,
        error
      });
      throw error;
    }
  }

  /**
   * Send push notification to multiple subscriptions
   */
  private async sendToSubscriptions(
    subscriptions: PushSubscription[],
    payload: WebPushPayload
  ): Promise<Array<{ subscription: PushSubscription; success: boolean; error?: string }>> {
    const results = await webPushService.sendBulkNotifications(
      subscriptions,
      payload,
      {
        TTL: payload.ttl,
        urgency: this.getUrgencyFromPayload(payload),
        batchSize: 50,
        delayMs: 100
      }
    );

    return results.results;
  }

  /**
   * Handle expired or invalid subscriptions
   */
  private async handleExpiredSubscriptions(
    userId: string,
    failedResults: Array<{ subscription: PushSubscription; success: boolean; error?: string }>
  ): Promise<void> {
    const expiredSubscriptions = failedResults.filter(result => 
      result.error?.includes('expired') || 
      result.error?.includes('invalid') ||
      result.error?.includes('not found')
    );

    if (expiredSubscriptions.length > 0) {
      try {
        // Mark subscriptions as inactive
        await preferencesService.deactivatePushSubscriptions(
          userId,
          expiredSubscriptions.map(r => r.subscription.id)
        );

        logger.info('Deactivated expired push subscriptions', {
          userId,
          count: expiredSubscriptions.length
        });
      } catch (error) {
        logger.error('Failed to deactivate expired subscriptions', {
          userId,
          error
        });
      }
    }
  }

  /**
   * Generate notification URL for push action
   */
  private generateNotificationUrl(notification: NotificationRequest): string {
    const baseUrl = config.UNSUBSCRIBE_BASE_URL.replace('/unsubscribe', '');
    
    switch (notification.type) {
      case 'course_enrolled':
        return `${baseUrl}/courses/${notification.courseId}`;
      case 'assignment_due':
        return `${baseUrl}/courses/${notification.courseId}/assignments/${notification.sourceId}`;
      case 'discussion_reply':
        return `${baseUrl}/courses/${notification.courseId}/discussions/${notification.sourceId}`;
      case 'system_announcement':
        return `${baseUrl}/announcements/${notification.sourceId}`;
      default:
        return `${baseUrl}/notifications`;
    }
  }

  /**
   * Get default actions for push notification
   */
  private getDefaultActions(notification: NotificationRequest): Array<{ action: string; title: string; icon?: string }> {
    const actions = [];

    // View action for most notification types
    if (['course_enrolled', 'assignment_due', 'discussion_reply'].includes(notification.type)) {
      actions.push({
        action: 'view',
        title: 'View',
        icon: '/icons/view-icon.png'
      });
    }

    // Mark as read action
    actions.push({
      action: 'mark-read',
      title: 'Mark as Read',
      icon: '/icons/check-icon.png'
    });

    return actions;
  }

  /**
   * Get urgency level from payload
   */
  private getUrgencyFromPayload(payload: WebPushPayload): 'very-low' | 'low' | 'normal' | 'high' {
    if (payload.silent) return 'very-low';
    if (payload.requireInteraction) return 'high';
    return 'normal';
  }

  /**
   * Handle delivery error
   */
  private async handleDeliveryError(
    deliveryId: string,
    error: Error,
    attemptsMade: number
  ): Promise<void> {
    try {
      const delivery = await deliveryRepository.findById(deliveryId);
      if (!delivery) return;

      delivery.status = DeliveryStatus.FAILED;
      delivery.errorMessage = error.message;
      delivery.updatedAt = new Date();

      // Calculate next retry time if attempts remaining
      if (attemptsMade < delivery.maxAttempts) {
        const retryDelay = Math.min(
          config.RETRY_DELAY_MS * Math.pow(2, attemptsMade - 1),
          30 * 60 * 1000 // Max 30 minutes for push notifications
        );
        delivery.nextRetryAt = new Date(Date.now() + retryDelay);
        delivery.status = DeliveryStatus.PENDING;
        
        logger.info('Push delivery will be retried', {
          deliveryId,
          attemptsMade,
          nextRetryAt: delivery.nextRetryAt,
          retryDelay
        });
      } else {
        logger.error('Push delivery failed permanently', {
          deliveryId,
          attemptsMade,
          maxAttempts: delivery.maxAttempts,
          error: error.message
        });

        // Record failed delivery analytics
        await analyticsService.recordDeliveryEvent({
          notificationId: delivery.notificationId,
          deliveryId,
          userId: delivery.userId,
          eventType: 'failed',
          channel: 'web_push',
          metadata: {
            error: error.message,
            attempts: attemptsMade
          }
        });

        // Publish failure event
        await eventPublisher.publishNotificationFailed(delivery, error.message);
      }

      await deliveryRepository.update(delivery);
    } catch (updateError) {
      logger.error('Failed to update delivery error status', {
        deliveryId,
        error: updateError
      });
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    return {
      waiting: await pushDeliveryQueue.getWaiting().then(jobs => jobs.length),
      active: await pushDeliveryQueue.getActive().then(jobs => jobs.length),
      completed: await pushDeliveryQueue.getCompleted().then(jobs => jobs.length),
      failed: await pushDeliveryQueue.getFailed().then(jobs => jobs.length),
      delayed: await pushDeliveryQueue.getDelayed().then(jobs => jobs.length)
    };
  }

  /**
   * Retry failed deliveries
   */
  async retryFailedDeliveries(): Promise<number> {
    try {
      const failedDeliveries = await deliveryRepository.findFailedRetryable();
      let retryCount = 0;

      for (const delivery of failedDeliveries) {
        if (delivery.nextRetryAt && delivery.nextRetryAt <= new Date()) {
          await pushDeliveryQueue.add(
            'deliver-push',
            {
              deliveryId: delivery.id,
              notificationId: delivery.notificationId,
              userId: delivery.userId
            },
            { priority: 25 } // Lower priority for retries
          );
          retryCount++;
        }
      }

      if (retryCount > 0) {
        logger.info('Queued failed push deliveries for retry', { count: retryCount });
      }

      return retryCount;
    } catch (error) {
      logger.error('Failed to retry failed deliveries', error);
      return 0;
    }
  }

  /**
   * Clean up old jobs
   */
  async cleanup(): Promise<void> {
    try {
      await pushDeliveryQueue.clean(24 * 60 * 60 * 1000, 100, 'completed'); // 24 hours
      await pushDeliveryQueue.clean(7 * 24 * 60 * 60 * 1000, 50, 'failed'); // 7 days
      logger.info('Push delivery queue cleanup completed');
    } catch (error) {
      logger.error('Push delivery queue cleanup failed', error);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down push delivery worker...');
    await this.worker.close();
    await pushDeliveryQueue.close();
    logger.info('Push delivery worker shutdown complete');
  }
}

// Singleton instance
export const pushDeliveryWorker = new PushDeliveryWorker();
