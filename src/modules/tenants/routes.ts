import type { FastifyInstance } from 'fastify';
import { createTenant } from './service.js';

const createTenantBody = {
  type: 'object',
  required: ['name', 'slug', 'businessEmail', 'ownerFirstName', 'ownerLastName', 'ownerPassword'],
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 100 },
    slug: { type: 'string', minLength: 2, maxLength: 50, pattern: '^[a-z0-9-]+$' },
    businessEmail: { type: 'string', format: 'email' },
    businessPhone: { type: 'string' },
    ownerFirstName: { type: 'string', minLength: 1 },
    ownerLastName: { type: 'string', minLength: 1 },
    ownerPassword: { type: 'string', minLength: 8 },
  },
  additionalProperties: false,
} as const;

export default async function tenantRoutes(app: FastifyInstance) {
  app.post<{
    Body: {
      name: string;
      slug: string;
      businessEmail: string;
      businessPhone?: string;
      ownerFirstName: string;
      ownerLastName: string;
      ownerPassword: string;
    };
  }>(
    '/',
    {
      schema: {
        tags: ['Tenants'],
        summary: 'Provision a new merchant tenant',
        description:
          'Creates a new isolated tenant schema, seeds default data, and registers the owner account.',
        body: createTenantBody,
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  tenantId: { type: 'string' },
                  slug: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await createTenant(request.body);
      return reply.status(201).send({
        success: true,
        data: {
          tenantId: result.tenantId,
          slug: result.slug,
          message: 'Tenant provisioned successfully. Use your business email to log in.',
        },
      });
    },
  );
}
