import type { FastifyInstance } from 'fastify';
import { db } from '../../shared/db/client.js';
import { tenants } from '../../shared/db/schema/public.js';
import { eq } from 'drizzle-orm';
import { NotFoundError } from '../../shared/errors/types.js';
import { requireAuth } from '../../shared/middleware/auth.js';
import {
  loginUser,
  refreshAccessToken,
  revokeRefreshToken,
} from './service.js';

const loginBody = {
  type: 'object',
  required: ['tenantSlug', 'email', 'password'],
  properties: {
    tenantSlug: { type: 'string' },
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8 },
  },
  additionalProperties: false,
} as const;

const refreshBody = {
  type: 'object',
  required: ['refreshToken'],
  properties: {
    tenantSlug: { type: 'string' },
    refreshToken: { type: 'string' },
  },
  additionalProperties: false,
} as const;

export default async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { tenantSlug: string; email: string; password: string } }>(
    '/login',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
      schema: {
        tags: ['Auth'],
        summary: 'Authenticate a user and receive tokens',
        body: loginBody,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  accessToken: { type: 'string' },
                  refreshToken: { type: 'string' },
                  user: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      email: { type: 'string' },
                      firstName: { type: 'string' },
                      lastName: { type: 'string' },
                      role: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const { tenantSlug, email, password } = request.body;

      const [tenant] = await db
        .select({ id: tenants.id, schemaName: tenants.schemaName })
        .from(tenants)
        .where(eq(tenants.slug, tenantSlug))
        .limit(1);

      if (!tenant) {
        throw new NotFoundError('Tenant');
      }

      const result = await loginUser(app, tenant.id, tenant.schemaName, email, password);
      return { success: true, data: result };
    },
  );

  app.post<{ Body: { tenantSlug: string; refreshToken: string } }>(
    '/refresh',
    {
      config: {
        rateLimit: { max: 20, timeWindow: '1 minute' },
      },
      schema: {
        tags: ['Auth'],
        summary: 'Exchange a refresh token for a new access token',
        body: refreshBody,
      },
    },
    async (request) => {
      const { tenantSlug, refreshToken } = request.body;

      const [tenant] = await db
        .select({ id: tenants.id, schemaName: tenants.schemaName })
        .from(tenants)
        .where(eq(tenants.slug, tenantSlug))
        .limit(1);

      if (!tenant) {
        throw new NotFoundError('Tenant');
      }

      const accessToken = await refreshAccessToken(
        app,
        tenant.id,
        tenant.schemaName,
        refreshToken,
      );
      return { success: true, data: { accessToken } };
    },
  );

  app.post(
    '/logout',
    {
      preHandler: [requireAuth],
      schema: {
        tags: ['Auth'],
        summary: 'Revoke a refresh token (logout)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const body = request.body as { refreshToken: string };
      await revokeRefreshToken(request.user.tenantId, body.refreshToken);
      return { success: true, data: { message: 'Logged out successfully' } };
    },
  );

  app.get(
    '/me',
    {
      preHandler: [requireAuth],
      schema: {
        tags: ['Auth'],
        summary: 'Get the authenticated user profile',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request) => {
      return {
        success: true,
        data: {
          userId: request.user.userId,
          tenantId: request.user.tenantId,
          email: request.user.email,
          role: request.user.role,
        },
      };
    },
  );
}
