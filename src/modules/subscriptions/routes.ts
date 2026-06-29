import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { db } from '../../shared/db/client.js';
import { tenants } from '../../shared/db/schema/public.js';
import { eq } from 'drizzle-orm';
import {
  getSubscription,
  initiateSubscription,
  cancelSubscription,
} from './service.js';

const guard = [requireAuth, resolveTenant, requireFeature('subscriptions:manage')];

export default async function subscriptionsRoutes(app: FastifyInstance) {
  // ─── GET /subscriptions ────────────────────────────────────────────────────
  app.get('/', {
    preHandler: guard,
    schema: {
      tags: ['Subscriptions'],
      summary: 'Get current subscription status and plan tier',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const sub = await getSubscription(request.tenant.schema);
    return { success: true, data: sub };
  });

  // ─── POST /subscriptions/initiate ─────────────────────────────────────────
  app.post<{ Body: { planTier: 'entry' | 'growth' | 'enterprise' } }>('/initiate', {
    preHandler: guard,
    schema: {
      tags: ['Subscriptions'],
      summary: 'Initiate a subscription payment via Paystack',
      description:
        'Returns a Paystack authorization URL. On successful payment Paystack fires a ' +
        'charge.success webhook which activates the subscription automatically.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['planTier'],
        properties: {
          planTier: {
            type: 'string',
            enum: ['entry', 'growth', 'enterprise'],
            description: 'Target plan tier',
          },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const [tenant] = await db
      .select({ businessEmail: tenants.businessEmail })
      .from(tenants)
      .where(eq(tenants.id, request.tenant.tenantId))
      .limit(1);

    const email = tenant?.businessEmail ?? request.user.email;

    const result = await initiateSubscription(
      request.tenant.schema,
      request.tenant.tenantId,
      request.body.planTier,
      email,
    );
    return { success: true, data: result };
  });

  // ─── POST /subscriptions/cancel ───────────────────────────────────────────
  app.post('/cancel', {
    preHandler: guard,
    schema: {
      tags: ['Subscriptions'],
      summary: 'Cancel the active subscription',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    await cancelSubscription(request.tenant.schema, request.tenant.tenantId);
    return reply.status(200).send({ success: true });
  });
}
