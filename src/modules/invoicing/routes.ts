import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { generateInvoice, getInvoice, listInvoices } from './service.js';

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
    const invoice = await generateInvoice(
      request.tenant.schema,
      request.tenant.tenantId,
      request.body.orderId,
    );
    return reply.status(201).send({ success: true, data: invoice });
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
  }, async (request) => {
    const items = await listInvoices(request.tenant.schema, request.query.orderId);
    return { success: true, data: items };
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
  }, async (request) => {
    const invoice = await getInvoice(request.tenant.schema, request.params.id);
    return { success: true, data: invoice };
  });
}
