import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { getOnboardingStatus } from './service.js';

export default async function onboardingRoutes(app: FastifyInstance) {
  // ─── GET /onboarding — merchant setup checklist ──────────────────────────
  app.get(
    '/',
    {
      preHandler: [requireAuth, resolveTenant],
      schema: {
        tags: ['Onboarding'],
        summary: 'Get guided setup checklist for this merchant',
        description:
          'Returns which onboarding steps are complete and which are pending. ' +
          'Poll this endpoint to drive a guided first-time setup UI.',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  tenantId: { type: 'string' },
                  tenantName: { type: 'string' },
                  planTier: { type: 'string' },
                  completedSteps: { type: 'array', items: { type: 'string' } },
                  pendingSteps: { type: 'array', items: { type: 'string' } },
                  percentComplete: { type: 'number' },
                  isComplete: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const status = await getOnboardingStatus(request.tenant.tenantId, request.tenant.schema);
      return { success: true, data: status };
    },
  );
}
