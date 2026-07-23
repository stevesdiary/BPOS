import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess, sendCreated } from '../../shared/http/response.js';
import * as controller from './controller.js';

const guard = [requireAuth, resolveTenant, requireFeature('invoicing:generate')];

export default async function invoicingRoutes(app: FastifyInstance) {
  // ─── POST /invoices — generate invoice for an order ─────────────────────────
  app.post<{ Body: { orderId: string } }>('/', {
    preHandler: guard,
    schema: {
      tags: ['Invoicing'],
      summary: 'Generate an invoice for an order',
      description:
        'Creates an invoice record and enqueues async PDF generation. ' +
        'Poll GET /invoices/:id to check when pdfUrl is populated.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['orderId'],
        properties: {
          orderId: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const invoice = await controller.create(ctx, request.body);
    sendCreated(reply, invoice);
  });

  // ─── GET /invoices — list invoices (optionally filter by orderId) ────────────
  app.get<{ Querystring: { orderId?: string } }>('/', {
    preHandler: guard,
    schema: {
      tags: ['Invoicing'],
      summary: 'List invoices',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          orderId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const items = await controller.list(ctx, request.query);
    sendSuccess(reply, items);
  });

  // ─── GET /invoices/:id — get invoice with order details ─────────────────────
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: guard,
    schema: {
      tags: ['Invoicing'],
      summary: 'Get an invoice (with order details and line items)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const invoice = await controller.get(ctx, request.params.id);
    sendSuccess(reply, invoice);
  });
}
