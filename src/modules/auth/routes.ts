import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { sendSuccess } from '../../shared/http/response.js';
import * as controller from './controller.js';

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
    async (request, reply) => {
      const result = await controller.login(app, request.body);
      sendSuccess(reply, result);
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
    async (request, reply) => {
      const result = await controller.refresh(app, request.body);
      sendSuccess(reply, result);
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
    async (request, reply) => {
      const body = request.body as { refreshToken: string };
      const result = await controller.logout(request.user.tenantId, body.refreshToken);
      sendSuccess(reply, result);
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
    async (request, reply) => {
      const result = controller.me(request.user);
      sendSuccess(reply, result);
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
    async (request, reply) => {
      const result = await controller.forgotPassword(request.body, request.log);
      sendSuccess(reply, result);
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
    async (request, reply) => {
      const result = await controller.reset(request.body);
      sendSuccess(reply, result);
    },
  );
}
