import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { createExpense, listExpenses, getExpense } from './service.js';

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
    const expense = await createExpense(
      request.tenant.schema,
      request.user.sub,
      request.body,
    );
    return reply.status(201).send({ success: true, data: expense });
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
  }, async (request) => {
    const q = request.query;
    const result = await listExpenses(request.tenant.schema, {
      ...(q.page && { page: parseInt(q.page) }),
      ...(q.limit && { limit: parseInt(q.limit) }),
      ...(q.category && { category: q.category }),
      ...(q.locationId && { locationId: q.locationId }),
      ...(q.from && { from: q.from }),
      ...(q.to && { to: q.to }),
    });
    return { success: true, data: result };
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
  }, async (request) => {
    const expense = await getExpense(request.tenant.schema, request.params.id);
    return { success: true, data: expense };
  });
}
