import { Kafka, Producer, Consumer } from 'kafkajs';
import { config } from '../config';
import { logger } from './logger';

let kafka: Kafka;
let producer: Producer;
let consumer: Consumer;

export const initializeKafka = async (): Promise<{ kafka: Kafka; producer: Producer; consumer: Consumer }> => {
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

    return { kafka, producer, consumer };
  } catch (error) {
    logger.error('Failed to initialize Kafka:', error);
    throw error;
  }
};

export const getKafka = () => {
  if (!kafka || !producer || !consumer) {
    throw new Error('Kafka not initialized. Call initializeKafka() first.');
  }
  return { kafka, producer, consumer };
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

// Event publishing utilities
export const publishLLMEvent = async (eventType: string, data: any): Promise<void> => {
  try {
    const { producer } = getKafka();
    
    await producer.send({
      topic: 'llm-events',
      messages: [
        {
          key: data.userId || 'system',
          value: JSON.stringify({
            type: eventType,
            timestamp: new Date().toISOString(),
            data,
          }),
        },
      ],
    });

    logger.debug('LLM event published', { eventType, userId: data.userId });
  } catch (error) {
    logger.error('Failed to publish LLM event', { eventType, error });
  }
};
