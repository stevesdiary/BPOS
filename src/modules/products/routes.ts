import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireManager } from '../../shared/middleware/auth.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess, sendCreated } from '../../shared/http/response.js';
import * as controller from './controller.js';

const managerGuard = [requireAuth, resolveTenant, requireManager];
const readGuard = [requireAuth, resolveTenant];

export default async function productsRoutes(app: FastifyInstance) {
  // ─── Categories ────────────────────────────────────────────────────────────

  app.post<{ Body: { name: string; parentId?: string } }>(
    '/categories',
    {
      preHandler: managerGuard,
      schema: {
        tags: ['Products'],
        summary: 'Create a product category',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1 },
            parentId: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const category = await controller.createCategoryHandler(ctx, request.body);
      sendCreated(reply, category);
    },
  );

  app.get(
    '/categories',
    {
      preHandler: readGuard,
      schema: {
        tags: ['Products'],
        summary: 'List all product categories',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const cats = await controller.listCategoriesHandler(ctx);
      sendSuccess(reply, cats);
    },
  );

  // ─── Products ──────────────────────────────────────────────────────────────

  app.post<{
    Body: {
      name: string;
      description?: string;
      categoryId?: string;
      imageUrl?: string;
    };
  }>(
    '/',
    {
      preHandler: managerGuard,
      schema: {
        tags: ['Products'],
        summary: 'Create a product',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            categoryId: { type: 'string' },
            imageUrl: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const product = await controller.createProductHandler(ctx, request.body);
      sendCreated(reply, product);
    },
  );

  app.get<{
    Querystring: {
      page?: string;
      limit?: string;
      categoryId?: string;
      isActive?: string;
      search?: string;
    };
  }>(
    '/',
    {
      preHandler: readGuard,
      schema: {
        tags: ['Products'],
        summary: 'List products (paginated)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            limit: { type: 'string' },
            categoryId: { type: 'string' },
            isActive: { type: 'string', enum: ['true', 'false'] },
            search: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const result = await controller.listProductsHandler(ctx, request.query);
      sendSuccess(reply, result);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/:id',
    {
      preHandler: readGuard,
      schema: {
        tags: ['Products'],
        summary: 'Get a product with its variants',
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
      const product = await controller.getProductHandler(ctx, request.params.id);
      sendSuccess(reply, product);
    },
  );

  app.patch<{
    Params: { id: string };
    Body: Partial<{
      name: string;
      description: string | null;
      categoryId: string | null;
      imageUrl: string | null;
      isActive: boolean;
    }>;
  }>(
    '/:id',
    {
      preHandler: managerGuard,
      schema: {
        tags: ['Products'],
        summary: 'Update a product',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            description: { type: ['string', 'null'] },
            categoryId: { type: ['string', 'null'] },
            imageUrl: { type: ['string', 'null'] },
            isActive: { type: 'boolean' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const product = await controller.updateProductHandler(ctx, request.params.id, request.body);
      sendSuccess(reply, product);
    },
  );

  // ─── Variants ──────────────────────────────────────────────────────────────

  app.post<{
    Params: { id: string };
    Body: {
      sku: string;
      name: string;
      priceKobo: number;
      costKobo?: number;
      taxRateBps?: number;
      attributes?: string;
    };
  }>(
    '/:id/variants',
    {
      preHandler: managerGuard,
      schema: {
        tags: ['Products'],
        summary: 'Add a variant to a product',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['sku', 'name', 'priceKobo'],
          properties: {
            sku: { type: 'string', minLength: 1 },
            name: { type: 'string', minLength: 1 },
            priceKobo: { type: 'integer', minimum: 0 },
            costKobo: { type: 'integer', minimum: 0 },
            taxRateBps: { type: 'integer', minimum: 0, maximum: 10000,
              description: 'Tax rate in basis points (10000 = 100%). Nigeria VAT = 750.' },
            attributes: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const variant = await controller.createVariantHandler(ctx, request.params.id, request.body);
      sendCreated(reply, variant);
    },
  );

  app.patch<{
    Params: { id: string; vid: string };
    Body: Partial<{
      name: string;
      priceKobo: number;
      costKobo: number;
      taxRateBps: number | null;
      attributes: string | null;
      isActive: boolean;
    }>;
  }>(
    '/:id/variants/:vid',
    {
      preHandler: managerGuard,
      schema: {
        tags: ['Products'],
        summary: 'Update a product variant',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'vid'],
          properties: {
            id: { type: 'string' },
            vid: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            priceKobo: { type: 'integer', minimum: 0 },
            costKobo: { type: 'integer', minimum: 0 },
            taxRateBps: { type: ['integer', 'null'], minimum: 0, maximum: 10000 },
            attributes: { type: ['string', 'null'] },
            isActive: { type: 'boolean' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const variant = await controller.updateVariantHandler(
        ctx,
        request.params.id,
        request.params.vid,
        request.body,
      );
      sendSuccess(reply, variant);
    },
  );
}
