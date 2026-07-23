import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { requireManager } from '../../shared/middleware/auth.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess, sendCreated } from '../../shared/http/response.js';
import * as controller from './controller.js';

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
      const ctx = createContext(request);
      const order = await controller.create(ctx, request.body);
      sendCreated(reply, order);
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
    async (request, reply) => {
      const ctx = createContext(request);
      const result = await controller.list(ctx, request.query);
      sendSuccess(reply, result);
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
    async (request, reply) => {
      const ctx = createContext(request);
      const order = await controller.get(ctx, request.params.id);
      sendSuccess(reply, order);
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
    async (request, reply) => {
      const ctx = createContext(request);
      const order = await controller.confirm(ctx, request.params.id);
      sendSuccess(reply, order);
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
    async (request, reply) => {
      const ctx = createContext(request);
      const order = await controller.process(ctx, request.params.id);
      sendSuccess(reply, order);
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
    async (request, reply) => {
      const ctx = createContext(request);
      const order = await controller.fulfil(ctx, request.params.id);
      sendSuccess(reply, order);
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
    async (request, reply) => {
      const ctx = createContext(request);
      const order = await controller.cancel(ctx, request.params.id);
      sendSuccess(reply, order);
    },
  );
}
