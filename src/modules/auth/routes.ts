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
  requestPasswordReset,
  resetPassword,
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

  // ─── Password Reset ────────────────────────────────────────────────────────

  app.post<{ Body: { tenantSlug: string; email: string } }>(
    '/forgot-password',
    {
      config: {
        rateLimit: { max: 5, timeWindow: '15 minutes' },
      },
      schema: {
        tags: ['Auth'],
        summary: 'Request a password reset email',
        security: [],
        description:
          'Always returns success to prevent email enumeration. ' +
          'If the email exists, a reset link is sent.',
        body: {
          type: 'object',
          required: ['tenantSlug', 'email'],
          properties: {
            tenantSlug: { type: 'string' },
            email: { type: 'string', format: 'email' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const { tenantSlug, email } = request.body;

      const [tenant] = await db
        .select({ id: tenants.id, schemaName: tenants.schemaName })
        .from(tenants)
        .where(eq(tenants.slug, tenantSlug))
        .limit(1);

      if (!tenant) {
        // Still return success to prevent tenant enumeration
        return {
          success: true,
          data: { message: 'If the email exists, a reset link has been sent' },
        };
      }

      const result = await requestPasswordReset(tenant.id, tenant.schemaName, email);

      // In a real implementation, send email here with result.rawToken
      // For now, just log the token (development only)
      if (result) {
        request.log.info(
          { token: result.rawToken, email: result.userEmail },
          'Password reset token generated (dev only — would be sent via email in production)',
        );
      }

      // Always return the same response to prevent email enumeration
      return {
        success: true,
        data: { message: 'If the email exists, a reset link has been sent' },
      };
    },
  );

  app.post<{ Body: { tenantSlug: string; token: string; newPassword: string } }>(
    '/reset-password',
    {
      config: {
        rateLimit: { max: 5, timeWindow: '15 minutes' },
      },
      schema: {
        tags: ['Auth'],
        summary: 'Reset password using token from email',
        security: [],
        description: 'Rate limited: 5 requests per 15 minutes.',
        body: {
          type: 'object',
          required: ['tenantSlug', 'token', 'newPassword'],
          properties: {
            tenantSlug: { type: 'string' },
            token: { type: 'string', minLength: 1 },
            newPassword: { type: 'string', minLength: 8 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const { tenantSlug, token, newPassword } = request.body;

      const [tenant] = await db
        .select({ id: tenants.id, schemaName: tenants.schemaName })
        .from(tenants)
        .where(eq(tenants.slug, tenantSlug))
        .limit(1);

      if (!tenant) {
        throw new NotFoundError('Tenant');
      }

      await resetPassword(tenant.id, tenant.schemaName, token, newPassword);

      return {
        success: true,
        data: { message: 'Password reset successful. Please login with your new password.' },
      };
    },
  );
}
