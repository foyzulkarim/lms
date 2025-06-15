import { FastifyInstance } from 'fastify';
import { config } from '../config';

export const registerAuthRoutes = (server: FastifyInstance) => {
  // Login route
  server.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
        },
      },
    },
    handler: async (request, reply) => {
      const { email, password } = request.body as { email: string; password: string };
      
      try {
        const response = await server.inject({
          method: 'POST',
          url: `${config.services.auth}/login`,
          payload: { email, password },
        });

        return JSON.parse(response.payload);
      } catch (err) {
        server.log.error(err);
        throw err;
      }
    },
  });

  // Register route
  server.post('/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password', 'name'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          name: { type: 'string', minLength: 2 },
        },
      },
    },
    handler: async (request, reply) => {
      const { email, password, name } = request.body as {
        email: string;
        password: string;
        name: string;
      };

      try {
        const response = await server.inject({
          method: 'POST',
          url: `${config.services.auth}/register`,
          payload: { email, password, name },
        });

        return JSON.parse(response.payload);
      } catch (err) {
        server.log.error(err);
        throw err;
      }
    },
  });

  // Forgot password route
  server.post('/auth/forgot-password', {
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
    },
    handler: async (request, reply) => {
      const { email } = request.body as { email: string };

      try {
        const response = await server.inject({
          method: 'POST',
          url: `${config.services.auth}/forgot-password`,
          payload: { email },
        });

        return JSON.parse(response.payload);
      } catch (err) {
        server.log.error(err);
        throw err;
      }
    },
  });

  // Reset password route
  server.post('/auth/reset-password', {
    schema: {
      body: {
        type: 'object',
        required: ['token', 'password'],
        properties: {
          token: { type: 'string' },
          password: { type: 'string', minLength: 6 },
        },
      },
    },
    handler: async (request, reply) => {
      const { token, password } = request.body as {
        token: string;
        password: string;
      };

      try {
        const response = await server.inject({
          method: 'POST',
          url: `${config.services.auth}/reset-password`,
          payload: { token, password },
        });

        return JSON.parse(response.payload);
      } catch (err) {
        server.log.error(err);
        throw err;
      }
    },
  });
}; 
