import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { createCustomer, listCustomers, getCustomer, updateCustomer } from './service.js';

const guard = [requireAuth, resolveTenant, requireFeature('customers:manage')];

export default async function customersRoutes(app: FastifyInstance) {
  app.post<{
    Body: {
      firstName: string;
      lastName?: string;
      email?: string;
      phone?: string;
      address?: string;
      note?: string;
    };
  }>(
    '/',
    {
      preHandler: guard,
      schema: {
        tags: ['Customers'],
        summary: 'Create a customer record',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['firstName'],
          properties: {
            firstName: { type: 'string', minLength: 1 },
            lastName: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            address: { type: 'string' },
            note: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const customer = await createCustomer(request.tenant.schema, request.body);
      return reply.status(201).send({ success: true, data: customer });
    },
  );

  app.get<{ Querystring: { page?: string; limit?: string; search?: string } }>(
    '/',
    {
      preHandler: guard,
      schema: {
        tags: ['Customers'],
        summary: 'List customers (paginated, searchable)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            limit: { type: 'string' },
            search: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const q = request.query;
      const result = await listCustomers(request.tenant.schema, {
        ...(q.page && { page: parseInt(q.page) }),
        ...(q.limit && { limit: parseInt(q.limit) }),
        ...(q.search && { search: q.search }),
      });
      return { success: true, data: result };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/:id',
    {
      preHandler: guard,
      schema: {
        tags: ['Customers'],
        summary: 'Get a customer record',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request) => {
      const customer = await getCustomer(request.tenant.schema, request.params.id);
      return { success: true, data: customer };
    },
  );

  app.patch<{
    Params: { id: string };
    Body: Partial<{
      firstName: string;
      lastName: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
      note: string | null;
    }>;
  }>(
    '/:id',
    {
      preHandler: guard,
      schema: {
        tags: ['Customers'],
        summary: 'Update a customer record',
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
            lastName: { type: ['string', 'null'] },
            email: { type: ['string', 'null'], format: 'email' },
            phone: { type: ['string', 'null'] },
            address: { type: ['string', 'null'] },
            note: { type: ['string', 'null'] },
          },
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const customer = await updateCustomer(
        request.tenant.schema,
        request.params.id,
        request.body,
      );
      return { success: true, data: customer };
    },
  );
}
