import { Worker, Job, Queue } from 'bullmq';
import { config, redisConfig } from '@/config/env';
import { logger } from '@/utils/logger';
import { 
  NotificationRequest, 
  NotificationRecipient, 
  NotificationDelivery,
  NotificationChannel,
  DeliveryStatus,
  NotificationPriority,
  UserNotificationPreferences
} from '@/types';
import { notificationRepository } from '@/repositories/notification.repository';
import { deliveryRepository } from '@/repositories/delivery.repository';
import { templateRepository } from '@/repositories/template.repository';
import { preferencesService } from '@/services/preferences.service';
import { emailDeliveryQueue } from './email-delivery-worker';
import { pushDeliveryQueue } from './push-delivery-worker';
import { v4 as uuidv4 } from 'uuid';

// Queue for notification processing
export const notificationQueue = new Queue('notification-processing', {
  connection: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
});

export class NotificationProcessor {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      'notification-processing',
      this.processNotification.bind(this),
      {
        connection: redisConfig,
        concurrency: config.QUEUE_CONCURRENCY,
        limiter: {
          max: 100,
          duration: 60000 // 100 jobs per minute
        }
      }
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.worker.on('completed', (job: Job) => {
      logger.info('Notification processing completed', {
        jobId: job.id,
        notificationId: job.data.notificationId,
        processingTime: Date.now() - job.timestamp
      });
    });

    this.worker.on('failed', (job: Job | undefined, error: Error) => {
      logger.error('Notification processing failed', {
        jobId: job?.id,
        notificationId: job?.data?.notificationId,
        error: error.message,
        attempts: job?.attemptsMade
      });
    });

