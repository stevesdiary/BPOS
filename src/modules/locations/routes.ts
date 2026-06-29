import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { requireManager } from '../../shared/middleware/auth.js';
import {
  listLocations,
  getLocation,
  createLocation,
  updateLocation,
  deactivateLocation,
} from './service.js';

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
  }, async (request) => {
    const items = await listLocations(request.tenant.schema);
    return { success: true, data: items };
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
  }, async (request) => {
    const loc = await getLocation(request.tenant.schema, request.params.id);
    return { success: true, data: loc };
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
    const loc = await createLocation(request.tenant.schema, request.body);
    return reply.status(201).send({ success: true, data: loc });
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
  }, async (request) => {
    const loc = await updateLocation(request.tenant.schema, request.params.id, request.body);
    return { success: true, data: loc };
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
    await deactivateLocation(request.tenant.schema, request.params.id);
    return reply.status(204).send();
  });
}
