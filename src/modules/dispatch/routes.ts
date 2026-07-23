import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { requireManager } from '../../shared/middleware/auth.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess } from '../../shared/http/response.js';
import * as controller from './controller.js';
import type { LogisticsWebhookPayload } from './service.js';

export default async function dispatchRoutes(app: FastifyInstance) {
  // ─── Configure logistics provider ──────────────────────────────────────────

  app.post<{
    Body: {
      provider: string;
      apiKey: string;
      webhookSecret: string;
      baseUrl?: string;
    };
  }>(
    '/configure',
    {
      preHandler: [requireAuth, resolveTenant, requireFeature('logistics:dispatch'), requireManager],
      schema: {
        tags: ['Dispatch'],
        summary: 'Configure logistics provider for this tenant',
        description:
          'Store encrypted API key + webhook secret for a logistics provider (e.g. traka). ' +
          'For TRAKA: the merchant must first register on TRAKA, get approved, and create an API key. ' +
          'BPOS stores the key encrypted — it is never returned in plaintext.',
        body: {
          type: 'object',
          required: ['provider', 'apiKey', 'webhookSecret'],
          properties: {
            provider: { type: 'string', enum: ['traka', 'sendstack', 'gig', 'dhl', 'kwik', 'generic'], description: 'Logistics provider name' },
            apiKey: { type: 'string', minLength: 10, description: 'Provider API key (stored encrypted)' },
            webhookSecret: { type: 'string', minLength: 8, description: 'Shared secret for webhook HMAC verification' },
            baseUrl: { type: 'string', description: 'Optional override for the provider base URL' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              provider: { type: 'string' },
              webhookUrl: { type: 'string', description: 'Register this URL as your webhook endpoint in the provider dashboard' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const result = await controller.configure(ctx, request.body);
      sendSuccess(reply, result);
    },
  );

  // ─── Get dispatch config (key masked) ──────────────────────────────────────

  app.get(
    '/config',
    {
      preHandler: [requireAuth, resolveTenant, requireFeature('logistics:dispatch')],
      schema: {
        tags: ['Dispatch'],
        summary: 'Get current logistics provider configuration',
        response: {
          200: {
            type: 'object',
            nullable: true,
            properties: {
              providerName: { type: 'string' },
              config: { type: 'object', additionalProperties: true },
              apiKey: { type: 'string', description: 'Always masked as ****' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const config = await controller.getConfig(ctx);
      sendSuccess(reply, config);
    },
  );

  // ─── Get shipping quote ────────────────────────────────────────────────────

  app.post<{
    Body: {
      pickupAddress: string;
      deliveryAddress: string;
      weightKg: number;
    };
  }>(
    '/quote',
    {
      preHandler: [requireAuth, resolveTenant, requireFeature('logistics:dispatch')],
      schema: {
        tags: ['Dispatch'],
        summary: 'Get a shipping fee quote',
        body: {
          type: 'object',
          required: ['pickupAddress', 'deliveryAddress', 'weightKg'],
          properties: {
            pickupAddress: { type: 'string' },
            deliveryAddress: { type: 'string' },
            weightKg: { type: 'number', minimum: 0.1 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              feeKobo: { type: 'integer', description: 'Total delivery fee in kobo' },
              estimatedMinutes: { type: 'integer' },
              providerReference: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const result = await controller.quote(ctx, request.body);
      sendSuccess(reply, result);
    },
  );

  // ─── Dispatch an order ─────────────────────────────────────────────────────

  app.post<{
    Params: { orderId: string };
    Body: {
      pickupAddress: string;
      recipientName: string;
      recipientPhone: string;
      weightKg: number;
    };
  }>(
    '/:orderId/dispatch',
    {
      preHandler: [requireAuth, resolveTenant, requireFeature('logistics:dispatch'), requireManager],
      schema: {
        tags: ['Dispatch'],
        summary: 'Dispatch an order via the configured logistics provider',
        description:
          'Order must be in PROCESSING status and have a deliveryAddress set. ' +
          'On success the order transitions to DISPATCHED.',
        params: {
          type: 'object',
          required: ['orderId'],
          properties: { orderId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['pickupAddress', 'recipientName', 'recipientPhone', 'weightKg'],
          properties: {
            pickupAddress: { type: 'string' },
            recipientName: { type: 'string' },
            recipientPhone: { type: 'string', description: 'E.164 format e.g. +2348012345678' },
            weightKg: { type: 'number', minimum: 0.1 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              trackingNumber: { type: 'string' },
              logisticsReference: { type: 'string' },
              estimatedDeliveryAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const result = await controller.dispatch(ctx, request.params.orderId, request.body);
      sendSuccess(reply, result);
    },
  );

  // ─── Track shipment ────────────────────────────────────────────────────────

  app.get<{ Params: { orderId: string } }>(
    '/:orderId/track',
    {
      preHandler: [requireAuth, resolveTenant, requireFeature('logistics:dispatch')],
      schema: {
        tags: ['Dispatch'],
        summary: 'Get live tracking status for a dispatched order',
        params: {
          type: 'object',
          required: ['orderId'],
          properties: { orderId: { type: 'string' } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              location: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const result = await controller.track(ctx, request.params.orderId);
      sendSuccess(reply, result);
    },
  );

  // ─── Inbound webhook from logistics provider ───────────────────────────────

  await app.register(async (webhookPlugin) => {
    webhookPlugin.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => done(null, body),
    );

    webhookPlugin.post<{
      Params: { provider: string; tenantId: string };
      Body: Buffer;
    }>(
      '/webhook/:provider/:tenantId',
      {
        schema: {
          tags: ['Dispatch'],
          hide: true,
          params: {
            type: 'object',
            required: ['provider', 'tenantId'],
            properties: {
              provider: { type: 'string' },
              tenantId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const signature = (request.headers['x-logistics-signature'] as string | undefined) ?? '';
        const rawBody = request.body as Buffer;
        let payload: LogisticsWebhookPayload;

        try {
          payload = JSON.parse(rawBody.toString('utf8')) as LogisticsWebhookPayload;
        } catch {
          return reply.code(400).send({ error: 'Invalid JSON body' });
        }

        await controller.handleWebhook(
          rawBody,
          signature,
          request.params.provider,
          request.params.tenantId,
          payload,
        );
        return reply.code(200).send({ received: true });
      },
    );
  });
}
