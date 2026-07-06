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
  getInventoryValuation,
} from './service.js';
import { toCsv } from '../../shared/utils/csv.js';

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

  // ─── P&L export (CSV) ────────────────────────────────────────────────────────
  app.get<{ Querystring: { from: string; to: string } }>('/pl/export', {
    preHandler: [requireAuth, resolveTenant, requireFeature('reporting:pl')],
    schema: {
      tags: ['Reporting'],
      summary: 'Export P&L report as CSV',
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
  }, async (request, reply) => {
    const { from, to } = request.query;
    if (new Date(from) > new Date(to)) throw new ValidationError("'from' must be before 'to'");

    const r = await getPLReport(request.tenant.schema, from, to);
    const naira = (k: number) => (k / 100).toFixed(2);

    const csv = toCsv([
      ['Profit & Loss Report'],
      [`Period: ${from} to ${to}`],
      [],
      ['Category', 'Amount (NGN)'],
      ['Revenue', naira(r.revenueKobo)],
      ['Cost of Goods Sold', naira(r.cogsKobo)],
      ['Gross Profit', naira(r.grossProfitKobo)],
      ['Operating Expenses', naira(r.operatingExpensesKobo)],
      ['Payment Fees', naira(r.paymentFeesKobo)],
      ['Refunds', naira(r.refundsKobo)],
      ['Net Profit', naira(r.netProfitKobo)],
    ]);

    void reply.header('Content-Type', 'text/csv');
    void reply.header('Content-Disposition', `attachment; filename="pl-${from.slice(0, 10)}-${to.slice(0, 10)}.csv"`);
    return reply.send(csv);
  });

  // ─── Staff sales export (CSV) ─────────────────────────────────────────────────
  app.get<{ Querystring: { from?: string; to?: string } }>('/staff-sales/export', {
    preHandler: [requireAuth, resolveTenant, requireFeature('reporting:staff_sales')],
    schema: {
      tags: ['Reporting'],
      summary: 'Export staff sales report as CSV',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
        },
      },
    },
  }, async (request, reply) => {
    const q = request.query;
    const rows = await getStaffSalesReport(request.tenant.schema, {
      ...(q.from && { from: q.from }),
      ...(q.to && { to: q.to }),
    });

    const naira = (k: number) => (k / 100).toFixed(2);
    const csv = toCsv([
      ['Staff Name', 'Order Count', 'Revenue (NGN)'],
      ...rows.map((r) => [
        `${r.firstName} ${r.lastName}`,
        String(r.orderCount),
        naira(r.totalRevenueKobo),
      ]),
    ]);

    void reply.header('Content-Type', 'text/csv');
    void reply.header('Content-Disposition', 'attachment; filename="staff-sales.csv"');
    return reply.send(csv);
  });

  // ─── Inventory valuation ──────────────────────────────────────────────────────
  app.get<{ Querystring: { format?: string } }>('/inventory-valuation', {
    preHandler: [requireAuth, resolveTenant, requireFeature('reporting:margin')],
    schema: {
      tags: ['Reporting'],
      summary: 'Inventory valuation (quantity × cost per variant per location)',
      description: 'Gated to manager+ via reporting:margin feature flag. Cost data is sensitive.',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'csv'], default: 'json' },
        },
      },
    },
  }, async (request, reply) => {
    const rows = await getInventoryValuation(request.tenant.schema);

    if (request.query.format === 'csv') {
      const naira = (k: number) => (k / 100).toFixed(2);
      const totalValue = rows.reduce((s, r) => s + r.totalValueKobo, 0);

      const csv = toCsv([
        ['SKU', 'Product', 'Variant', 'Location', 'Quantity', 'Unit Cost (NGN)', 'Total Value (NGN)'],
        ...rows.map((r) => [
          r.sku,
          r.productName,
          r.variantName,
          r.locationName ?? 'Unassigned',
          String(r.quantityOnHand),
          naira(r.unitCostKobo),
          naira(r.totalValueKobo),
        ]),
        [],
        ['', '', '', 'TOTAL', '', '', naira(totalValue)],
      ]);

      void reply.header('Content-Type', 'text/csv');
      void reply.header('Content-Disposition', 'attachment; filename="inventory-valuation.csv"');
      return reply.send(csv);
    }

    const totalValueKobo = rows.reduce((s, r) => s + r.totalValueKobo, 0);
    return { success: true, data: { rows, totalValueKobo } };
  });
}
