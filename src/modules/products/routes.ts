import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { requireManager } from '../../shared/middleware/auth.js';
import {
  createCategory,
  listCategories,
  createProduct,
  listProducts,
  getProduct,
  updateProduct,
  createVariant,
  updateVariant,
} from './service.js';

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
      const { schema } = request.tenant;
      const category = await createCategory(schema, request.body);
      return reply.status(201).send({ success: true, data: category });
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
    async (request) => {
      const cats = await listCategories(request.tenant.schema);
      return { success: true, data: cats };
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
      const product = await createProduct(request.tenant.schema, request.body);
      return reply.status(201).send({ success: true, data: product });
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
    async (request) => {
      const q = request.query;
      const result = await listProducts(request.tenant.schema, {
        ...(q.page && { page: parseInt(q.page) }),
        ...(q.limit && { limit: parseInt(q.limit) }),
        ...(q.categoryId && { categoryId: q.categoryId }),
        ...(q.isActive !== undefined && { isActive: q.isActive === 'true' }),
        ...(q.search && { search: q.search }),
      });
      return { success: true, data: result };
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
    async (request) => {
      const product = await getProduct(request.tenant.schema, request.params.id);
      return { success: true, data: product };
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
    async (request) => {
      const product = await updateProduct(
        request.tenant.schema,
        request.params.id,
        request.body,
      );
      return { success: true, data: product };
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
            attributes: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const variant = await createVariant(
        request.tenant.schema,
        request.params.id,
        request.body,
      );
      return reply.status(201).send({ success: true, data: variant });
    },
  );

  app.patch<{
    Params: { id: string; vid: string };
    Body: Partial<{
      name: string;
      priceKobo: number;
      costKobo: number;
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
            attributes: { type: ['string', 'null'] },
            isActive: { type: 'boolean' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const variant = await updateVariant(
        request.tenant.schema,
        request.params.id,
        request.params.vid,
        request.body,
      );
      return { success: true, data: variant };
    },
  );
}
