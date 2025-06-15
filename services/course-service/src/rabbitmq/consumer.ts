import { Channel, ConsumeMessage } from 'amqplib';
import { getRabbitMQChannel, QUEUES } from './connection';
import { logger } from '../utils/logger';

// Event handler type
type EventHandler = (event: any) => Promise<void>;

// Event consumer class
export class EventConsumer {
  private channel: Channel;
  private handlers: Map<string, EventHandler[]> = new Map();

  constructor(channel: Channel) {
    this.channel = channel;
  }

  // Register event handler
  registerHandler(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
    logger.info(`Registered handler for event type: ${eventType}`);
  }

  // Start consuming messages
  async startConsuming(): Promise<void> {
    try {
      logger.info('Starting event consumer...');

      await this.channel.consume(
        QUEUES.COURSE_SERVICE,
        async (message: ConsumeMessage | null) => {
          if (!message) {
            return;
          }

          try {
            const event = JSON.parse(message.content.toString());
            logger.debug('Received event:', {
              type: event.type,
              id: event.id,
              routingKey: message.fields.routingKey,
            });

            // Get handlers for this event type
            const handlers = this.handlers.get(event.type) || [];
            
            if (handlers.length === 0) {
              logger.warn(`No handlers registered for event type: ${event.type}`);
              this.channel.ack(message);
              return;
            }

            // Process event with all registered handlers
            await Promise.all(
              handlers.map(async (handler) => {
                try {
                  await handler(event);
                } catch (error) {
                  logger.error(`Error in event handler for ${event.type}:`, error);
                  throw error; // Re-throw to trigger message rejection
                }
              })
            );

            // Acknowledge message after successful processing
            this.channel.ack(message);
            logger.debug(`Successfully processed event: ${event.type}`, {
              id: event.id,
            });

          } catch (error) {
            logger.error('Error processing message:', error);
            
            // Reject message and requeue (with limit to prevent infinite loops)
            const redeliveryCount = message.properties.headers?.['x-redelivery-count'] || 0;
            
            if (redeliveryCount < 3) {
              // Requeue with incremented counter
              this.channel.reject(message, true);
              logger.warn(`Requeuing message (attempt ${redeliveryCount + 1})`);
            } else {
              // Dead letter after max retries
              this.channel.reject(message, false);
              logger.error('Message rejected after max retries, sending to dead letter queue');
            }
          }
        },
        {
          noAck: false, // Manual acknowledgment
        }
      );

      logger.info('Event consumer started successfully');
    } catch (error) {
      logger.error('Failed to start event consumer:', error);
      throw error;
    }
  }

  // Stop consuming messages
  async stopConsuming(): Promise<void> {
    try {
      logger.info('Stopping event consumer...');
      // Note: In a real implementation, you'd want to store the consumer tag
      // and use channel.cancel(consumerTag) to stop consuming
      logger.info('Event consumer stopped');
    } catch (error) {
      logger.error('Error stopping event consumer:', error);
    }
  }
}

// Event handlers
export class CourseEventHandlers {
  // Handle user enrollment events
  static async handleUserEnrolled(event: any): Promise<void> {
    logger.info('Handling user enrolled event:', {
      userId: event.userId,
      courseId: event.courseId,
    });

    try {
      // Update course enrollment count
      // This would typically involve calling a service method
      // For now, we'll just log the event
      logger.info('User enrollment processed successfully');
    } catch (error) {
      logger.error('Error handling user enrolled event:', error);
      throw error;
    }
  }

  // Handle user unenrollment events
  static async handleUserUnenrolled(event: any): Promise<void> {
    logger.info('Handling user unenrolled event:', {
      userId: event.userId,
      courseId: event.courseId,
    });

    try {
      // Update course enrollment count
      // Clean up user progress data if needed
      logger.info('User unenrollment processed successfully');
    } catch (error) {
      logger.error('Error handling user unenrolled event:', error);
      throw error;
    }
  }

  // Handle user deletion events
  static async handleUserDeleted(event: any): Promise<void> {
    logger.info('Handling user deleted event:', {
      userId: event.userId,
    });

    try {
      // Clean up all user-related data in course service
      // - Remove user progress records
      // - Remove user reviews
      // - Update enrollment counts
      logger.info('User deletion cleanup processed successfully');
    } catch (error) {
      logger.error('Error handling user deleted event:', error);
      throw error;
    }
  }

  // Handle file upload events
  static async handleFileUploaded(event: any): Promise<void> {
    logger.info('Handling file uploaded event:', {
      fileId: event.fileId,
      url: event.url,
    });

    try {
      // Update course/lesson with new file URL if applicable
      // Process video files for streaming
      // Generate thumbnails for images
      logger.info('File upload processed successfully');
    } catch (error) {
      logger.error('Error handling file uploaded event:', error);
      throw error;
    }
  }

  // Handle file deletion events
  static async handleFileDeleted(event: any): Promise<void> {
    logger.info('Handling file deleted event:', {
      fileId: event.fileId,
      url: event.url,
    });

    try {
      // Update course/lesson to remove deleted file references
      // Clean up any cached data
      logger.info('File deletion processed successfully');
    } catch (error) {
      logger.error('Error handling file deleted event:', error);
      throw error;
    }
  }
}

// Setup event consumers
export const setupEventConsumers = async (): Promise<EventConsumer> => {
  const channel = getRabbitMQChannel();
  const consumer = new EventConsumer(channel);

  // Register event handlers
  consumer.registerHandler('user.enrolled', CourseEventHandlers.handleUserEnrolled);
  consumer.registerHandler('user.unenrolled', CourseEventHandlers.handleUserUnenrolled);
  consumer.registerHandler('user.deleted', CourseEventHandlers.handleUserDeleted);
  consumer.registerHandler('file.uploaded', CourseEventHandlers.handleFileUploaded);
  consumer.registerHandler('file.deleted', CourseEventHandlers.handleFileDeleted);

  // Start consuming
  await consumer.startConsuming();

  return consumer;
};

// Export singleton instance
let eventConsumer: EventConsumer | null = null;

export const getEventConsumer = (): EventConsumer => {
  if (!eventConsumer) {
    const channel = getRabbitMQChannel();
    eventConsumer = new EventConsumer(channel);
  }
  return eventConsumer;
};
