import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess, sendCreated } from '../../shared/http/response.js';
import * as controller from './controller.js';

const guard = [requireAuth, resolveTenant, requireFeature('expenses:track')];

export default async function expensesRoutes(app: FastifyInstance) {
  app.post<{
    Body: {
      description: string;
      amountKobo: number;
      category: string;
      expenseDate: string;
      locationId?: string;
      receiptUrl?: string;
    };
  }>('/', {
    preHandler: guard,
    schema: {
      tags: ['Expenses'],
      summary: 'Record an expense',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['description', 'amountKobo', 'category', 'expenseDate'],
        properties: {
          description: { type: 'string', minLength: 1 },
          amountKobo: { type: 'integer', minimum: 1 },
          category: {
            type: 'string',
            enum: ['rent', 'utilities', 'salaries', 'marketing', 'supplies', 'transport', 'other'],
          },
          expenseDate: { type: 'string', format: 'date-time' },
          locationId: { type: 'string' },
          receiptUrl: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const expense = await controller.create(ctx, request.body);
    sendCreated(reply, expense);
  });

  app.get<{
    Querystring: {
      page?: string;
      limit?: string;
      category?: string;
      locationId?: string;
      from?: string;
      to?: string;
    };
  }>('/', {
    preHandler: guard,
    schema: {
      tags: ['Expenses'],
      summary: 'List expenses (paginated)',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          limit: { type: 'string' },
          category: { type: 'string' },
          locationId: { type: 'string' },
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
        },
      },
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const result = await controller.list(ctx, request.query);
    sendSuccess(reply, result);
  });

  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: guard,
    schema: {
      tags: ['Expenses'],
      summary: 'Get an expense record',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const expense = await controller.get(ctx, request.params.id);
    sendSuccess(reply, expense);
  });
}