    this.worker.on('stalled', (jobId: string) => {
      logger.warn('Notification processing stalled', { jobId });
    });
  }

  /**
   * Add notification to processing queue
   */
  async queueNotification(
    notification: NotificationRequest,
    priority: NotificationPriority = NotificationPriority.NORMAL
  ): Promise<void> {
    try {
      const jobOptions = {
        priority: this.getPriorityValue(priority),
        delay: notification.scheduleAt ? 
          Math.max(0, notification.scheduleAt.getTime() - Date.now()) : 0
      };

      await notificationQueue.add(
        'process-notification',
        {
          notificationId: notification.id,
          type: notification.type,
          priority: notification.priority
        },
        jobOptions
      );

      logger.info('Notification queued for processing', {
        notificationId: notification.id,
        type: notification.type,
        priority: notification.priority,
        scheduledAt: notification.scheduleAt
      });
    } catch (error) {
      logger.error('Failed to queue notification', {
        notificationId: notification.id,
        error
      });
      throw error;
    }
  }

  /**
   * Process notification job
   */
  private async processNotification(job: Job): Promise<void> {
    const { notificationId } = job.data;
    
    try {
      logger.info('Processing notification', { 
        jobId: job.id, 
        notificationId 
      });

      // Get notification from database
      const notification = await notificationRepository.findById(notificationId);
      if (!notification) {
        throw new Error(`Notification not found: ${notificationId}`);
      }

      // Check if notification is expired
      if (notification.expiresAt && notification.expiresAt < new Date()) {
        logger.warn('Notification expired, skipping processing', {
          notificationId,
          expiresAt: notification.expiresAt
        });
        return;
      }

      // Load template if specified
      const template = notification.templateId 
        ? await templateRepository.findById(notification.templateId)
        : null;

      // Process each recipient
      const deliveryPromises = notification.recipients.map(recipient =>
        this.processRecipient(notification, recipient, template)
      );

      await Promise.allSettled(deliveryPromises);

      logger.info('Notification processing completed', {
        notificationId,
        recipientCount: notification.recipients.length
      });

    } catch (error) {
      logger.error('Notification processing failed', {
        jobId: job.id,
        notificationId,
        error
      });
      throw error;
    }
  }

  /**
   * Process individual recipient
   */
  private async processRecipient(
    notification: NotificationRequest,
    recipient: NotificationRecipient,
    template: any
  ): Promise<void> {
    try {
      logger.debug('Processing recipient', {
        notificationId: notification.id,
        userId: recipient.userId,
        channels: notification.channels
      });

      // Get user preferences
      const preferences = await preferencesService.getUserPreferences(recipient.userId);
      
      // Filter channels based on preferences and quiet hours
      const enabledChannels = await this.filterChannelsByPreferences(
        notification.channels,
        notification.type,
        preferences
      );

      if (enabledChannels.length === 0) {
        logger.debug('No enabled channels for recipient', {
          notificationId: notification.id,
          userId: recipient.userId
        });
        return;
      }

      // Check quiet hours
      if (this.isQuietHours(preferences.quietHours) && notification.options?.respectQuietHours) {
        await this.scheduleForLater(notification, recipient, enabledChannels);
        return;
      }

      // Create delivery records for each enabled channel
      for (const channel of enabledChannels) {
        await this.createDelivery(notification, recipient, channel, template);
      }

    } catch (error) {
      logger.error('Failed to process recipient', {
        notificationId: notification.id,
        userId: recipient.userId,
        error
      });
      // Don't throw - continue processing other recipients
    }
  }

  /**
   * Filter channels based on user preferences
   */
  private async filterChannelsByPreferences(
    channels: NotificationChannel[],
    notificationType: string,
    preferences: UserNotificationPreferences
  ): Promise<NotificationChannel[]> {
    const enabledChannels: NotificationChannel[] = [];

    for (const channel of channels) {
      // Check global channel preference
      if (channel === NotificationChannel.EMAIL && !preferences.emailEnabled) {
        continue;
      }
      if (channel === NotificationChannel.WEB_PUSH && !preferences.pushEnabled) {
        continue;
      }

      // Check type-specific preferences
      const typePreference = preferences.typePreferences[notificationType as any];
      if (typePreference) {
        if (!typePreference.enabled || !typePreference.channels.includes(channel)) {
          continue;
        }
      }

      enabledChannels.push(channel);
    }

    return enabledChannels;
  }

  /**
   * Check if current time is within quiet hours
   */
  private isQuietHours(quietHours?: any): boolean {
    if (!quietHours?.enabled) return false;

    try {
      const now = new Date();
      const timezone = quietHours.timezone || 'UTC';
      
      // Convert current time to user's timezone
      const userTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
      const currentHour = userTime.getHours();
      const currentMinute = userTime.getMinutes();
      const currentTime = currentHour * 60 + currentMinute;

      // Parse quiet hours
      const [startHour, startMinute] = quietHours.startTime.split(':').map(Number);
      const [endHour, endMinute] = quietHours.endTime.split(':').map(Number);
      const startTime = startHour * 60 + startMinute;
      const endTime = endHour * 60 + endMinute;

      // Handle overnight quiet hours (e.g., 22:00 to 08:00)
      if (startTime > endTime) {
        return currentTime >= startTime || currentTime <= endTime;
      } else {
        return currentTime >= startTime && currentTime <= endTime;
      }
    } catch (error) {
      logger.warn('Failed to check quiet hours', { quietHours, error });
      return false;
    }
  }

  /**
   * Schedule notification for later (after quiet hours)
   */
  private async scheduleForLater(
    notification: NotificationRequest,
    recipient: NotificationRecipient,
    channels: NotificationChannel[]
  ): Promise<void> {
    try {
      // Calculate next delivery time (end of quiet hours)
      const preferences = await preferencesService.getUserPreferences(recipient.userId);
      const nextDeliveryTime = this.calculateNextDeliveryTime(preferences.quietHours);

      // Create scheduled deliveries
      for (const channel of channels) {
        const delivery: NotificationDelivery = {
          id: uuidv4(),
          notificationId: notification.id,
          userId: recipient.userId,
          channel,
          status: DeliveryStatus.PENDING,
          attempts: 0,
          maxAttempts: this.getMaxAttempts(notification.priority),
          nextRetryAt: nextDeliveryTime,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await deliveryRepository.create(delivery);
      }

      logger.info('Notification scheduled for after quiet hours', {
        notificationId: notification.id,
        userId: recipient.userId,
        nextDeliveryTime
      });
    } catch (error) {
      logger.error('Failed to schedule notification for later', {
        notificationId: notification.id,
        userId: recipient.userId,
        error
      });
    }
  }

  /**
   * Calculate next delivery time after quiet hours
   */
  private calculateNextDeliveryTime(quietHours: any): Date {
    if (!quietHours?.enabled) return new Date();

    try {
      const now = new Date();
      const timezone = quietHours.timezone || 'UTC';
      
      // Get end time of quiet hours
      const [endHour, endMinute] = quietHours.endTime.split(':').map(Number);
      
      // Create next delivery time
      const nextDelivery = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
      nextDelivery.setHours(endHour, endMinute, 0, 0);
      
      // If end time is today but already passed, schedule for tomorrow
      if (nextDelivery <= now) {
        nextDelivery.setDate(nextDelivery.getDate() + 1);
      }

      return nextDelivery;
    } catch (error) {
      logger.warn('Failed to calculate next delivery time', { quietHours, error });
      // Default to 1 hour from now
      return new Date(Date.now() + 60 * 60 * 1000);
    }
  }

  /**
   * Create delivery record and queue for channel-specific processing
   */
  private async createDelivery(
    notification: NotificationRequest,
    recipient: NotificationRecipient,
    channel: NotificationChannel,
    template: any
  ): Promise<void> {
    try {
      const delivery: NotificationDelivery = {
        id: uuidv4(),
        notificationId: notification.id,
        userId: recipient.userId,
        channel,
        status: DeliveryStatus.PENDING,
        attempts: 0,
        maxAttempts: this.getMaxAttempts(notification.priority),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save delivery record
      await deliveryRepository.create(delivery);

      // Queue for channel-specific delivery
      await this.queueDelivery(delivery, notification, recipient, template);

      logger.debug('Delivery created and queued', {
        deliveryId: delivery.id,
        notificationId: notification.id,
        userId: recipient.userId,
        channel
      });

    } catch (error) {
      logger.error('Failed to create delivery', {
        notificationId: notification.id,
        userId: recipient.userId,
        channel,
        error
      });
      throw error;
    }
  }

  /**
   * Queue delivery for channel-specific processing
   */
  private async queueDelivery(
    delivery: NotificationDelivery,
    notification: NotificationRequest,
    recipient: NotificationRecipient,
    template: any
  ): Promise<void> {
    const jobData = {
      deliveryId: delivery.id,
      notificationId: notification.id,
      userId: recipient.userId,
      templateId: template?.id
    };

    const jobOptions = {
      priority: this.getPriorityValue(notification.priority),
      delay: 0
    };

    switch (delivery.channel) {
      case NotificationChannel.EMAIL:
        await emailDeliveryQueue.add('deliver-email', jobData, jobOptions);
        break;
      case NotificationChannel.WEB_PUSH:
        await pushDeliveryQueue.add('deliver-push', jobData, jobOptions);
        break;
      default:
        logger.warn('Unknown delivery channel', { channel: delivery.channel });
    }
  }

  /**
   * Get max retry attempts based on priority
   */
  private getMaxAttempts(priority: NotificationPriority): number {
    switch (priority) {
      case NotificationPriority.URGENT:
        return 5;
      case NotificationPriority.HIGH:
        return 4;
      case NotificationPriority.NORMAL:
        return 3;
      case NotificationPriority.LOW:
        return 2;
      default:
        return config.MAX_RETRY_ATTEMPTS;
    }
  }

  /**
   * Convert priority enum to BullMQ priority value
   */
  private getPriorityValue(priority: NotificationPriority): number {
    // BullMQ uses higher numbers for higher priority
    switch (priority) {
      case NotificationPriority.URGENT:
        return 100;
      case NotificationPriority.HIGH:
        return 75;
      case NotificationPriority.NORMAL:
        return 50;
      case NotificationPriority.LOW:
        return 25;
      default:
        return 50;
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
      waiting: await notificationQueue.getWaiting().then(jobs => jobs.length),
      active: await notificationQueue.getActive().then(jobs => jobs.length),
      completed: await notificationQueue.getCompleted().then(jobs => jobs.length),
      failed: await notificationQueue.getFailed().then(jobs => jobs.length),
      delayed: await notificationQueue.getDelayed().then(jobs => jobs.length)
    };
  }

  /**
   * Clean up old jobs
   */
  async cleanup(): Promise<void> {
    try {
      await notificationQueue.clean(24 * 60 * 60 * 1000, 100, 'completed'); // 24 hours
      await notificationQueue.clean(7 * 24 * 60 * 60 * 1000, 50, 'failed'); // 7 days
      logger.info('Queue cleanup completed');
    } catch (error) {
      logger.error('Queue cleanup failed', error);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down notification processor...');
    await this.worker.close();
    await notificationQueue.close();
    logger.info('Notification processor shutdown complete');
  }
}

// Singleton instance
export const notificationProcessor = new NotificationProcessor();
