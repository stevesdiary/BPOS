import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { requireManager } from '../../shared/middleware/auth.js';
import {
  createOrder,
  listOrders,
  getOrder,
  confirmOrder,
  processOrder,
  fulfillOrder,
  cancelOrder,
} from './service.js';

const readGuard = [requireAuth, resolveTenant, requireFeature('orders:create')];
const managerGuard = [requireAuth, resolveTenant, requireManager, requireFeature('orders:create')];

const orderItemSchema = {
  type: 'object',
  required: ['variantId', 'quantity', 'unitPriceKobo'],
  properties: {
    variantId: { type: 'string' },
    quantity: { type: 'integer', minimum: 1 },
    unitPriceKobo: { type: 'integer', minimum: 0 },
    discountKobo: { type: 'integer', minimum: 0 },
    taxKobo: { type: 'integer', minimum: 0 },
  },
  additionalProperties: false,
} as const;

export default async function ordersRoutes(app: FastifyInstance) {
  // ─── Create draft order ────────────────────────────────────────────────────

  app.post<{
    Body: {
      customerId?: string;
      locationId?: string;
      assignedTo?: string;
      channel?: string;
      items: Array<{
        variantId: string;
        quantity: number;
        unitPriceKobo: number;
        discountKobo?: number;
        taxKobo?: number;
      }>;
      discountKobo?: number;
      taxKobo?: number;
      note?: string;
    };
  }>(
    '/',
    {
      preHandler: readGuard,
      schema: {
        tags: ['Orders'],
        summary: 'Create a draft order',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['items'],
          properties: {
            customerId: { type: 'string' },
            locationId: { type: 'string' },
            assignedTo: { type: 'string' },
            channel: {
              type: 'string',
              enum: ['website', 'pos', 'whatsapp', 'manual'],
              default: 'manual',
            },
            items: {
              type: 'array',
              minItems: 1,
              items: orderItemSchema,
            },
            discountKobo: { type: 'integer', minimum: 0 },
            taxKobo: { type: 'integer', minimum: 0 },
            note: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const order = await createOrder(
        request.tenant.schema,
        request.user.userId,
        request.body,
      );
      return reply.status(201).send({ success: true, data: order });
    },
  );

  // ─── List orders ───────────────────────────────────────────────────────────

  app.get<{
    Querystring: {
      page?: string;
      limit?: string;
      status?: string;
      channel?: string;
      from?: string;
      to?: string;
    };
  }>(
    '/',
    {
      preHandler: readGuard,
      schema: {
        tags: ['Orders'],
        summary: 'List orders (paginated, filterable)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            limit: { type: 'string' },
            status: {
              type: 'string',
              enum: ['draft', 'confirmed', 'processing', 'fulfilled', 'cancelled', 'refunded'],
            },
            channel: { type: 'string' },
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (request) => {
      const q = request.query;
      const result = await listOrders(request.tenant.schema, {
        ...(q.page && { page: parseInt(q.page) }),
        ...(q.limit && { limit: parseInt(q.limit) }),
        ...(q.status && { status: q.status }),
        ...(q.channel && { channel: q.channel }),
        ...(q.from && { from: q.from }),
        ...(q.to && { to: q.to }),
      });
      return { success: true, data: result };
    },
  );

  // ─── Get single order ─────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>(
    '/:id',
    {
      preHandler: readGuard,
      schema: {
        tags: ['Orders'],
        summary: 'Get a single order with its line items',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request) => {
      const order = await getOrder(request.tenant.schema, request.params.id);
      return { success: true, data: order };
    },
  );

  // ─── State transitions ────────────────────────────────────────────────────

  app.post<{ Params: { id: string } }>(
    '/:id/confirm',
    {
      preHandler: managerGuard,
      schema: {
        tags: ['Orders'],
        summary: 'Confirm an order (validates and deducts stock)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request) => {
      const order = await confirmOrder(
        request.tenant.schema,
        request.tenant.tenantId,
        request.params.id,
        request.user.userId,
      );
      return { success: true, data: order };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/:id/process',
    {
      preHandler: readGuard,
      schema: {
        tags: ['Orders'],
        summary: 'Move an order to processing',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request) => {
      const order = await processOrder(request.tenant.schema, request.params.id);
      return { success: true, data: order };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/:id/fulfil',
    {
      preHandler: readGuard,
      schema: {
        tags: ['Orders'],
        summary: 'Mark an order as fulfilled',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request) => {
      const order = await fulfillOrder(request.tenant.schema, request.params.id);
      return { success: true, data: order };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/:id/cancel',
    {
      preHandler: managerGuard,
      schema: {
        tags: ['Orders'],
        summary: 'Cancel an order (restores stock if previously confirmed)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request) => {
      const order = await cancelOrder(
        request.tenant.schema,
        request.params.id,
        request.user.userId,
      );
      return { success: true, data: order };
    },
  );
}
