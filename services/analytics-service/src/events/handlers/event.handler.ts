import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { getKafkaConfig, env } from '@/config/environment';
import { logger, structuredLog } from '@/utils/logger';
import { analyticsService } from '@/services/analytics.service';
import { 
  AnalyticsEvent,
  UserCreatedEventSchema,
  UserEnrolledEventSchema,
  UserCompletedCourseEventSchema,
  CourseCreatedEventSchema,
  ModuleCompletedEventSchema,
  AssessmentStartedEventSchema,
  AssessmentCompletedEventSchema,
  EventProcessingError
} from '@/types/analytics.types';
import { recordEventProcessing, updateEventQueueSize } from '@/utils/metrics';
import { ZodError } from 'zod';

export class EventHandler {
  private kafka: Kafka;
  private consumer: Consumer;
  private isConnected = false;
  private processingQueue: Map<string, number> = new Map();

  constructor() {
    this.kafka = new Kafka(getKafkaConfig());
    this.consumer = this.kafka.consumer({ 
      groupId: env.KAFKA_GROUP_ID,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      maxWaitTimeInMs: 5000,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  async connect(): Promise<void> {
    try {
      await this.consumer.connect();
      this.isConnected = true;
      
      // Subscribe to topics
      await this.consumer.subscribe({
        topics: [
          'user.events',
          'course.events',
          'assessment.events',
        ],
        fromBeginning: false,
      });

      logger.info('✅ Kafka consumer connected and subscribed to topics');
    } catch (error) {
      logger.error('❌ Failed to connect Kafka consumer:', error);
      throw new EventProcessingError('Failed to connect to Kafka', error);
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.consumer.disconnect();
        this.isConnected = false;
        logger.info('✅ Kafka consumer disconnected');
      }
    } catch (error) {
      logger.error('❌ Error disconnecting Kafka consumer:', error);
      throw new EventProcessingError('Failed to disconnect from Kafka', error);
    }
  }

  // ============================================================================
  // Event Processing
  // ============================================================================

  async startProcessing(): Promise<void> {
    if (!this.isConnected) {
      throw new EventProcessingError('Consumer not connected');
    }

    try {
      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.processMessage(payload);
        },
      });

      logger.info('🚀 Event processing started');
    } catch (error) {
      logger.error('❌ Error starting event processing:', error);
      throw new EventProcessingError('Failed to start event processing', error);
    }
  }

  private async processMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    const startTime = Date.now();
    
    if (!message.value) {
      logger.warn('Received message with no value', { topic, partition });
      return;
    }

    let event: AnalyticsEvent;
    let eventId = 'unknown';

    try {
      // Parse message
      const messageStr = message.value.toString();
      const rawEvent = JSON.parse(messageStr);
      eventId = rawEvent.eventId || 'unknown';

      // Update queue size metric
      this.processingQueue.set(eventId, Date.now());
      updateEventQueueSize(topic, this.processingQueue.size);

      // Validate and parse event
      event = this.validateEvent(rawEvent);
      
      structuredLog.event.logReceived(event.eventType, eventId, {
        topic,
        partition,
        offset: message.offset,
      });

      // Process the event
      await analyticsService.processEvent(event);

      // Record successful processing
      recordEventProcessing(event.eventType, Date.now() - startTime, true);
      structuredLog.event.logProcessed(event.eventType, eventId, Date.now() - startTime);

    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (error instanceof ZodError) {
        logger.error('Event validation failed', {
          eventId,
          topic,
          partition,
          offset: message.offset,
          validationErrors: error.errors,
        });
        recordEventProcessing('validation_error', duration, false);
      } else {
        logger.error('Event processing failed', {
          eventId,
          topic,
          partition,
          offset: message.offset,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          },
        });
        recordEventProcessing(eventId.split('.')[0] || 'unknown', duration, false);
        structuredLog.event.logFailed('unknown', eventId, error as Error);
      }

      // For now, we'll log and continue. In production, you might want to:
      // 1. Send to dead letter queue
      // 2. Retry with exponential backoff
      // 3. Alert monitoring systems
      
    } finally {
      // Clean up processing queue
      this.processingQueue.delete(eventId);
      updateEventQueueSize(topic, this.processingQueue.size);
    }
  }

  // ============================================================================
  // Event Validation
  // ============================================================================

  private validateEvent(rawEvent: any): AnalyticsEvent {
    const eventType = rawEvent.eventType;
    
    if (!eventType) {
      throw new EventProcessingError('Event type is required');
    }

    try {
      switch (eventType) {
        case 'UserCreated':
          return UserCreatedEventSchema.parse(rawEvent);
        
        case 'UserEnrolled':
          return UserEnrolledEventSchema.parse(rawEvent);
        
        case 'UserCompletedCourse':
          return UserCompletedCourseEventSchema.parse(rawEvent);
        
        case 'CourseCreated':
          return CourseCreatedEventSchema.parse(rawEvent);
        
        case 'ModuleCompleted':
          return ModuleCompletedEventSchema.parse(rawEvent);
        
        case 'AssessmentStarted':
          return AssessmentStartedEventSchema.parse(rawEvent);
        
        case 'AssessmentCompleted':
          return AssessmentCompletedEventSchema.parse(rawEvent);
        
        default:
          throw new EventProcessingError(`Unknown event type: ${eventType}`);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        throw error;
      }
      throw new EventProcessingError(`Failed to validate event: ${error}`);
    }
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      connected: boolean;
      processingQueueSize: number;
      lastProcessedAt?: Date;
    };
  }> {
    try {
      return {
        status: this.isConnected ? 'healthy' : 'unhealthy',
        details: {
          connected: this.isConnected,
          processingQueueSize: this.processingQueue.size,
          lastProcessedAt: this.processingQueue.size > 0 
            ? new Date(Math.max(...Array.from(this.processingQueue.values())))
            : undefined,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          connected: false,
          processingQueueSize: 0,
        },
      };
    }
  }

  // ============================================================================
  // Batch Processing (for high-volume scenarios)
  // ============================================================================

  async processBatch(events: AnalyticsEvent[]): Promise<{
    processed: number;
    failed: number;
    errors: Array<{ eventId: string; error: string }>;
  }> {
    const startTime = Date.now();
    const results = {
      processed: 0,
      failed: 0,
      errors: [] as Array<{ eventId: string; error: string }>,
    };

    // Process events in batches to avoid overwhelming the system
    const batchSize = env.EVENT_BATCH_SIZE;
    
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async (event) => {
          try {
            await analyticsService.processEvent(event);
            results.processed++;
          } catch (error) {
            results.failed++;
            results.errors.push({
              eventId: event.eventId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        })
      );

      // Small delay between batches to prevent overwhelming the database
      if (i + batchSize < events.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const duration = Date.now() - startTime;
    logger.info('Batch processing completed', {
      totalEvents: events.length,
      processed: results.processed,
      failed: results.failed,
      duration,
    });

    recordAnalyticsCalculation('batch_processing', duration, events.length, results.failed === 0);
    
    return results;
  }

  // ============================================================================
  // Event Replay (for recovery scenarios)
  // ============================================================================

  async replayEvents(fromTimestamp: Date, toTimestamp: Date): Promise<void> {
    logger.info('Starting event replay', { fromTimestamp, toTimestamp });
    
    try {
      // Create a separate consumer for replay
      const replayConsumer = this.kafka.consumer({ 
        groupId: `${env.KAFKA_GROUP_ID}-replay-${Date.now()}`,
      });

      await replayConsumer.connect();
      
      await replayConsumer.subscribe({
        topics: ['user.events', 'course.events', 'assessment.events'],
        fromBeginning: true,
      });

      let processedCount = 0;
      const startTime = Date.now();

      await replayConsumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value || !message.timestamp) return;

          const messageTimestamp = new Date(parseInt(message.timestamp));
          
          // Skip messages outside our replay window
          if (messageTimestamp < fromTimestamp || messageTimestamp > toTimestamp) {
            return;
          }

          try {
            const rawEvent = JSON.parse(message.value.toString());
            const event = this.validateEvent(rawEvent);
            await analyticsService.processEvent(event);
            processedCount++;

            if (processedCount % 100 === 0) {
              logger.info(`Replay progress: ${processedCount} events processed`);
            }
          } catch (error) {
            logger.error('Error during event replay', { error, message: message.value.toString() });
          }
        },
      });

      await replayConsumer.disconnect();
      
      const duration = Date.now() - startTime;
      logger.info('Event replay completed', {
        processedCount,
        duration,
        fromTimestamp,
        toTimestamp,
      });

    } catch (error) {
      logger.error('Event replay failed', { error, fromTimestamp, toTimestamp });
      throw new EventProcessingError('Event replay failed', error);
    }
  }

  // ============================================================================
  // Monitoring and Statistics
  // ============================================================================

  getProcessingStats(): {
    queueSize: number;
    isConnected: boolean;
    topics: string[];
  } {
    return {
      queueSize: this.processingQueue.size,
      isConnected: this.isConnected,
      topics: ['user.events', 'course.events', 'assessment.events'],
    };
  }

  // ============================================================================
  // Graceful Shutdown
  // ============================================================================

  async gracefulShutdown(): Promise<void> {
    logger.info('Starting graceful shutdown of event handler...');
    
    try {
      // Wait for current processing to complete (with timeout)
      const shutdownTimeout = 30000; // 30 seconds
      const startTime = Date.now();
      
      while (this.processingQueue.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
        logger.info(`Waiting for ${this.processingQueue.size} events to complete processing...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (this.processingQueue.size > 0) {
        logger.warn(`Shutdown timeout reached with ${this.processingQueue.size} events still processing`);
      }

      await this.disconnect();
      logger.info('✅ Event handler shutdown completed');
    } catch (error) {
      logger.error('❌ Error during graceful shutdown:', error);
      throw error;
    }
  }
}

export const eventHandler = new EventHandler();
