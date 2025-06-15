import amqp, { Connection, Channel } from 'amqplib';
import { rabbitmqConfig } from '@/config';
import { log } from '@/utils/logger';
import { EventMessage } from '@/types/api.types';

// Connection and channel instances
let connection: Connection;
let publishChannel: Channel;
let consumeChannel: Channel;

// Initialize RabbitMQ connection
export const initializeRabbitMQ = async (): Promise<void> => {
  try {
    log.info('Initializing RabbitMQ connection...');
    
    const connectionUrl = rabbitmqConfig.url || 
      `amqp://${rabbitmqConfig.username}:${rabbitmqConfig.password}@${rabbitmqConfig.host}:${rabbitmqConfig.port}${rabbitmqConfig.vhost}`;
    
    // Create connection
    connection = await amqp.connect(connectionUrl, {
      heartbeat: 60,
      timeout: 10000,
    });
    
    // Connection event listeners
    connection.on('error', (error) => {
      log.error('RabbitMQ connection error', error);
    });
    
    connection.on('close', () => {
      log.warn('RabbitMQ connection closed');
    });
    
    connection.on('blocked', (reason) => {
      log.warn('RabbitMQ connection blocked', { reason });
    });
    
    connection.on('unblocked', () => {
      log.info('RabbitMQ connection unblocked');
    });
    
    // Create channels
    publishChannel = await connection.createChannel();
    consumeChannel = await connection.createChannel();
    
    // Set prefetch for consume channel
    await consumeChannel.prefetch(10);
    
    // Channel event listeners
    publishChannel.on('error', (error) => {
      log.error('RabbitMQ publish channel error', error);
    });
    
    consumeChannel.on('error', (error) => {
      log.error('RabbitMQ consume channel error', error);
    });
    
    // Declare exchange
    await publishChannel.assertExchange(rabbitmqConfig.exchange, 'topic', {
      durable: true,
      autoDelete: false,
    });
    
    await consumeChannel.assertExchange(rabbitmqConfig.exchange, 'topic', {
      durable: true,
      autoDelete: false,
    });
    
    log.info('RabbitMQ connection established successfully', {
      host: rabbitmqConfig.host,
      port: rabbitmqConfig.port,
      vhost: rabbitmqConfig.vhost,
      exchange: rabbitmqConfig.exchange,
    });
    
  } catch (error) {
    log.error('Failed to initialize RabbitMQ connection', error);
    throw error;
  }
};

// Close RabbitMQ connection
export const closeRabbitMQConnection = async (): Promise<void> => {
  try {
    log.info('Closing RabbitMQ connection...');
    
    if (publishChannel) {
      await publishChannel.close();
    }
    
    if (consumeChannel) {
      await consumeChannel.close();
    }
    
    if (connection) {
      await connection.close();
    }
    
    log.info('RabbitMQ connection closed successfully');
  } catch (error) {
    log.error('Error closing RabbitMQ connection', error);
    throw error;
  }
};

