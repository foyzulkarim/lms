import { Channel } from 'amqplib';
import { getRabbitMQChannel, EXCHANGES, ROUTING_KEYS } from './connection';
import { logger } from '../utils/logger';

// Base event interface
interface BaseEvent {
  id: string;
  type: string;
  timestamp: Date;
  version: string;
  source: string;
}

// Course events
export interface CourseEvent extends BaseEvent {
  courseId: string;
  instructorId: string;
  data: Record<string, any>;
}

export interface ModuleEvent extends BaseEvent {
  courseId: string;
  moduleId: string;
  data: Record<string, any>;
}

export interface LessonEvent extends BaseEvent {
  courseId: string;
  moduleId: string;
  lessonId: string;
  data: Record<string, any>;
}

export interface ProgressEvent extends BaseEvent {
  userId: string;
  courseId: string;
  lessonId?: string;
  moduleId?: string;
  progress: number;
  data: Record<string, any>;
}

// Event publisher class
export class EventPublisher {
  private channel: Channel;

  constructor(channel: Channel) {
    this.channel = channel;
  }

  // Publish course events
  async publishCourseEvent(
    routingKey: string,
    event: Omit<CourseEvent, 'id' | 'timestamp' | 'version' | 'source'>
  ): Promise<boolean> {
    try {
      const fullEvent: CourseEvent = {
        ...event,
        id: `course-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        version: '1.0',
        source: 'course-service',
      };

      const message = Buffer.from(JSON.stringify(fullEvent));
      
      const published = this.channel.publish(
        EXCHANGES.COURSE_EVENTS,
        routingKey,
        message,
        {
          persistent: true,
          messageId: fullEvent.id,
          timestamp: fullEvent.timestamp.getTime(),
          type: fullEvent.type,
        }
      );

      if (published) {
        logger.info(`Published course event: ${routingKey}`, {
          eventId: fullEvent.id,
          courseId: fullEvent.courseId,
          type: fullEvent.type,
        });
      } else {
        logger.warn(`Failed to publish course event: ${routingKey}`, {
          eventId: fullEvent.id,
          courseId: fullEvent.courseId,
        });
      }

      return published;
    } catch (error) {
      logger.error(`Error publishing course event: ${routingKey}`, error);
      return false;
    }
  }

  // Publish module events
  async publishModuleEvent(
    routingKey: string,
    event: Omit<ModuleEvent, 'id' | 'timestamp' | 'version' | 'source'>
  ): Promise<boolean> {
    try {
      const fullEvent: ModuleEvent = {
        ...event,
        id: `module-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        version: '1.0',
        source: 'course-service',
      };

      const message = Buffer.from(JSON.stringify(fullEvent));
      
      const published = this.channel.publish(
        EXCHANGES.COURSE_EVENTS,
        routingKey,
        message,
        {
          persistent: true,
          messageId: fullEvent.id,
          timestamp: fullEvent.timestamp.getTime(),
          type: fullEvent.type,
        }
      );

      if (published) {
        logger.info(`Published module event: ${routingKey}`, {
          eventId: fullEvent.id,
          moduleId: fullEvent.moduleId,
          courseId: fullEvent.courseId,
          type: fullEvent.type,
        });
      }

      return published;
    } catch (error) {
      logger.error(`Error publishing module event: ${routingKey}`, error);
      return false;
    }
  }

  // Publish lesson events
  async publishLessonEvent(
    routingKey: string,
    event: Omit<LessonEvent, 'id' | 'timestamp' | 'version' | 'source'>
  ): Promise<boolean> {
    try {
      const fullEvent: LessonEvent = {
        ...event,
        id: `lesson-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        version: '1.0',
        source: 'course-service',
      };

      const message = Buffer.from(JSON.stringify(fullEvent));
      
      const published = this.channel.publish(
        EXCHANGES.COURSE_EVENTS,
        routingKey,
        message,
        {
          persistent: true,
          messageId: fullEvent.id,
          timestamp: fullEvent.timestamp.getTime(),
          type: fullEvent.type,
        }
      );

      if (published) {
        logger.info(`Published lesson event: ${routingKey}`, {
          eventId: fullEvent.id,
          lessonId: fullEvent.lessonId,
          moduleId: fullEvent.moduleId,
          courseId: fullEvent.courseId,
          type: fullEvent.type,
        });
      }

      return published;
    } catch (error) {
      logger.error(`Error publishing lesson event: ${routingKey}`, error);
      return false;
    }
  }

  // Publish progress events
  async publishProgressEvent(
    routingKey: string,
    event: Omit<ProgressEvent, 'id' | 'timestamp' | 'version' | 'source'>
  ): Promise<boolean> {
    try {
      const fullEvent: ProgressEvent = {
        ...event,
        id: `progress-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        version: '1.0',
        source: 'course-service',
      };

      const message = Buffer.from(JSON.stringify(fullEvent));
      
      const published = this.channel.publish(
        EXCHANGES.ANALYTICS_EVENTS,
        routingKey,
        message,
        {
          persistent: true,
          messageId: fullEvent.id,
          timestamp: fullEvent.timestamp.getTime(),
          type: fullEvent.type,
        }
      );

      if (published) {
        logger.info(`Published progress event: ${routingKey}`, {
          eventId: fullEvent.id,
          userId: fullEvent.userId,
          courseId: fullEvent.courseId,
          type: fullEvent.type,
        });
      }

      return published;
    } catch (error) {
      logger.error(`Error publishing progress event: ${routingKey}`, error);
      return false;
    }
  }

