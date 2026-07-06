import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { NG_STATES } from './ng-states.js';
import {
  createShippingZone,
  listShippingZones,
  updateShippingZone,
  deleteShippingZone,
  createShippingMethod,
  listShippingMethods,
  updateShippingMethod,
  addShippingRate,
  listShippingRates,
  deleteShippingRate,
  addFreeShippingCondition,
  listFreeShippingConditions,
  deleteFreeShippingCondition,
  createPickupLocation,
  listPickupLocations,
  updatePickupLocation,
} from './service.js';
import { getAvailableShippingOptions, resolveMethodFee } from './calculator.js';

const managerGuard = [requireAuth, resolveTenant];
const shippingFeature = requireFeature('shipping:manage');

export default async function shippingRoutes(app: FastifyInstance) {

  // ── Utility ──────────────────────────────────────────────────────────────────

  app.get('/states', {
    schema: {
      tags: ['Shipping'],
      summary: 'List valid Nigerian state names for zone/rate configuration',
      security: [{ bearerAuth: [] }],
    },
  }, async () => ({ success: true, data: NG_STATES }));

  // ── Shipping Zones ────────────────────────────────────────────────────────────

  app.post<{ Body: { name: string; states: string[] } }>('/zones', {
    preHandler: [...managerGuard, shippingFeature],
    schema: {
      tags: ['Shipping'],
      summary: 'Create a shipping zone (named group of Nigerian states)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'states'],
        properties: {
          name: { type: 'string' },
          states: { type: 'array', items: { type: 'string' }, minItems: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const zone = await createShippingZone(request.tenant.schema, request.body);
    return reply.status(201).send({ success: true, data: zone });
  });

  app.get('/zones', {
    preHandler: managerGuard,
    schema: {
      tags: ['Shipping'],
      summary: 'List shipping zones',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    return { success: true, data: await listShippingZones(request.tenant.schema) };
  });

  app.patch<{ Params: { id: string }; Body: { name?: string; states?: string[] } }>('/zones/:id', {
    preHandler: [...managerGuard, shippingFeature],
    schema: {
      tags: ['Shipping'],
      summary: 'Update a shipping zone',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          states: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (request, reply) => {
    await updateShippingZone(request.tenant.schema, request.params.id, request.body);
    return reply.send({ success: true });
  });

  app.delete<{ Params: { id: string } }>('/zones/:id', {
    preHandler: [...managerGuard, shippingFeature],
    schema: {
      tags: ['Shipping'],
      summary: 'Delete a shipping zone',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (request, reply) => {
    await deleteShippingZone(request.tenant.schema, request.params.id);
    return reply.send({ success: true });
  });

  // ── Shipping Methods ──────────────────────────────────────────────────────────

  app.post<{
    Body: {
      name: string;
      type: string;
      description?: string;
      estimatedDaysMin?: number;
      estimatedDaysMax?: number;
      flatRateKobo?: number;
      isFreeAlways?: boolean;
    };
  }>('/methods', {
    preHandler: [...managerGuard, shippingFeature],
    schema: {
      tags: ['Shipping'],
      summary: 'Create a shipping method',
      description: [
        'type values: flat_rate | zone_rate | value_rate | weight_rate | automated | free | pick_up.',
        'flat_rate requires flatRateKobo.',
        'free with isFreeAlways=true is always visible at checkout.',
        'free without isFreeAlways uses conditions (POST /shipping/methods/:id/conditions).',
        'zone_rate / value_rate / weight_rate require rates (POST /shipping/methods/:id/rates).',
        'automated uses the configured logistics provider for a live quote.',
        'pick_up always returns NGN 0 — customer must also choose a pick-up location.',
      ].join(' '),
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'type'],
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['flat_rate', 'zone_rate', 'value_rate', 'weight_rate', 'automated', 'free', 'pick_up'] },
          description: { type: 'string' },
          estimatedDaysMin: { type: 'integer', minimum: 0 },
          estimatedDaysMax: { type: 'integer', minimum: 0 },
          flatRateKobo: { type: 'integer', minimum: 0 },
          isFreeAlways: { type: 'boolean' },
          merchantCostKobo: { type: 'integer', minimum: 0, description: 'The courier cost the merchant bears when offering free shipping. Not shown to customers. Used for cost tracking and P&L.' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const method = await createShippingMethod(request.tenant.schema, request.body as never);
    return reply.status(201).send({ success: true, data: method });
  });

  app.get('/methods', {
    preHandler: managerGuard,
    schema: {
      tags: ['Shipping'],
      summary: 'List all shipping methods',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    return { success: true, data: await listShippingMethods(request.tenant.schema) };
  });

  app.patch<{
    Params: { id: string };
    Body: { name?: string; description?: string; estimatedDaysMin?: number; estimatedDaysMax?: number; flatRateKobo?: number; isFreeAlways?: boolean; isActive?: boolean };
  }>('/methods/:id', {
    preHandler: [...managerGuard, shippingFeature],
    schema: {
      tags: ['Shipping'],
      summary: 'Update a shipping method',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          estimatedDaysMin: { type: 'integer' },
          estimatedDaysMax: { type: 'integer' },
          flatRateKobo: { type: 'integer', minimum: 0 },
          isFreeAlways: { type: 'boolean' },
          merchantCostKobo: { type: 'integer', minimum: 0 },
          isActive: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    await updateShippingMethod(request.tenant.schema, request.params.id, request.body);
    return reply.send({ success: true });
  });

  // ── Shipping Rates (zone / value / weight) ────────────────────────────────────

  app.post<{
    Params: { id: string };
    Body: { feeKobo: number; zoneId?: string; minOrderValueKobo?: number; maxOrderValueKobo?: number; minWeightKg?: number; maxWeightKg?: number };
  }>('/methods/:id/rates', {
    preHandler: [...managerGuard, shippingFeature],
    schema: {
      tags: ['Shipping'],
      summary: 'Add a rate row to a zone_rate / value_rate / weight_rate method',
      description: 'For zone_rate: set zoneId (or omit for catch-all). For value_rate: set min/maxOrderValueKobo. For weight_rate: set min/maxWeightKg. maxOrderValueKobo / maxWeightKg can be omitted for "and above" tiers.',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['feeKobo'],
        properties: {
          feeKobo: { type: 'integer', minimum: 0 },
          zoneId: { type: 'string' },
          minOrderValueKobo: { type: 'integer', minimum: 0 },
          maxOrderValueKobo: { type: 'integer', minimum: 0 },
          minWeightKg: { type: 'number', minimum: 0 },
          maxWeightKg: { type: 'number', minimum: 0 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const rate = await addShippingRate(request.tenant.schema, request.params.id, request.body);
    return reply.status(201).send({ success: true, data: rate });
  });

  app.get<{ Params: { id: string } }>('/methods/:id/rates', {
    preHandler: managerGuard,
    schema: {
      tags: ['Shipping'],
      summary: 'List rate rows for a shipping method',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (request) => {
    return { success: true, data: await listShippingRates(request.tenant.schema, request.params.id) };
  });

  app.delete<{ Params: { id: string; rateId: string } }>('/methods/:id/rates/:rateId', {
    preHandler: [...managerGuard, shippingFeature],
    schema: {
      tags: ['Shipping'],
      summary: 'Remove a rate row from a shipping method',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' }, rateId: { type: 'string' } } },
    },
  }, async (request, reply) => {
    await deleteShippingRate(request.tenant.schema, request.params.rateId);
    return reply.send({ success: true });
  });

  // ── Free Shipping Conditions ───────────────────────────────────────────────────

  app.post<{
    Params: { id: string };
    Body: { conditionType: string; thresholdKobo?: number; productId?: string; categoryId?: string; promoCode?: string };
  }>('/methods/:id/conditions', {
    preHandler: [...managerGuard, shippingFeature],
    schema: {
      tags: ['Shipping'],
      summary: 'Add a condition to a free shipping method',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['conditionType'],
        properties: {
          conditionType: { type: 'string', enum: ['always', 'min_order_value', 'product', 'category', 'promo_code'] },
          thresholdKobo: { type: 'integer', minimum: 0 },
          productId: { type: 'string' },
          categoryId: { type: 'string' },
          promoCode: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const condition = await addFreeShippingCondition(
      request.tenant.schema,
      request.params.id,
      request.body as never,
    );
    return reply.status(201).send({ success: true, data: condition });
  });

  app.get<{ Params: { id: string } }>('/methods/:id/conditions', {
    preHandler: managerGuard,
    schema: {
      tags: ['Shipping'],
      summary: 'List conditions for a free shipping method',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (request) => {
    return {
      success: true,
      data: await listFreeShippingConditions(request.tenant.schema, request.params.id),
    };
  });

  app.delete<{ Params: { id: string; conditionId: string } }>('/methods/:id/conditions/:conditionId', {
    preHandler: [...managerGuard, shippingFeature],
    schema: {
      tags: ['Shipping'],
      summary: 'Remove a condition from a free shipping method',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' }, conditionId: { type: 'string' } } },
    },
  }, async (request, reply) => {
    await deleteFreeShippingCondition(request.tenant.schema, request.params.conditionId);
    return reply.send({ success: true });
  });

  // ── Pick-up Locations ─────────────────────────────────────────────────────────

  app.post<{
    Body: {
      name: string;
      locationType: string;
      locationId?: string;
      providerName?: string;
      address: string;
      state?: string;
      phone?: string;
      operatingHours?: string;
    };
  }>('/pickup-locations', {
    preHandler: [...managerGuard, shippingFeature],
    schema: {
      tags: ['Shipping'],
      summary: 'Create a pick-up location (merchant branch or third-party collection point)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'locationType', 'address'],
        properties: {
          name: { type: 'string' },
          locationType: { type: 'string', enum: ['merchant_branch', 'third_party'] },
          locationId: { type: 'string', description: 'Required when locationType=merchant_branch' },
          providerName: { type: 'string', description: 'e.g. gig, dhl, kwik — for third_party' },
          address: { type: 'string' },
          state: { type: 'string' },
          phone: { type: 'string' },
          operatingHours: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const pl = await createPickupLocation(request.tenant.schema, request.body as never);
    return reply.status(201).send({ success: true, data: pl });
  });

  app.get<{ Querystring: { state?: string } }>('/pickup-locations', {
    schema: {
      tags: ['Shipping'],
      summary: 'List active pick-up locations (public — no auth required)',
      description: 'Called by the customer-facing storefront. Filter by Nigerian state with ?state=Lagos.',
      querystring: {
        type: 'object',
        properties: { state: { type: 'string' } },
      },
    },
  }, async (request) => {
    // Extract schema from JWT if present, else require tenantId query param
    // For simplicity, require auth here — storefront can use a public tenant token
    const schema = (request as never as { tenant?: { schema: string } }).tenant?.schema;
    if (!schema) return { success: true, data: [] };
    const locs = await listPickupLocations(schema, {
      ...(request.query.state ? { state: request.query.state } : {}),
      activeOnly: true,
    });
    return { success: true, data: locs };
  });

  app.patch<{
    Params: { id: string };
    Body: { name?: string; address?: string; state?: string; phone?: string; operatingHours?: string; isActive?: boolean };
  }>('/pickup-locations/:id', {
    preHandler: [...managerGuard, shippingFeature],
    schema: {
      tags: ['Shipping'],
      summary: 'Update a pick-up location',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: { type: 'string' },
          state: { type: 'string' },
          phone: { type: 'string' },
          operatingHours: { type: 'string' },
          isActive: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    await updatePickupLocation(request.tenant.schema, request.params.id, request.body);
    return reply.send({ success: true });
  });

  // ── Checkout Calculator ───────────────────────────────────────────────────────

  app.get<{
    Querystring: {
      orderValueKobo: string;
      destinationState?: string;
      totalWeightKg?: string;
      promoCode?: string;
      itemProductIds?: string;
      itemCategoryIds?: string;
    };
  }>('/available', {
    schema: {
      tags: ['Shipping'],
      summary: 'Get available shipping methods and fees for a given checkout context',
      description: 'Called at checkout after the customer provides their delivery details. Returns options sorted cheapest-first. automated methods are excluded — use GET /shipping/quote for live provider quotes.',
      querystring: {
        type: 'object',
        required: ['orderValueKobo'],
        properties: {
          orderValueKobo: { type: 'string', description: 'Cart total in kobo (before delivery fee)' },
          destinationState: { type: 'string', description: 'Nigerian state name — required for zone_rate methods' },
          totalWeightKg: { type: 'string', description: 'Total order weight in kg — required for weight_rate methods' },
          promoCode: { type: 'string' },
          itemProductIds: { type: 'string', description: 'Comma-separated product IDs in cart' },
          itemCategoryIds: { type: 'string', description: 'Comma-separated category IDs in cart' },
        },
      },
    },
  }, async (request) => {
    const q = request.query;
    const schema = (request as never as { tenant?: { schema: string } }).tenant?.schema;
    if (!schema) return { success: true, data: [] };

    const options = await getAvailableShippingOptions(schema, {
      orderValueKobo: parseInt(q.orderValueKobo),
      ...(q.destinationState ? { destinationState: q.destinationState } : {}),
      ...(q.totalWeightKg ? { totalWeightKg: parseFloat(q.totalWeightKg) } : {}),
      ...(q.promoCode ? { promoCode: q.promoCode } : {}),
      ...(q.itemProductIds ? { itemProductIds: q.itemProductIds.split(',') } : {}),
      ...(q.itemCategoryIds ? { itemCategoryIds: q.itemCategoryIds.split(',') } : {}),
    });

    return { success: true, data: options };
  });
}
