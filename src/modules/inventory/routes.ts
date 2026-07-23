import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireManager } from '../../shared/middleware/auth.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess, sendCreated } from '../../shared/http/response.js';
import * as controller from './controller.js';

const readGuard = [requireAuth, resolveTenant, requireFeature('inventory:track')];
const writeGuard = [requireAuth, resolveTenant, requireManager, requireFeature('inventory:track')];

export default async function inventoryRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { locationId?: string; variantId?: string };
  }>(
    '/',
    {
      preHandler: readGuard,
      schema: {
        tags: ['Inventory'],
        summary: 'List inventory levels',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            locationId: { type: 'string' },
            variantId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const data = await controller.list(ctx, request.query);
      sendSuccess(reply, data);
    },
  );

  app.post<{
    Body: {
      variantId: string;
      locationId: string;
      quantity: number;
      note?: string;
    };
  }>(
    '/receive',
    {
      preHandler: writeGuard,
      schema: {
        tags: ['Inventory'],
        summary: 'Receive stock into a location',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['variantId', 'locationId', 'quantity'],
          properties: {
            variantId: { type: 'string' },
            locationId: { type: 'string' },
            quantity: { type: 'integer', minimum: 1 },
            note: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const data = await controller.receive(ctx, request.body);
      sendCreated(reply, data);
    },
  );

  app.post<{
    Body: {
      variantId: string;
      locationId: string;
      quantity: number;
      note?: string;
    };
  }>(
    '/adjust',
    {
      preHandler: writeGuard,
      schema: {
        tags: ['Inventory'],
        summary: 'Manually adjust stock (positive = add, negative = write-off)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['variantId', 'locationId', 'quantity'],
          properties: {
            variantId: { type: 'string' },
            locationId: { type: 'string' },
            quantity: { type: 'integer' },
            note: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const data = await controller.adjust(ctx, request.body);
      sendSuccess(reply, data);
    },
  );

  app.get<{
    Querystring: { variantId?: string; from?: string; to?: string; page?: string; limit?: string };
  }>(
    '/movements',
    {
      preHandler: readGuard,
      schema: {
        tags: ['Inventory'],
        summary: 'List stock movements (audit trail)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            variantId: { type: 'string' },
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
            page: { type: 'string' },
            limit: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const data = await controller.movements(ctx, request.query);
      sendSuccess(reply, data);
    },
  );

  app.get<{ Querystring: { locationId?: string } }>(
    '/low-stock',
    {
      preHandler: [requireAuth, resolveTenant, requireFeature('inventory:alerts')],
      schema: {
        tags: ['Inventory'],
        summary: 'List variants at or below their low-stock threshold',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            locationId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const data = await controller.lowStock(ctx, request.query.locationId);
      sendSuccess(reply, data);
    },
  );
}
