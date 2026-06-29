import Fastify from 'fastify';
import fp from 'fastify-plugin';
import jwtPlugin from '@fastify/jwt';
import { env } from './config/env.js';
import { errorHandler } from './shared/errors/handler.js';
import { registerRequestId } from './shared/middleware/request-id.js';

// Plugins
import helmetPlugin from './plugins/helmet.js';
import corsPlugin from './plugins/cors.js';
import swaggerPlugin from './plugins/swagger.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import metricsPlugin from './plugins/metrics.js';

// Module routes
import authRoutes from './modules/auth/routes.js';
import tenantRoutes from './modules/tenants/routes.js';
import productsRoutes from './modules/products/routes.js';
import inventoryRoutes from './modules/inventory/routes.js';
import customersRoutes from './modules/customers/routes.js';
import ordersRoutes from './modules/orders/routes.js';
import paymentsRoutes from './modules/payments/routes.js';
import ledgerRoutes from './modules/ledger/routes.js';
import subscriptionsRoutes from './modules/subscriptions/routes.js';
import locationsRoutes from './modules/locations/routes.js';
import staffRoutes from './modules/staff/routes.js';
import expensesRoutes from './modules/expenses/routes.js';
import reportingRoutes from './modules/reporting/routes.js';
import invoicingRoutes from './modules/invoicing/routes.js';
import whatsappRoutes from './modules/whatsapp/routes.js';
import onboardingRoutes from './modules/onboarding/routes.js';

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
  void app.register(fp(helmetPlugin));
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
  void app.register(productsRoutes, { prefix: '/v1/products' });
  void app.register(inventoryRoutes, { prefix: '/v1/inventory' });
  void app.register(customersRoutes, { prefix: '/v1/customers' });
  void app.register(ordersRoutes, { prefix: '/v1/orders' });
  void app.register(paymentsRoutes, { prefix: '/v1/payments' });
  void app.register(ledgerRoutes, { prefix: '/v1/ledger' });
  void app.register(subscriptionsRoutes, { prefix: '/v1/subscriptions' });
  void app.register(locationsRoutes,    { prefix: '/v1/locations' });
  void app.register(staffRoutes,        { prefix: '/v1/staff' });
  void app.register(expensesRoutes,     { prefix: '/v1/expenses' });
  void app.register(reportingRoutes,    { prefix: '/v1/reports' });
  void app.register(invoicingRoutes,    { prefix: '/v1/invoices' });
  void app.register(whatsappRoutes,    { prefix: '/v1/whatsapp' });
  void app.register(onboardingRoutes,  { prefix: '/v1/onboarding' });

  return app;
}
