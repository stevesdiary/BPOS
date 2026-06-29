import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireManager } from '../../shared/middleware/auth.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import {
  listInventory,
  receiveStock,
  adjustStock,
  listMovements,
  getLowStock,
} from './service.js';

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
    async (request) => {
      const items = await listInventory(request.tenant.schema, request.query);
      return { success: true, data: items };
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
      const result = await receiveStock(
        request.tenant.schema,
        request.user.userId,
        request.body,
      );
      return reply.status(201).send({ success: true, data: result });
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
      const result = await adjustStock(
        request.tenant.schema,
        request.user.userId,
        request.body,
      );
      return reply.status(200).send({ success: true, data: result });
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
    async (request) => {
      const q = request.query;
      const result = await listMovements(request.tenant.schema, {
        ...(q.variantId && { variantId: q.variantId }),
        ...(q.from && { from: q.from }),
        ...(q.to && { to: q.to }),
        ...(q.page && { page: parseInt(q.page) }),
        ...(q.limit && { limit: parseInt(q.limit) }),
      });
      return { success: true, data: result };
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
    async (request) => {
      const items = await getLowStock(request.tenant.schema, request.query.locationId);
      return { success: true, data: items };
    },
  );
}
