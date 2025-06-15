import { getChannel } from './connection';
import { logger } from '../utils/logger';

export interface AuthEvent {
  type: string;
  userId: string;
  timestamp: Date;
  data: Record<string, any>;
}

export const publishAuthEvent = async (
  routingKey: string,
  event: AuthEvent
): Promise<void> => {
  try {
    const channel = getChannel();
    const message = Buffer.from(JSON.stringify(event));

    await channel.publish('auth.events', routingKey, message, {
      persistent: true,
      timestamp: Date.now(),
      messageId: `${event.userId}-${Date.now()}`,
    });

    logger.info(`Published auth event: ${routingKey}`, {
      userId: event.userId,
      type: event.type,
    });
  } catch (error) {
    logger.error('Failed to publish auth event:', error);
    throw error;
  }
};

export const publishUserEvent = async (
  routingKey: string,
  event: AuthEvent
): Promise<void> => {
  try {
    const channel = getChannel();
    const message = Buffer.from(JSON.stringify(event));

    await channel.publish('user.events', routingKey, message, {
      persistent: true,
      timestamp: Date.now(),
      messageId: `${event.userId}-${Date.now()}`,
    });

    logger.info(`Published user event: ${routingKey}`, {
      userId: event.userId,
      type: event.type,
    });
  } catch (error) {
    logger.error('Failed to publish user event:', error);
    throw error;
  }
}; 
