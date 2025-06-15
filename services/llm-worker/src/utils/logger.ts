import winston from 'winston';
import { config } from '../config';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  config.monitoring.logFormat === 'json' 
    ? winston.format.json()
    : winston.format.simple()
);

export const logger = winston.createLogger({
  level: config.monitoring.logLevel,
  format: logFormat,
  defaultMeta: { 
    service: 'llm-worker',
    workerId: config.worker.id,
    environment: config.nodeEnv 
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ],
});

// Add file transport in production
if (config.nodeEnv === 'production') {
  logger.add(new winston.transports.File({ 
    filename: 'logs/error.log', 
    level: 'error' 
  }));
  logger.add(new winston.transports.File({ 
    filename: 'logs/combined.log' 
  }));
}

export const createJobLogger = (jobId: string, jobType: string) => {
  return logger.child({ 
    jobId, 
    jobType,
    workerId: config.worker.id 
  });
};
