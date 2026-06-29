import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import {
  listLedgerAccounts,
  listJournalEntries,
  getAccountBalances,
  getWalletBalance,
} from './service.js';

export default async function ledgerRoutes(fastify: FastifyInstance) {
  const guard = [requireAuth, resolveTenant, requireFeature('ledger:view')];

  // GET /ledger/accounts — chart of accounts
  fastify.get(
    '/accounts',
    {
      preHandler: guard,
      schema: {
        tags: ['Ledger'],
        summary: 'List chart of accounts',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'array' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const accounts = await listLedgerAccounts(request.tenant.schema);
      return reply.send({ success: true, data: accounts });
    },
  );

  // GET /ledger/balances — account balances with debit/credit totals
  fastify.get(
    '/balances',
    {
      preHandler: guard,
      schema: {
        tags: ['Ledger'],
        summary: 'Get account balances (derived from ledger)',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'array' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const balances = await getAccountBalances(request.tenant.schema);
      return reply.send({ success: true, data: balances });
    },
  );

  // GET /ledger/wallet — cash account balance
  fastify.get(
    '/wallet',
    {
      preHandler: guard,
      schema: {
        tags: ['Ledger'],
        summary: 'Get platform wallet balance (cash account)',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  balanceKobo: { type: 'number' },
                  balanceNaira: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const balanceKobo = await getWalletBalance(request.tenant.schema);
      return reply.send({
        success: true,
        data: {
          balanceKobo,
          balanceNaira: (balanceKobo / 100).toFixed(2),
        },
      });
    },
  );

  // GET /ledger/entries — paginated journal entries
  fastify.get(
    '/entries',
    {
      preHandler: guard,
      schema: {
        tags: ['Ledger'],
        summary: 'List journal entries',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            limit: { type: 'string' },
            referenceType: { type: 'string' },
            referenceId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  items: { type: 'array' },
                  total: { type: 'number' },
                  page: { type: 'number' },
                  limit: { type: 'number' },
                  totalPages: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const q = request.query as Record<string, string | undefined>;
      const result = await listJournalEntries(request.tenant.schema, {
        ...(q['page'] && { page: parseInt(q['page']) }),
        ...(q['limit'] && { limit: parseInt(q['limit']) }),
        ...(q['referenceType'] && { referenceType: q['referenceType'] }),
        ...(q['referenceId'] && { referenceId: q['referenceId'] }),
      });
      return reply.send({ success: true, data: result });
    },
  );
}
