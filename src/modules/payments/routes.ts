import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { paystackGateway } from '../../shared/payments/paystack.js';
import { initiatePayment, handlePaystackWebhook } from './service.js';
import type { PaystackWebhookData } from './service.js';
import { handleSubscriptionBillingWebhook } from '../subscriptions/service.js';

interface WebhookRequest extends FastifyRequest {
  rawBody: string;
}

export default async function paymentsRoutes(fastify: FastifyInstance) {
  // ─── POST /payments/initiate ──────────────────────────────────────────────
  fastify.post(
    '/initiate',
    {
      preHandler: [requireAuth, resolveTenant, requireFeature('orders:create')],
      schema: {
        tags: ['Payments'],
        summary: 'Initiate a Paystack payment for an order',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['orderId', 'email'],
          properties: {
            orderId: { type: 'string' },
            email: { type: 'string', format: 'email' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  authorizationUrl: { type: 'string' },
                  reference: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { orderId, email } = request.body as { orderId: string; email: string };
      const result = await initiatePayment(
        request.tenant.schema,
        orderId,
        request.user.sub,
        email,
      );
      return reply.code(201).send({ success: true, data: result });
    },
  );

  // ─── POST /payments/webhook/paystack ─────────────────────────────────────
  // Webhook endpoint: unauthenticated, raw body required for HMAC verification.
  // Scoped plugin so the content type parser override only applies here.
  fastify.register(async function webhookScope(scope) {
    // Override JSON parser to capture raw body for signature verification
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => {
        const raw = (body as Buffer).toString('utf-8');
        (_req as WebhookRequest).rawBody = raw;
        try {
          done(null, JSON.parse(raw) as unknown);
        } catch {
          done(new Error('Invalid JSON body'), undefined);
        }
      },
    );

    scope.post(
      '/webhook/paystack',
      {
        schema: {
          tags: ['Payments'],
          summary: 'Paystack webhook receiver',
          description: 'Receives Paystack events. Validates HMAC-SHA512 signature.',
        },
      },
      async (request, reply) => {
        const rawBody = (request as unknown as WebhookRequest).rawBody ?? '';
        const signature = (request.headers['x-paystack-signature'] as string | undefined) ?? '';

        if (!paystackGateway.validateWebhookSignature(rawBody, signature)) {
          return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature' } });
        }

        const payload = request.body as { event: string; data: PaystackWebhookData };

        // Resolve tenant from webhook metadata (set during payment initiation)
        const meta = (payload.data?.metadata ?? {}) as Record<string, unknown>;
        const schemaName = (meta['schemaName'] as string | undefined) ?? '';
        if (!schemaName) {
          // Unknown tenant — acknowledge receipt but take no action
          return reply.send({ success: true });
        }

        // Route: subscription billing events vs order payment events
        if (meta['type'] === 'subscription') {
          const tenantId = (meta['tenantId'] as string | undefined) ?? '';
          const planTier = (meta['planTier'] as string | undefined) ?? '';
          const rawData = payload.data as unknown as Record<string, unknown>;
          const authorization = rawData['authorization'] as Record<string, unknown> | undefined;
          const customer = rawData['customer'] as Record<string, unknown> | undefined;
          await handleSubscriptionBillingWebhook(
            payload.event,
            tenantId,
            schemaName,
            planTier as 'entry' | 'growth' | 'enterprise',
            (authorization?.['authorization_code'] as string | undefined) ?? '',
            (customer?.['customer_code'] as string | undefined) ?? '',
          ).catch(() => {});
        } else {
          await handlePaystackWebhook(schemaName, payload.event, payload.data);
        }

        return reply.send({ success: true });
      },
    );
  });
}
