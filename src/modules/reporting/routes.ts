import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess, sendCsv } from '../../shared/http/response.js';
import * as controller from './controller.js';

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
  }, async (request, reply) => {
    const ctx = createContext(request);
    const report = await controller.getPL(ctx, request.query.from, request.query.to);
    sendSuccess(reply, report);
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
  }, async (request, reply) => {
    const ctx = createContext(request);
    const rows = await controller.getBestSellers(ctx, request.query);
    sendSuccess(reply, rows);
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
  }, async (request, reply) => {
    const ctx = createContext(request);
    const rows = await controller.getRevenueByLocation(ctx, request.query);
    sendSuccess(reply, rows);
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
  }, async (request, reply) => {
    const ctx = createContext(request);
    const rows = await controller.getStaffSales(ctx, request.query);
    sendSuccess(reply, rows);
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
    const ctx = createContext(request);
    const csv = await controller.exportPL(ctx, request.query.from, request.query.to);
    sendCsv(reply, csv, `pl-${request.query.from.slice(0, 10)}-${request.query.to.slice(0, 10)}.csv`);
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
    const ctx = createContext(request);
    const csv = await controller.exportStaffSales(ctx, request.query);
    sendCsv(reply, csv, 'staff-sales.csv');
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
    const ctx = createContext(request);

    if (request.query.format === 'csv') {
      const csv = await controller.exportInventoryValuation(ctx);
      sendCsv(reply, csv, 'inventory-valuation.csv');
      return;
    }

    const rows = await controller.getInventoryValuation(ctx);
    const totalValueKobo = rows.reduce((s, r) => s + r.totalValueKobo, 0);
    sendSuccess(reply, { rows, totalValueKobo });
  });
}
