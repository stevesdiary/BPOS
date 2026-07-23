import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess, sendCreated } from '../../shared/http/response.js';
import * as controller from './controller.js';

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
      consentGivenAt?: string;
      consentSource?: string;
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
            consentGivenAt: { type: 'string', format: 'date-time',
              description: 'NDPR: ISO 8601 timestamp when customer consented to data collection' },
            consentSource: { type: 'string',
              enum: ['pos_signup', 'whatsapp_chat', 'web_checkout', 'manual'],
              description: 'NDPR: how consent was obtained' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const customer = await controller.create(ctx, request.body);
      sendCreated(reply, customer);
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
    async (request, reply) => {
      const ctx = createContext(request);
      const result = await controller.list(ctx, request.query);
      sendSuccess(reply, result);
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
    async (request, reply) => {
      const ctx = createContext(request);
      const customer = await controller.get(ctx, request.params.id);
      sendSuccess(reply, customer);
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
      consentGivenAt: string | null;
      consentSource: string | null;
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
            consentGivenAt: { type: ['string', 'null'], format: 'date-time' },
            consentSource: { type: ['string', 'null'], enum: ['pos_signup', 'whatsapp_chat', 'web_checkout', 'manual', null] },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const customer = await controller.update(ctx, request.params.id, request.body);
      sendSuccess(reply, customer);
    },
  );
}
