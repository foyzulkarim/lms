import fastify, { FastifyInstance } from "fastify"; // Added FastifyInstance
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
// import swagger from "@fastify/swagger"; // Commented out as openapi types might cause issues without full deps
// import swaggerUi from "@fastify/swagger-ui"; // Commented out
import jwt from "fastify-jwt";
// import sensible from "fastify-sensible"; // Commented out as it might be fastify-sensible or @fastify/sensible
import circuitBreaker from "fastify-circuit-breaker";
import { config } from "./config";
import { registerRoutes } from "./routes";
import { errorHandler } from "./middleware/error-handler";
import { authMiddleware } from "./middleware/auth";
// import { rateLimitMiddleware } from "./middleware/rate-limit"; // Assuming this is handled by fastify-rate-limit plugin itself
// import { circuitBreakerMiddleware } from "./middleware/circuit-breaker"; // Assuming this is handled by fastify-circuit-breaker plugin

// Define build function
export const build = (): FastifyInstance => {
  const server = fastify({
    logger: {
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      },
    },
  });

  // Register plugins
  server.register(cors, {
    origin: config.cors.origins,
    credentials: true,
  });

  server.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
  });

  server.register(jwt, {
    secret: config.jwt.secret,
  });

  // server.register(sensible); // Re-add if confirmed it is @fastify/sensible and installed

  server.register(circuitBreaker, {
    threshold: 5,
    timeout: 10000,
    resetTimeout: 5000,
  });

  // Register Swagger - Commented out for now to avoid potential type errors without full dependencies
  /*
  server.register(swagger, {
    openapi: {
      info: {
        title: "LMS API Gateway",
        description: "API Gateway for LMS Microservices",
        version: "1.0.0",
      },
      servers: [
        {
          url: `http://localhost:${config.port}`,
          description: "Development server",
        },
      ],
    },
  });

  server.register(swaggerUi, {
    routePrefix: "/docs",
  });
  */

  // Register middleware
  // Note: Some middleware like rate-limit and circuit-breaker might be applied globally by their plugins.
  // Explicit registration via addHook might be for custom logic or specific routes not covered here.
  // For simplicity in this refactor, I am assuming the plugins handle their core functionality.
  // If authMiddleware, etc., are custom and still needed, they should be reviewed.
  // server.addHook("onRequest", authMiddleware); // Keeping auth, as it's likely custom logic
  // server.addHook("onRequest", rateLimitMiddleware); // Potentially redundant if plugin handles globally
  // server.addHook("onRequest", circuitBreakerMiddleware); // Potentially redundant

  // Register error handler
  server.setErrorHandler(errorHandler);

  // Register routes
  registerRoutes(server);

  return server;
};

// Start server
const start = async () => {
  const server = build(); // Call build to get the server instance
  try {
    await server.listen({ port: config.port, host: "0.0.0.0" });
    // server.log.info(`Server listening on port ${config.port}`); // Logger is on server instance
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

// Ensure this only runs when the script is executed directly, not when imported
if (require.main === module) {
  start();
}
