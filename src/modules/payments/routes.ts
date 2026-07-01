import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { paystackGateway } from '../../shared/payments/paystack.js';
import { flutterwaveGateway } from '../../shared/payments/flutterwave.js';
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

    // ─── POST /payments/webhook/flutterwave ─────────────────────────────────
    scope.post(
      '/webhook/flutterwave',
      {
        schema: {
          tags: ['Payments'],
          summary: 'Flutterwave webhook receiver',
          description: 'Receives Flutterwave charge.completed events. Validates verif-hash header.',
        },
      },
      async (request, reply) => {
        const rawBody = (request as unknown as WebhookRequest).rawBody ?? '';
        const signature = (request.headers['verif-hash'] as string | undefined) ?? '';

        if (!flutterwaveGateway.validateWebhookSignature(rawBody, signature)) {
          return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature' } });
        }

        const payload = request.body as { event: string; data: { txRef?: string; tx_ref?: string; metadata?: Record<string, unknown>; id?: number; status?: string; amount?: number; app_fee?: number; flw_ref?: string; created_at?: string } };

        const meta = (payload.data?.metadata ?? {}) as Record<string, unknown>;
        const schemaName = (meta['schemaName'] as string | undefined) ?? '';
        if (!schemaName) return reply.send({ success: true });

        // Normalise Flutterwave event → shared handler
        // charge.completed → charge.success; other events silently acknowledged
        if (payload.event === 'charge.completed' && payload.data?.status === 'successful') {
          const reference = payload.data.txRef ?? payload.data.tx_ref ?? '';
          await handlePaystackWebhook(schemaName, 'charge.success', {
            id: payload.data.id ?? 0,
            reference,
            amount: Math.round((payload.data.amount ?? 0) * 100),  // NGN → kobo
            fees: Math.round((payload.data.app_fee ?? 0) * 100),
            status: 'success',
            metadata: meta as { orderId?: string; schemaName?: string },
          });
        }

        return reply.send({ success: true });
      },
    );
  });
}
