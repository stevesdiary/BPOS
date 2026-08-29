import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/client.js';
import { tenants } from '../db/schema/public.js';
import { eq } from 'drizzle-orm';
import { PLAN_ENTITLEMENTS, type FeatureKey } from '../../config/features.js';
import { FeatureGatedError } from '../errors/types.js';
import { cache } from '../cache/client.js';

/**
 * Returns a preHandler that checks whether the tenant's current plan
 * grants access to the given feature.
 *
 * Must be used after resolveTenant — depends on request.tenant being populated.
 */
export function requireFeature(feature: FeatureKey) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const tenantId = request.tenant.tenantId;
    const cacheKey = `tenant:${tenantId}:plan`;

    let plan: string;
    let subscriptionStatus: string;

    const cachedStr = await cache.get(cacheKey);
    if (cachedStr) {
      const cached = JSON.parse(cachedStr);
      plan = cached.planTier;
      subscriptionStatus = cached.subscriptionStatus;
    } else {
      const [tenant] = await db
        .select({ planTier: tenants.planTier, subscriptionStatus: tenants.subscriptionStatus })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (!tenant) {
        throw new FeatureGatedError(feature);
      }

      plan = tenant.planTier;
      subscriptionStatus = tenant.subscriptionStatus;
      await cache.set(cacheKey, JSON.stringify(tenant), 'EX', 1200); // 20 minutes cache
    }

    const entitlements = PLAN_ENTITLEMENTS[plan as keyof typeof PLAN_ENTITLEMENTS];
    const entitlement = entitlements[feature];

    if (!entitlement.allowed) {
      throw new FeatureGatedError(feature);
    }

    // If subscription is lapsed, only allow subscriptions:manage
    if (subscriptionStatus === 'lapsed' && feature !== 'subscriptions:manage') {
      throw new FeatureGatedError(feature);
    }
  };
}
