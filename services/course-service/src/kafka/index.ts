import { Kafka, Producer, Consumer } from 'kafkajs';
import { config } from '../config';
import { logger } from '../utils/logger';

let kafka: Kafka;
let producer: Producer;
let consumer: Consumer;

export const initializeKafka = async (): Promise<void> => {
  try {
    kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });

    producer = kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
    });

    consumer = kafka.consumer({
      groupId: config.kafka.groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await producer.connect();
    await consumer.connect();

    logger.info('Kafka initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Kafka:', error);
    throw error;
  }
};

export const getKafkaProducer = (): Producer => {
  if (!producer) {
    throw new Error('Kafka producer not initialized. Call initializeKafka() first.');
  }
  return producer;
};

export const getKafkaConsumer = (): Consumer => {
  if (!consumer) {
    throw new Error('Kafka consumer not initialized. Call initializeKafka() first.');
  }
  return consumer;
};

export const closeKafka = async (): Promise<void> => {
  if (producer) {
    await producer.disconnect();
  }
  if (consumer) {
    await consumer.disconnect();
  }
  logger.info('Kafka connections closed');
};

// Event types
export interface CourseEvent {
  type: string;
  courseId: string;
  instructorId: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ModuleEvent {
  type: string;
  moduleId: string;
  courseId: string;
  instructorId: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface LessonEvent {
  type: string;
  lessonId: string;
  moduleId: string;
  courseId: string;
  instructorId: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface EnrollmentEvent {
  type: string;
  courseId: string;
  userId: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

// Event publisher
export class EventPublisher {
  private static producer = () => getKafkaProducer();

  // Course events
  static async publishCourseCreated(courseId: string, instructorId: string, metadata?: Record<string, any>): Promise<void> {
    const event: CourseEvent = {
      type: 'COURSE_CREATED',
      courseId,
      instructorId,
      timestamp: new Date().toISOString(),
      metadata,
    };

    await this.publish('course-events', event, courseId);
  }

  static async publishCourseUpdated(courseId: string, instructorId: string, metadata?: Record<string, any>): Promise<void> {
    const event: CourseEvent = {
      type: 'COURSE_UPDATED',
      courseId,
      instructorId,
      timestamp: new Date().toISOString(),
      metadata,
    };

    await this.publish('course-events', event, courseId);
  }

  static async publishCoursePublished(courseId: string, instructorId: string, metadata?: Record<string, any>): Promise<void> {
    const event: CourseEvent = {
      type: 'COURSE_PUBLISHED',
      courseId,
      instructorId,
      timestamp: new Date().toISOString(),
      metadata,
    };

    await this.publish('course-events', event, courseId);
  }

  static async publishCourseUnpublished(courseId: string, instructorId: string, metadata?: Record<string, any>): Promise<void> {
    const event: CourseEvent = {
      type: 'COURSE_UNPUBLISHED',
      courseId,
      instructorId,
      timestamp: new Date().toISOString(),
      metadata,
    };

    await this.publish('course-events', event, courseId);
  }

  static async publishCourseDeleted(courseId: string, instructorId: string, metadata?: Record<string, any>): Promise<void> {
    const event: CourseEvent = {
      type: 'COURSE_DELETED',
      courseId,
      instructorId,
      timestamp: new Date().toISOString(),
      metadata,
    };

    await this.publish('course-events', event, courseId);
  }

  // Module events
  static async publishModuleCreated(moduleId: string, courseId: string, instructorId: string, metadata?: Record<string, any>): Promise<void> {
    const event: ModuleEvent = {
      type: 'MODULE_CREATED',
      moduleId,
      courseId,
      instructorId,
      timestamp: new Date().toISOString(),
      metadata,
    };

    await this.publish('course-events', event, courseId);
  }

  static async publishModuleUpdated(moduleId: string, courseId: string, instructorId: string, metadata?: Record<string, any>): Promise<void> {
    const event: ModuleEvent = {
      type: 'MODULE_UPDATED',
      moduleId,
      courseId,
      instructorId,
      timestamp: new Date().toISOString(),
      metadata,
    };

    await this.publish('course-events', event, courseId);
  }

  static async publishModuleDeleted(moduleId: string, courseId: string, instructorId: string, metadata?: Record<string, any>): Promise<void> {
    const event: ModuleEvent = {
      type: 'MODULE_DELETED',
      moduleId,
      courseId,
      instructorId,
      timestamp: new Date().toISOString(),
      metadata,
    };

    await this.publish('course-events', event, courseId);
  }

  // Lesson events
  static async publishLessonCreated(lessonId: string, moduleId: string, courseId: string, instructorId: string, metadata?: Record<string, any>): Promise<void> {
    const event: LessonEvent = {
      type: 'LESSON_CREATED',
      lessonId,
      moduleId,
      courseId,
      instructorId,
      timestamp: new Date().toISOString(),
      metadata,
    };

    await this.publish('course-events', event, courseId);
  }

  static async publishLessonUpdated(lessonId: string, moduleId: string, courseId: string, instructorId: string, metadata?: Record<string, any>): Promise<void> {
    const event: LessonEvent = {
      type: 'LESSON_UPDATED',
      lessonId,
      moduleId,
      courseId,
      instructorId,
      timestamp: new Date().toISOString(),
      metadata,
    };

    await this.publish('course-events', event, courseId);
  }

  static async publishLessonDeleted(lessonId: string, moduleId: string, courseId: string, instructorId: string, metadata?: Record<string, any>): Promise<void> {
    const event: LessonEvent = {
      type: 'LESSON_DELETED',
      lessonId,
      moduleId,
      courseId,
      instructorId,
      timestamp: new Date().toISOString(),
      metadata,
    };

    await this.publish('course-events', event, courseId);
  }

  // Enrollment events
  static async publishStudentEnrolled(courseId: string, userId: string, metadata?: Record<string, any>): Promise<void> {
    const event: EnrollmentEvent = {
      type: 'STUDENT_ENROLLED',
      courseId,
      userId,
      timestamp: new Date().toISOString(),
      metadata,
    };

    await this.publish('enrollment-events', event, userId);
  }

  static async publishStudentUnenrolled(courseId: string, userId: string, metadata?: Record<string, any>): Promise<void> {
    const event: EnrollmentEvent = {
      type: 'STUDENT_UNENROLLED',
      courseId,
      userId,
      timestamp: new Date().toISOString(),
      metadata,
    };

    await this.publish('enrollment-events', event, userId);
  }

  private static async publish(topic: string, event: any, key: string): Promise<void> {
    try {
      const producer = this.producer();
      await producer.send({
        topic,
        messages: [
          {
            key,
            value: JSON.stringify(event),
            timestamp: Date.now().toString(),
          },
        ],
      });

      logger.debug(`Published event ${event.type} to topic ${topic}`, { event });
    } catch (error) {
      logger.error(`Failed to publish event ${event.type} to topic ${topic}:`, error);
      throw error;
    }
  }
}

// Event consumer setup
export const setupEventConsumers = async (): Promise<void> => {
  const consumer = getKafkaConsumer();

  await consumer.subscribe({ topics: ['user-events', 'enrollment-events'] });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const event = JSON.parse(message.value?.toString() || '{}');
        logger.debug(`Received event from topic ${topic}:`, { event });

        await handleEvent(topic, event);
      } catch (error) {
        logger.error(`Failed to process message from topic ${topic}:`, error);
      }
    },
  });

  logger.info('Event consumers setup completed');
};

const handleEvent = async (topic: string, event: any): Promise<void> => {
  try {
    switch (event.type) {
      case 'USER_DEACTIVATED':
        // Handle user deactivation - maybe unpublish their courses
        logger.info(`Handling user deactivation for user ${event.userId}`);
        break;
      
      case 'STUDENT_ENROLLED':
        // Update enrollment count
        logger.info(`Handling student enrollment: ${event.userId} enrolled in ${event.courseId}`);
        break;
      
      default:
        logger.debug(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    logger.error(`Error handling event ${event.type}:`, error);
  }
};