// RabbitMQ health check
export const checkRabbitMQHealth = async (): Promise<{ status: 'connected' | 'disconnected'; responseTime?: number }> => {
  const start = Date.now();
  
  try {
    if (!connection || !publishChannel) {
      return { status: 'disconnected' };
    }
    
    // Check connection by asserting a temporary queue
    const tempQueue = await publishChannel.assertQueue('', { exclusive: true, autoDelete: true });
    await publishChannel.deleteQueue(tempQueue.queue);
    
    const responseTime = Date.now() - start;
    
    log.debug('RabbitMQ health check passed', { responseTime });
    
    return {
      status: 'connected',
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - start;
    
    log.error('RabbitMQ health check failed', error, { responseTime });
    
    return {
      status: 'disconnected',
      responseTime,
    };
  }
};

// Event publisher class
export class EventPublisher {
  private exchange: string;
  private channel: Channel;
  
  constructor(exchange: string = rabbitmqConfig.exchange, channel: Channel = publishChannel) {
    this.exchange = exchange;
    this.channel = channel;
  }
  
  async publish(routingKey: string, message: EventMessage, options?: any): Promise<boolean> {
    try {
      const messageBuffer = Buffer.from(JSON.stringify(message));
      
      const publishOptions = {
        persistent: true,
        timestamp: Date.now(),
        messageId: message.id,
        correlationId: message.correlationId,
        ...options,
      };
      
      const result = this.channel.publish(
        this.exchange,
        routingKey,
        messageBuffer,
        publishOptions
      );
      
      if (result) {
        log.debug('Event published successfully', {
          routingKey,
          messageId: message.id,
          type: message.type,
        });
      } else {
        log.warn('Event publish failed - channel buffer full', {
          routingKey,
          messageId: message.id,
          type: message.type,
        });
      }
      
      return result;
    } catch (error) {
      log.error('Failed to publish event', error, {
        routingKey,
        messageId: message.id,
        type: message.type,
      });
      return false;
    }
  }
  
  async publishUserEvent(event: any): Promise<boolean> {
    const message: EventMessage = {
      id: event.id || require('uuid').v4(),
      type: event.type,
      source: 'user-service',
      data: event.data,
      timestamp: new Date().toISOString(),
      correlationId: event.correlationId,
      metadata: event.metadata,
    };
    
    return this.publish(`user.${event.type}`, message);
  }
  
  async publishEnrollmentEvent(event: any): Promise<boolean> {
    const message: EventMessage = {
      id: event.id || require('uuid').v4(),
      type: event.type,
      source: 'user-service',
      data: event.data,
      timestamp: new Date().toISOString(),
      correlationId: event.correlationId,
      metadata: event.metadata,
    };
    
    return this.publish(`enrollment.${event.type}`, message);
  }
}

// Event consumer class
export class EventConsumer {
  private exchange: string;
  private queue: string;
  private channel: Channel;
  
  constructor(
    queue: string = rabbitmqConfig.queue,
    exchange: string = rabbitmqConfig.exchange,
    channel: Channel = consumeChannel
  ) {
    this.exchange = exchange;
    this.queue = queue;
    this.channel = channel;
  }
  
  async setupQueue(routingKeys: string[]): Promise<void> {
    try {
      // Assert queue
      await this.channel.assertQueue(this.queue, {
        durable: true,
        autoDelete: false,
        exclusive: false,
      });
      
      // Bind queue to exchange with routing keys
      for (const routingKey of routingKeys) {
        await this.channel.bindQueue(this.queue, this.exchange, routingKey);
        log.debug('Queue bound to routing key', { queue: this.queue, routingKey });
      }
      
      log.info('Queue setup completed', {
        queue: this.queue,
        exchange: this.exchange,
        routingKeys,
      });
    } catch (error) {
      log.error('Failed to setup queue', error, {
        queue: this.queue,
        exchange: this.exchange,
        routingKeys,
      });
      throw error;
    }
  }
  
  async consume(
    handler: (message: EventMessage, routingKey: string) => Promise<void>,
    options?: any
  ): Promise<void> {
    try {
      await this.channel.consume(
        this.queue,
        async (msg) => {
          if (!msg) return;
          
          try {
            const message: EventMessage = JSON.parse(msg.content.toString());
            const routingKey = msg.fields.routingKey;
            
            log.debug('Processing event', {
              messageId: message.id,
              type: message.type,
              routingKey,
            });
            
            await handler(message, routingKey);
            
            // Acknowledge message
            this.channel.ack(msg);
            
            log.debug('Event processed successfully', {
              messageId: message.id,
              type: message.type,
              routingKey,
            });
          } catch (error) {
            log.error('Failed to process event', error, {
              routingKey: msg.fields.routingKey,
            });
            
            // Reject message and requeue
            this.channel.nack(msg, false, true);
          }
        },
        {
          noAck: false,
          ...options,
        }
      );
      
      log.info('Started consuming events', { queue: this.queue });
    } catch (error) {
      log.error('Failed to start consuming events', error, { queue: this.queue });
      throw error;
    }
  }
  
  async stop(): Promise<void> {
    try {
      await this.channel.cancel('');
      log.info('Stopped consuming events', { queue: this.queue });
    } catch (error) {
      log.error('Failed to stop consuming events', error, { queue: this.queue });
      throw error;
    }
  }
}

// Dead letter queue setup
export const setupDeadLetterQueue = async (): Promise<void> => {
  try {
    const dlqName = `${rabbitmqConfig.queue}.dlq`;
    const dlxName = `${rabbitmqConfig.exchange}.dlx`;
    
    // Assert dead letter exchange
    await publishChannel.assertExchange(dlxName, 'topic', {
      durable: true,
      autoDelete: false,
    });
    
    // Assert dead letter queue
    await publishChannel.assertQueue(dlqName, {
      durable: true,
      autoDelete: false,
    });
    
    // Bind dead letter queue to dead letter exchange
    await publishChannel.bindQueue(dlqName, dlxName, '#');
    
    log.info('Dead letter queue setup completed', {
      dlqName,
      dlxName,
    });
  } catch (error) {
    log.error('Failed to setup dead letter queue', error);
    throw error;
  }
};

// Create service instances
export const eventPublisher = new EventPublisher();
export const eventConsumer = new EventConsumer();

// Export channels for direct access
export { connection, publishChannel, consumeChannel };

export default {
  connection,
  publishChannel,
  consumeChannel,
  eventPublisher,
  eventConsumer,
};
