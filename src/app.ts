import Fastify from 'fastify';
import fp from 'fastify-plugin';
import jwtPlugin from '@fastify/jwt';
import { env } from './config/env.js';
import { errorHandler } from './shared/errors/handler.js';
import { registerRequestId } from './shared/middleware/request-id.js';

// Plugins
import corsPlugin from './plugins/cors.js';
import swaggerPlugin from './plugins/swagger.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import metricsPlugin from './plugins/metrics.js';

// Module routes
import authRoutes from './modules/auth/routes.js';
import tenantRoutes from './modules/tenants/routes.js';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
      ...(env.NODE_ENV === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
            },
          }
        : {}),
    },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    trustProxy: true,
    ajv: {
      customOptions: {
        removeAdditional: true,
        coerceTypes: false,
        allErrors: false,
      },
    },
  });

  app.setErrorHandler(errorHandler);

  // Core plugins (order matters)
  void app.register(fp(corsPlugin));
  void app.register(fp(rateLimitPlugin));
  void app.register(fp(swaggerPlugin));
  void app.register(fp(metricsPlugin));
  void app.register(jwtPlugin, {
    secret: env.JWT_ACCESS_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_EXPIRY },
  });

  registerRequestId(app);

  // Health check (unauthenticated, not in swagger)
  app.get('/health', { schema: { hide: true } }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  }));

  // Module routes
  void app.register(authRoutes, { prefix: '/v1/auth' });
  void app.register(tenantRoutes, { prefix: '/v1/tenants' });

  return app;
}
