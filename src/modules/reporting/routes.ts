import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { ValidationError } from '../../shared/errors/types.js';
import {
  getPLReport,
  getBestSellers,
  getRevenueByLocation,
  getStaffSalesReport,
} from './service.js';

export default async function reportingRoutes(app: FastifyInstance) {
  // ─── P&L report ─────────────────────────────────────────────────────────────
  app.get<{ Querystring: { from: string; to: string } }>('/pl', {
    preHandler: [requireAuth, resolveTenant, requireFeature('reporting:pl')],
    schema: {
      tags: ['Reporting'],
      summary: 'Profit & Loss report (derived from ledger)',
      description:
        'All figures derived from journal entries for the period. ' +
        'Revenue = account 4000 credits. Expenses = accounts 5000/5100/5200/5300 debits.',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        required: ['from', 'to'],
        properties: {
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
        },
      },
    },
  }, async (request) => {
    const { from, to } = request.query;
    if (new Date(from) > new Date(to)) {
      throw new ValidationError("'from' must be before 'to'");
    }
    const report = await getPLReport(request.tenant.schema, from, to);
    return { success: true, data: report };
  });

  // ─── Best-selling products ───────────────────────────────────────────────────
  app.get<{ Querystring: { from?: string; to?: string; limit?: string } }>('/best-sellers', {
    preHandler: [requireAuth, resolveTenant, requireFeature('reporting:pl')],
    schema: {
      tags: ['Reporting'],
      summary: 'Best-selling products by quantity sold',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
          limit: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const q = request.query;
    const rows = await getBestSellers(request.tenant.schema, {
      ...(q.from && { from: q.from }),
      ...(q.to && { to: q.to }),
      ...(q.limit && { limit: parseInt(q.limit) }),
    });
    return { success: true, data: rows };
  });

  // ─── Revenue by location ─────────────────────────────────────────────────────
  app.get<{ Querystring: { from?: string; to?: string } }>('/revenue-by-location', {
    preHandler: [requireAuth, resolveTenant, requireFeature('reporting:revenue_by_location')],
    schema: {
      tags: ['Reporting'],
      summary: 'Revenue breakdown by location',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
        },
      },
    },
  }, async (request) => {
    const q = request.query;
    const rows = await getRevenueByLocation(request.tenant.schema, {
      ...(q.from && { from: q.from }),
      ...(q.to && { to: q.to }),
    });
    return { success: true, data: rows };
  });

  // ─── Staff sales report ──────────────────────────────────────────────────────
  app.get<{ Querystring: { from?: string; to?: string } }>('/staff-sales', {
    preHandler: [requireAuth, resolveTenant, requireFeature('reporting:staff_sales')],
    schema: {
      tags: ['Reporting'],
      summary: 'Sales performance by staff member',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
        },
      },
    },
  }, async (request) => {
    const q = request.query;
    const rows = await getStaffSalesReport(request.tenant.schema, {
      ...(q.from && { from: q.from }),
      ...(q.to && { to: q.to }),
    });
    return { success: true, data: rows };
  });
}
