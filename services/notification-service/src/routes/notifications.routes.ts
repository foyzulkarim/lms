import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { 
  SendNotificationRequest,
  SendNotificationResponse,
  BulkNotificationRequest,
  BulkNotificationResponse,
  NotificationRequest,
  NotificationRecipient,
  NotificationPriority,
  NotificationChannel,
  DeliveryResponse,
  PaginationParams,
  ApiResponse
} from '@/types';
import { notificationService } from '@/services/notification.service';
import { deliveryRepository } from '@/repositories/delivery.repository';
import { analyticsService } from '@/services/analytics.service';
import { logger } from '@/utils/logger';
import { authMiddleware } from '@/middleware/auth.middleware';
import { rateLimitMiddleware } from '@/middleware/rate-limit.middleware';
import { v4 as uuidv4 } from 'uuid';

export async function notificationRoutes(fastify: FastifyInstance) {
  // Apply authentication middleware to all routes
  fastify.addHook('preHandler', authMiddleware);

  /**
   * Send single notification
   */
  fastify.post<{
    Body: SendNotificationRequest;
    Reply: ApiResponse<SendNotificationResponse>;
  }>('/send', {
    preHandler: [rateLimitMiddleware],
    schema: {
      description: 'Send a notification to recipients',
      tags: ['Notifications'],
      body: {
        type: 'object',
        required: ['type', 'channels', 'recipients', 'title', 'message', 'sourceService'],
        properties: {
          type: { type: 'string', enum: Object.values(['welcome', 'course_enrolled', 'assignment_due', 'assignment_graded', 'course_completed', 'discussion_reply', 'system_announcement', 'password_reset', 'login_alert', 'bulk_message']) },
          channels: { type: 'array', items: { type: 'string', enum: ['email', 'web_push'] } },
          recipients: {
            type: 'array',
            items: {
              type: 'object',
              required: ['userId'],
              properties: {
                userId: { type: 'string' },
                email: { type: 'string', format: 'email' },
                metadata: { type: 'object' }
              }
            }
          },
          title: { type: 'string', maxLength: 200 },
          message: { type: 'string', maxLength: 5000 },
          subject: { type: 'string', maxLength: 500 },
          templateId: { type: 'string' },
          templateData: { type: 'object' },
          scheduleAt: { type: 'string', format: 'date-time' },
          expiresAt: { type: 'string', format: 'date-time' },
          priority: { type: 'number', minimum: 1, maximum: 4 },
          options: {
            type: 'object',
            properties: {
              requireDeliveryConfirmation: { type: 'boolean' },
              trackOpens: { type: 'boolean' },
              trackClicks: { type: 'boolean' },
              allowUnsubscribe: { type: 'boolean' },
              respectQuietHours: { type: 'boolean' },
              batchable: { type: 'boolean' },
              tags: { type: 'array', items: { type: 'string' } }
            }
          },
          sourceService: { type: 'string', maxLength: 100 },
          sourceId: { type: 'string', maxLength: 100 },
          courseId: { type: 'string' }
        }
      },
      response: {
        202: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                notificationId: { type: 'string' },
                deliveries: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      deliveryId: { type: 'string' },
                      userId: { type: 'string' },
                      channel: { type: 'string' },
                      status: { type: 'string' },
                      estimatedDeliveryTime: { type: 'string' }
                    }
                  }
                },
                message: { type: 'string' },
                scheduledAt: { type: 'string' }
              }
            },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: SendNotificationRequest }>, reply: FastifyReply) => {
    try {
      const body = request.body;
      
      // Create notification request
      const notification: NotificationRequest = {
        id: uuidv4(),
        type: body.type as any,
        channels: body.channels as NotificationChannel[],
        recipients: body.recipients as NotificationRecipient[],
        title: body.title,
        message: body.message,
        subject: body.subject,
        templateId: body.templateId,
        templateData: body.templateData,
        scheduleAt: body.scheduleAt ? new Date(body.scheduleAt) : undefined,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        priority: (body.priority as NotificationPriority) || NotificationPriority.NORMAL,
        options: body.options || {},
        sourceService: body.sourceService,
        sourceId: body.sourceId,
        courseId: body.courseId,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Send notification
      const result = await notificationService.sendNotification(notification);

      const response: SendNotificationResponse = {
        notificationId: result.notificationId,
        deliveries: result.deliveries.map(d => ({
          deliveryId: d.deliveryId,
          userId: d.userId,
          channel: d.channel,
          status: d.status,
          estimatedDeliveryTime: d.estimatedDeliveryTime
        })),
        message: result.message,
        scheduledAt: result.scheduledAt
      };

      reply.code(202).send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to send notification', { error, body: request.body });
      reply.code(500).send({
        success: false,
        error: {
          code: 'NOTIFICATION_SEND_FAILED',
          message: error instanceof Error ? error.message : 'Failed to send notification'
        },
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Send bulk notification
   */
  fastify.post<{
    Body: BulkNotificationRequest;
    Reply: ApiResponse<BulkNotificationResponse>;
  }>('/send/bulk', {
    preHandler: [rateLimitMiddleware],
    schema: {
      description: 'Send bulk notifications to multiple recipients',
      tags: ['Notifications'],
      body: {
        type: 'object',
        required: ['type', 'channels', 'title', 'message', 'recipients', 'sourceService'],
        properties: {
          type: { type: 'string' },
          channels: { type: 'array', items: { type: 'string' } },
          title: { type: 'string' },
          message: { type: 'string' },
          subject: { type: 'string' },
          templateId: { type: 'string' },
          templateData: { type: 'object' },
          recipients: { type: 'array', items: { type: 'object' } },
          batchSize: { type: 'number', minimum: 1, maximum: 1000 },
          throttleMs: { type: 'number', minimum: 0 },
          priority: { type: 'number', minimum: 1, maximum: 4 },
          options: { type: 'object' },
          sourceService: { type: 'string' },
          sourceId: { type: 'string' },
          courseId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: BulkNotificationRequest }>, reply: FastifyReply) => {
    try {
      const body = request.body;
      
      const result = await notificationService.sendBulkNotification({
        type: body.type as any,
        channels: body.channels as NotificationChannel[],
        title: body.title,
        message: body.message,
        subject: body.subject,
        templateId: body.templateId,
        templateData: body.templateData,
        recipients: body.recipients as NotificationRecipient[],
        batchSize: body.batchSize,
        throttleMs: body.throttleMs,
        priority: (body.priority as NotificationPriority) || NotificationPriority.NORMAL,
        options: body.options || {},
        sourceService: body.sourceService,
        sourceId: body.sourceId,
        courseId: body.courseId
      });

      reply.code(202).send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to send bulk notification', { error, body: request.body });
      reply.code(500).send({
        success: false,
        error: {
          code: 'BULK_NOTIFICATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to send bulk notification'
        },
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Schedule notification
   */
  fastify.post<{
    Body: SendNotificationRequest;
    Reply: ApiResponse<{ notificationId: string; scheduledAt: string; status: string }>;
  }>('/schedule', {
    preHandler: [rateLimitMiddleware],
    schema: {
      description: 'Schedule a notification for future delivery',
      tags: ['Notifications']
    }
  }, async (request: FastifyRequest<{ Body: SendNotificationRequest }>, reply: FastifyReply) => {
    try {
      const body = request.body;
      
      if (!body.scheduleAt) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'SCHEDULE_TIME_REQUIRED',
            message: 'scheduleAt is required for scheduled notifications'
          },
          timestamp: new Date().toISOString()
        });
      }

      const scheduleTime = new Date(body.scheduleAt);
      if (scheduleTime <= new Date()) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_SCHEDULE_TIME',
            message: 'Schedule time must be in the future'
          },
          timestamp: new Date().toISOString()
        });
      }

      const notification: NotificationRequest = {
        id: uuidv4(),
        type: body.type as any,
        channels: body.channels as NotificationChannel[],
        recipients: body.recipients as NotificationRecipient[],
        title: body.title,
        message: body.message,
        subject: body.subject,
        templateId: body.templateId,
        templateData: body.templateData,
        scheduleAt: scheduleTime,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        priority: (body.priority as NotificationPriority) || NotificationPriority.NORMAL,
        options: body.options || {},
        sourceService: body.sourceService,
        sourceId: body.sourceId,
        courseId: body.courseId,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await notificationService.scheduleNotification(notification);

      reply.code(201).send({
        success: true,
        data: {
          notificationId: result.notificationId,
          scheduledAt: result.scheduledAt!,
          status: 'scheduled'
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to schedule notification', { error, body: request.body });
      reply.code(500).send({
        success: false,
        error: {
          code: 'SCHEDULE_NOTIFICATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to schedule notification'
        },
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Get notification delivery status
   */
  fastify.get<{
    Params: { notificationId: string };
    Reply: ApiResponse<any>;
  }>('/:notificationId/deliveries', {
    schema: {
      description: 'Get delivery status for a notification',
      tags: ['Notifications'],
      params: {
        type: 'object',
        properties: {
          notificationId: { type: 'string' }
        },
        required: ['notificationId']
      }
    }
  }, async (request: FastifyRequest<{ Params: { notificationId: string } }>, reply: FastifyReply) => {
    try {
      const { notificationId } = request.params;
      
      const deliveries = await deliveryRepository.findByNotificationId(notificationId);
      
      if (deliveries.length === 0) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'NOTIFICATION_NOT_FOUND',
            message: 'Notification not found or has no deliveries'
          },
          timestamp: new Date().toISOString()
        });
      }

      const response = {
        notificationId,
        deliveries: deliveries.map(delivery => ({
          id: delivery.id,
          userId: delivery.userId,
          channel: delivery.channel,
          status: delivery.status,
          attempts: delivery.attempts,
          deliveredAt: delivery.deliveredAt?.toISOString(),
          openedAt: delivery.openedAt?.toISOString(),
          clickedAt: delivery.clickedAt?.toISOString(),
          errorMessage: delivery.errorMessage,
          emailData: delivery.emailData,
          pushData: delivery.pushData
        }))
      };

      reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get delivery status', { error, notificationId: request.params.notificationId });
      reply.code(500).send({
        success: false,
        error: {
          code: 'GET_DELIVERY_STATUS_FAILED',
          message: error instanceof Error ? error.message : 'Failed to get delivery status'
        },
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Get user delivery history
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: PaginationParams & {
      channel?: string;
      status?: string;
      from?: string;
      to?: string;
    };
    Reply: ApiResponse<any>;
  }>('/deliveries/user/:userId', {
    schema: {
      description: 'Get delivery history for a user',
      tags: ['Notifications'],
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string' }
        },
        required: ['userId']
      },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100 },
          channel: { type: 'string', enum: ['email', 'web_push'] },
          status: { type: 'string', enum: ['pending', 'processing', 'delivered', 'failed', 'expired', 'cancelled'] },
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Params: { userId: string };
    Querystring: PaginationParams & {
      channel?: string;
      status?: string;
      from?: string;
      to?: string;
    };
  }>, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      const { page = 1, limit = 20, channel, status, from, to } = request.query;
      
      const filters: any = { userId };
      if (channel) filters.channel = channel;
      if (status) filters.status = status;
      if (from) filters.from = new Date(from);
      if (to) filters.to = new Date(to);

      const result = await deliveryRepository.findByUserIdPaginated(filters, {
        page,
        limit,
        sortBy: 'created_at',
        sortOrder: 'desc'
      });

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get user delivery history', { error, userId: request.params.userId });
      reply.code(500).send({
        success: false,
        error: {
          code: 'GET_USER_DELIVERIES_FAILED',
          message: error instanceof Error ? error.message : 'Failed to get user delivery history'
        },
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Cancel scheduled notification
   */
  fastify.delete<{
    Params: { notificationId: string };
    Reply: ApiResponse<{ message: string }>;
  }>('/:notificationId/cancel', {
    schema: {
      description: 'Cancel a scheduled notification',
      tags: ['Notifications'],
      params: {
        type: 'object',
        properties: {
          notificationId: { type: 'string' }
        },
        required: ['notificationId']
      }
    }
  }, async (request: FastifyRequest<{ Params: { notificationId: string } }>, reply: FastifyReply) => {
    try {
      const { notificationId } = request.params;
      
      const result = await notificationService.cancelNotification(notificationId);
      
      if (!result.success) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'NOTIFICATION_NOT_FOUND',
            message: result.message
          },
          timestamp: new Date().toISOString()
        });
      }

      reply.send({
        success: true,
        data: { message: result.message },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to cancel notification', { error, notificationId: request.params.notificationId });
      reply.code(500).send({
        success: false,
        error: {
          code: 'CANCEL_NOTIFICATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to cancel notification'
        },
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Get delivery analytics
   */
  fastify.get<{
    Querystring: {
      from?: string;
      to?: string;
      type?: string;
      channel?: string;
    };
    Reply: ApiResponse<any>;
  }>('/analytics/deliveries', {
    schema: {
      description: 'Get delivery analytics',
      tags: ['Analytics'],
      querystring: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
          type: { type: 'string' },
          channel: { type: 'string', enum: ['email', 'web_push'] }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Querystring: {
      from?: string;
      to?: string;
      type?: string;
      channel?: string;
    };
  }>, reply: FastifyReply) => {
    try {
      const { from, to, type, channel } = request.query;
      
      const filters: any = {};
      if (from) filters.from = new Date(from);
      if (to) filters.to = new Date(to);
      if (type) filters.type = type;
      if (channel) filters.channel = channel;

      const analytics = await analyticsService.getDeliveryAnalytics(filters);

      reply.send({
        success: true,
        data: analytics,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get delivery analytics', { error, query: request.query });
      reply.code(500).send({
        success: false,
        error: {
          code: 'GET_ANALYTICS_FAILED',
          message: error instanceof Error ? error.message : 'Failed to get delivery analytics'
        },
        timestamp: new Date().toISOString()
      });
    }
  });
}
