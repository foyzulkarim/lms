import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export const errorHandler = (
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';

  request.log.error({
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
    request: {
      method: request.method,
      url: request.url,
      headers: request.headers,
    },
  });

  reply.status(statusCode).send({
    error: {
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message,
      statusCode,
    },
  });
}; 