  // Convenience methods for specific events
  async courseCreated(courseId: string, instructorId: string, data: Record<string, any>): Promise<boolean> {
    return this.publishCourseEvent(ROUTING_KEYS.COURSE_CREATED, {
      type: 'course.created',
      courseId,
      instructorId,
      data,
    });
  }

  async courseUpdated(courseId: string, instructorId: string, data: Record<string, any>): Promise<boolean> {
    return this.publishCourseEvent(ROUTING_KEYS.COURSE_UPDATED, {
      type: 'course.updated',
      courseId,
      instructorId,
      data,
    });
  }

  async coursePublished(courseId: string, instructorId: string, data: Record<string, any>): Promise<boolean> {
    return this.publishCourseEvent(ROUTING_KEYS.COURSE_PUBLISHED, {
      type: 'course.published',
      courseId,
      instructorId,
      data,
    });
  }

  async courseUnpublished(courseId: string, instructorId: string, data: Record<string, any>): Promise<boolean> {
    return this.publishCourseEvent(ROUTING_KEYS.COURSE_UNPUBLISHED, {
      type: 'course.unpublished',
      courseId,
      instructorId,
      data,
    });
  }

  async courseDeleted(courseId: string, instructorId: string, data: Record<string, any>): Promise<boolean> {
    return this.publishCourseEvent(ROUTING_KEYS.COURSE_DELETED, {
      type: 'course.deleted',
      courseId,
      instructorId,
      data,
    });
  }

  async moduleCreated(courseId: string, moduleId: string, data: Record<string, any>): Promise<boolean> {
    return this.publishModuleEvent(ROUTING_KEYS.MODULE_CREATED, {
      type: 'module.created',
      courseId,
      moduleId,
      data,
    });
  }

  async moduleUpdated(courseId: string, moduleId: string, data: Record<string, any>): Promise<boolean> {
    return this.publishModuleEvent(ROUTING_KEYS.MODULE_UPDATED, {
      type: 'module.updated',
      courseId,
      moduleId,
      data,
    });
  }

  async moduleDeleted(courseId: string, moduleId: string, data: Record<string, any>): Promise<boolean> {
    return this.publishModuleEvent(ROUTING_KEYS.MODULE_DELETED, {
      type: 'module.deleted',
      courseId,
      moduleId,
      data,
    });
  }

  async lessonCreated(courseId: string, moduleId: string, lessonId: string, data: Record<string, any>): Promise<boolean> {
    return this.publishLessonEvent(ROUTING_KEYS.LESSON_CREATED, {
      type: 'lesson.created',
      courseId,
      moduleId,
      lessonId,
      data,
    });
  }

  async lessonUpdated(courseId: string, moduleId: string, lessonId: string, data: Record<string, any>): Promise<boolean> {
    return this.publishLessonEvent(ROUTING_KEYS.LESSON_UPDATED, {
      type: 'lesson.updated',
      courseId,
      moduleId,
      lessonId,
      data,
    });
  }

  async lessonDeleted(courseId: string, moduleId: string, lessonId: string, data: Record<string, any>): Promise<boolean> {
    return this.publishLessonEvent(ROUTING_KEYS.LESSON_DELETED, {
      type: 'lesson.deleted',
      courseId,
      moduleId,
      lessonId,
      data,
    });
  }

  async lessonCompleted(userId: string, courseId: string, moduleId: string, lessonId: string, data: Record<string, any>): Promise<boolean> {
    return this.publishProgressEvent(ROUTING_KEYS.LESSON_COMPLETED, {
      type: 'lesson.completed',
      userId,
      courseId,
      moduleId,
      lessonId,
      progress: 100,
      data,
    });
  }

  async progressUpdated(userId: string, courseId: string, progress: number, data: Record<string, any>): Promise<boolean> {
    return this.publishProgressEvent(ROUTING_KEYS.PROGRESS_UPDATED, {
      type: 'progress.updated',
      userId,
      courseId,
      progress,
      data,
    });
  }

  async courseCompleted(userId: string, courseId: string, data: Record<string, any>): Promise<boolean> {
    return this.publishProgressEvent(ROUTING_KEYS.COURSE_COMPLETED, {
      type: 'course.completed',
      userId,
      courseId,
      progress: 100,
      data,
    });
  }
}

// Export singleton instance
let eventPublisher: EventPublisher | null = null;

export const getEventPublisher = (): EventPublisher => {
  if (!eventPublisher) {
    const channel = getRabbitMQChannel();
    eventPublisher = new EventPublisher(channel);
  }
  return eventPublisher;
};
