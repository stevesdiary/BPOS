import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { requireManager } from '../../shared/middleware/auth.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess, sendCreated } from '../../shared/http/response.js';
import * as controller from './controller.js';

const readGuard = [requireAuth, resolveTenant, requireFeature('locations:manage')];
const writeGuard = [requireAuth, resolveTenant, requireFeature('locations:manage'), requireManager];

export default async function locationsRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: readGuard,
    schema: {
      tags: ['Locations'],
      summary: 'List all locations',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const items = await controller.list(ctx);
    sendSuccess(reply, items);
  });

  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: readGuard,
    schema: {
      tags: ['Locations'],
      summary: 'Get a location',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const loc = await controller.get(ctx, request.params.id);
    sendSuccess(reply, loc);
  });

  app.post<{
    Body: {
      name: string;
      address?: string;
      phone?: string;
      isDefault?: boolean;
    };
  }>('/', {
    preHandler: writeGuard,
    schema: {
      tags: ['Locations'],
      summary: 'Create a location',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          address: { type: 'string' },
          phone: { type: 'string' },
          isDefault: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const loc = await controller.create(ctx, request.body);
    sendCreated(reply, loc);
  });

  app.patch<{
    Params: { id: string };
    Body: Partial<{
      name: string;
      address: string | null;
      phone: string | null;
      isDefault: boolean;
      isActive: boolean;
    }>;
  }>('/:id', {
    preHandler: writeGuard,
    schema: {
      tags: ['Locations'],
      summary: 'Update a location',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          address: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'] },
          isDefault: { type: 'boolean' },
          isActive: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const loc = await controller.update(ctx, request.params.id, request.body);
    sendSuccess(reply, loc);
  });

  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: writeGuard,
    schema: {
      tags: ['Locations'],
      summary: 'Deactivate a location',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    await controller.deactivate(ctx, request.params.id);
    reply.status(204).send();
  });
}
