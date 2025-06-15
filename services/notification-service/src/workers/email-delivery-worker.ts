import { Worker, Job, Queue } from 'bullmq';
import { config, redisConfig } from '@/config/env';
import { logger } from '@/utils/logger';
import { 
  NotificationDelivery,
  DeliveryStatus,
  EmailDeliveryData,
  EmailDispatcherRequest,
  NotificationRequest,
  NotificationTemplate
} from '@/types';
import { deliveryRepository } from '@/repositories/delivery.repository';
import { notificationRepository } from '@/repositories/notification.repository';
import { templateRepository } from '@/repositories/template.repository';
import { userService } from '@/services/user.service';
import { templateService } from '@/services/template.service';
import { emailDispatcherService } from '@/services/email-dispatcher.service';
import { eventPublisher } from '@/services/event-publisher.service';
import { analyticsService } from '@/services/analytics.service';

// Queue for email delivery
export const emailDeliveryQueue = new Queue('email-delivery', {
  connection: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  }
});

export class EmailDeliveryWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      'email-delivery',
      this.processEmailDelivery.bind(this),
      {
        connection: redisConfig,
        concurrency: config.QUEUE_CONCURRENCY,
        limiter: {
          max: 50,
          duration: 60000 // 50 emails per minute
        }
      }
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.worker.on('completed', (job: Job) => {
      logger.info('Email delivery completed', {
        jobId: job.id,
        deliveryId: job.data.deliveryId,
        processingTime: Date.now() - job.timestamp
      });
    });

    this.worker.on('failed', (job: Job | undefined, error: Error) => {
      logger.error('Email delivery failed', {
        jobId: job?.id,
        deliveryId: job?.data?.deliveryId,
        error: error.message,
        attempts: job?.attemptsMade
      });
    });

    this.worker.on('stalled', (jobId: string) => {
      logger.warn('Email delivery stalled', { jobId });
    });
  }

  /**
   * Process email delivery job
   */
  private async processEmailDelivery(job: Job): Promise<void> {
    const { deliveryId, notificationId, userId, templateId } = job.data;
    
    try {
      logger.info('Processing email delivery', { 
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
        logger.info('Email already delivered, skipping', { deliveryId });
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

      // Get template if specified
      const template = templateId ? await templateRepository.findById(templateId) : null;

      // Prepare email content
      const emailContent = await this.prepareEmailContent(notification, user, template);

      // Send email via EMAIL-Dispatcher
      const dispatcherResponse = await emailDispatcherService.sendEmail(emailContent);

      // Update delivery with success
      delivery.status = DeliveryStatus.DELIVERED;
      delivery.deliveredAt = new Date();
      delivery.emailData = {
        messageId: dispatcherResponse.messageId,
        dispatcherJobId: dispatcherResponse.jobId,
        fromAddress: emailContent.fromName || config.DEFAULT_FROM_NAME,
        replyTo: emailContent.replyTo
      };
      delivery.updatedAt = new Date();

      await deliveryRepository.update(delivery);

      // Record analytics
      await analyticsService.recordDeliveryEvent({
        notificationId,
        deliveryId,
        userId,
        eventType: 'delivered',
        channel: 'email',
        metadata: {
          messageId: dispatcherResponse.messageId,
          dispatcherJobId: dispatcherResponse.jobId
        }
      });

      // Publish delivery event
      await eventPublisher.publishNotificationDelivered(delivery);

      logger.info('Email delivered successfully', {
        deliveryId,
        userId,
        messageId: dispatcherResponse.messageId
      });

    } catch (error) {
      await this.handleDeliveryError(deliveryId, error as Error, job.attemptsMade || 0);
      throw error;
    }
  }

  /**
   * Prepare email content from notification and template
   */
  private async prepareEmailContent(
    notification: NotificationRequest,
    user: any,
    template?: NotificationTemplate
  ): Promise<EmailDispatcherRequest> {
    try {
      // Prepare template data
      const templateData = {
        ...notification.templateData,
        userName: user.name || user.firstName + ' ' + user.lastName,
        userEmail: user.email,
        userFirstName: user.firstName,
        userLastName: user.lastName,
        notificationId: notification.id,
        notificationType: notification.type,
        courseId: notification.courseId,
        sourceService: notification.sourceService,
        unsubscribeUrl: await this.generateUnsubscribeUrl(user.id, notification.type)
      };

      let emailContent: any = {
        to: user.email,
        subject: notification.subject || notification.title,
        textBody: notification.message,
        metadata: {
          notificationId: notification.id,
          userId: user.id,
          type: notification.type,
          sourceService: notification.sourceService
        },
        trackOpens: notification.options?.trackOpens ?? config.ENABLE_OPEN_TRACKING,
        trackClicks: notification.options?.trackClicks ?? config.ENABLE_CLICK_TRACKING,
        tags: [
          notification.type,
          notification.sourceService,
          ...(notification.options?.tags || [])
        ]
      };

      // Use template if available
      if (template?.emailTemplate) {
        const renderedTemplate = await templateService.renderEmailTemplate(
          template.emailTemplate,
          templateData,
          template.id
        );

        emailContent = {
          ...emailContent,
          subject: renderedTemplate.subject,
          htmlBody: renderedTemplate.htmlBody,
          textBody: renderedTemplate.textBody,
          fromName: renderedTemplate.fromName || config.DEFAULT_FROM_NAME,
          replyTo: renderedTemplate.replyTo || config.DEFAULT_REPLY_TO,
          attachments: template.emailTemplate.attachments
        };
      } else {
        // Generate basic HTML from plain text
        emailContent.htmlBody = this.generateBasicHtml(notification, templateData);
        emailContent.fromName = config.DEFAULT_FROM_NAME;
      }

      // Add unsubscribe link if allowed
      if (notification.options?.allowUnsubscribe) {
        emailContent.htmlBody = this.addUnsubscribeLink(
          emailContent.htmlBody,
          templateData.unsubscribeUrl
        );
        emailContent.textBody = this.addUnsubscribeLinkText(
          emailContent.textBody,
          templateData.unsubscribeUrl
        );
      }

      return emailContent;
    } catch (error) {
      logger.error('Failed to prepare email content', {
        notificationId: notification.id,
        templateId: template?.id,
        error
      });
      throw error;
    }
  }

  /**
   * Generate basic HTML email from notification
   */
  private generateBasicHtml(notification: NotificationRequest, templateData: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${notification.title}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .content { padding: 20px 0; }
        .footer { border-top: 1px solid #eee; padding-top: 20px; margin-top: 20px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${notification.title}</h1>
        </div>
        <div class="content">
            <p>Hello ${templateData.userName},</p>
            <p>${notification.message.replace(/\n/g, '</p><p>')}</p>
        </div>
        <div class="footer">
            <p>This email was sent by ${config.DEFAULT_FROM_NAME}</p>
            <p>If you have any questions, please contact our support team.</p>
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Add unsubscribe link to HTML email
   */
  private addUnsubscribeLink(htmlBody: string, unsubscribeUrl: string): string {
    const unsubscribeHtml = `
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
        <p>If you no longer wish to receive these emails, you can <a href="${unsubscribeUrl}">unsubscribe here</a>.</p>
    </div>`;

    // Try to insert before closing body tag, otherwise append
    if (htmlBody.includes('</body>')) {
      return htmlBody.replace('</body>', unsubscribeHtml + '</body>');
    } else {
      return htmlBody + unsubscribeHtml;
    }
  }

  /**
   * Add unsubscribe link to text email
   */
  private addUnsubscribeLinkText(textBody: string, unsubscribeUrl: string): string {
    return textBody + `\n\n---\nIf you no longer wish to receive these emails, you can unsubscribe here: ${unsubscribeUrl}`;
  }

  /**
   * Generate unsubscribe URL
   */
  private async generateUnsubscribeUrl(userId: string, notificationType: string): Promise<string> {
    try {
      // Use EMAIL-Dispatcher's unsubscribe service if available
      return await emailDispatcherService.createUnsubscribeLink({
        email: '', // Will be filled by EMAIL-Dispatcher
        userId,
        type: notificationType,
        metadata: {
          service: 'notification-service',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      // Fallback to local unsubscribe URL
      const crypto = require('crypto');
      const token = crypto
        .createHmac('sha256', config.UNSUBSCRIBE_SECRET)
        .update(`${userId}:${notificationType}`)
        .digest('hex');
      
      return `${config.UNSUBSCRIBE_BASE_URL}?token=${token}&user=${userId}&type=${notificationType}`;
    }
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
          60 * 60 * 1000 // Max 1 hour
        );
        delivery.nextRetryAt = new Date(Date.now() + retryDelay);
        delivery.status = DeliveryStatus.PENDING;
        
        logger.info('Email delivery will be retried', {
          deliveryId,
          attemptsMade,
          nextRetryAt: delivery.nextRetryAt,
          retryDelay
        });
      } else {
        logger.error('Email delivery failed permanently', {
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
          channel: 'email',
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
      waiting: await emailDeliveryQueue.getWaiting().then(jobs => jobs.length),
      active: await emailDeliveryQueue.getActive().then(jobs => jobs.length),
      completed: await emailDeliveryQueue.getCompleted().then(jobs => jobs.length),
      failed: await emailDeliveryQueue.getFailed().then(jobs => jobs.length),
      delayed: await emailDeliveryQueue.getDelayed().then(jobs => jobs.length)
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
          await emailDeliveryQueue.add(
            'deliver-email',
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
        logger.info('Queued failed email deliveries for retry', { count: retryCount });
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
      await emailDeliveryQueue.clean(24 * 60 * 60 * 1000, 100, 'completed'); // 24 hours
      await emailDeliveryQueue.clean(7 * 24 * 60 * 60 * 1000, 50, 'failed'); // 7 days
      logger.info('Email delivery queue cleanup completed');
    } catch (error) {
      logger.error('Email delivery queue cleanup failed', error);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down email delivery worker...');
    await this.worker.close();
    await emailDeliveryQueue.close();
    logger.info('Email delivery worker shutdown complete');
  }
}

// Singleton instance
export const emailDeliveryWorker = new EmailDeliveryWorker();
