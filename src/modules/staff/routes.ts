import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { requireManager } from '../../shared/middleware/auth.js';
import {
  listStaff,
  getStaffMember,
  inviteStaff,
  updateStaffMember,
  deactivateStaffMember,
} from './service.js';

const readGuard = [requireAuth, resolveTenant, requireFeature('staff:invite')];
const writeGuard = [requireAuth, resolveTenant, requireFeature('staff:invite'), requireManager];

export default async function staffRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: readGuard,
    schema: {
      tags: ['Staff'],
      summary: 'List all staff members',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const items = await listStaff(request.tenant.schema);
    return { success: true, data: items };
  });

  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: readGuard,
    schema: {
      tags: ['Staff'],
      summary: 'Get a staff member',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request) => {
    const member = await getStaffMember(request.tenant.schema, request.params.id);
    return { success: true, data: member };
  });

  app.post<{
    Body: {
      email: string;
      firstName: string;
      lastName: string;
      role: 'manager' | 'staff' | 'viewer';
      phone?: string;
      locationId?: string;
      temporaryPassword: string;
    };
  }>('/', {
    preHandler: writeGuard,
    schema: {
      tags: ['Staff'],
      summary: 'Invite a staff member',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['email', 'firstName', 'lastName', 'role', 'temporaryPassword'],
        properties: {
          email: { type: 'string', format: 'email' },
          firstName: { type: 'string', minLength: 1 },
          lastName: { type: 'string', minLength: 1 },
          role: { type: 'string', enum: ['manager', 'staff', 'viewer'] },
          phone: { type: 'string' },
          locationId: { type: 'string' },
          temporaryPassword: { type: 'string', minLength: 8 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const member = await inviteStaff(request.tenant.schema, request.body);
    return reply.status(201).send({ success: true, data: member });
  });

  app.patch<{
    Params: { id: string };
    Body: Partial<{
      firstName: string;
      lastName: string;
      phone: string | null;
      role: 'manager' | 'staff' | 'viewer';
      locationId: string | null;
      isActive: boolean;
    }>;
  }>('/:id', {
    preHandler: writeGuard,
    schema: {
      tags: ['Staff'],
      summary: 'Update a staff member',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          firstName: { type: 'string', minLength: 1 },
          lastName: { type: 'string', minLength: 1 },
          phone: { type: ['string', 'null'] },
          role: { type: 'string', enum: ['manager', 'staff', 'viewer'] },
          locationId: { type: ['string', 'null'] },
          isActive: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const member = await updateStaffMember(
      request.tenant.schema,
      request.params.id,
      request.body,
    );
    return { success: true, data: member };
  });

  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: writeGuard,
    schema: {
      tags: ['Staff'],
      summary: 'Deactivate a staff member',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    await deactivateStaffMember(request.tenant.schema, request.params.id, request.user.sub);
    return reply.status(204).send();
  });
}
