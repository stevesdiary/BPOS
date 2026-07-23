# Backend Best Practices — Pedantic Tasks

This document identifies backend best practices not yet implemented in the BPOS codebase, organized by priority.

---

## Priority 1: Critical (Blocks Production)

### 1.1 Health Check Enhancement
**Current:** `GET /health` returns `{ status: 'ok', environment }` only.
**Required:** DB + Redis + queue status per PRD Section 6.13.

```typescript
// src/app.ts - Enhanced health check
app.get('/health', async (request, reply) => {
  const checks = {
    database: await checkDatabaseHealth(),
    redis: await checkRedisHealth(),
    queues: await checkQueueHealth(),
  };

  const isHealthy = Object.values(checks).every(c => c.status === 'ok');

  return reply
    .status(isHealthy ? 200 : 503)
    .header('Content-Type', 'application/json')
    .send({
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      checks,
    });
});
```

### 1.2 Graceful Shutdown
**Current:** No drain-in-flight-jobs logic for BullMQ workers.
**Required:** PRD Section 6.13 TODO item.

```typescript
// src/server.ts
const gracefulShutdown = async (signal: string) => {
  app.log.info(`Received ${signal}, starting graceful shutdown`);

  // Stop accepting new connections
  await app.close();

  // Drain BullMQ workers
  await Promise.all([
    paymentsWorker.close(),
    notificationsWorker.close(),
    documentsWorker.close(),
    inventoryWorker.close(),
    logisticsWorker.close(),
    subscriptionsWorker.close(),
  ]);

  // Close Redis connection
  await redis.quit();

  app.log.info('Graceful shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

### 1.3 Password Reset Endpoint
**Current:** No forgot-password endpoint exists.
**Required:** Frontend has "forgot password" screen with nothing to call.

```typescript
// src/modules/auth/routes.ts
app.post<{ Body: { email: string; tenantSlug: string } }>(
  '/forgot-password',
  {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    schema: {
      tags: ['Auth'],
      summary: 'Request a password reset email',
      body: {
        type: 'object',
        required: ['email', 'tenantSlug'],
        properties: {
          email: { type: 'string', format: 'email' },
          tenantSlug: { type: 'string' },
        },
      },
    },
  },
  async (request) => {
    const { email, tenantSlug } = request.body;
    // Always return success to prevent email enumeration
    await requestPasswordReset(tenantSlug, email);
    return { success: true, data: { message: 'If the email exists, a reset link has been sent' } };
  }
);

app.post<{ Body: { token: string; newPassword: string } }>(
  '/reset-password',
  {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    schema: {
      tags: ['Auth'],
      summary: 'Reset password using token from email',
      body: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token: { type: 'string' },
          newPassword: { type: 'string', minLength: 8 },
        },
      },
    },
  },
  async (request) => {
    const { token, newPassword } = request.body;
    await resetPassword(token, newPassword);
    return { success: true, data: { message: 'Password reset successful' } };
  }
);
```

---

## Priority 2: High (Security & Reliability)

### 2.1 Termii SMS Integration
**Current:** 4 worker files have TODO stubs instead of real sends.
**Files affected:**
- `src/shared/queue/workers/notifications.worker.ts:23,27`
- `src/shared/queue/workers/payments.worker.ts:22`
- `src/shared/queue/workers/inventory.worker.ts:24`
- `src/shared/queue/workers/logistics.worker.ts:37,66`

**Required implementation:**

```typescript
// src/shared/sms/termii.ts
import { env } from '../../config/env.js';

interface TermiiPayload {
  to: string;
  from: string;
  sms: string;
  type: 'plain' | 'unicode';
  channel: 'dnd' | 'generic' | 'whatsapp';
}

export async function sendSMS(to: string, message: string): Promise<void> {
  if (!env.TERMII_API_KEY) {
    console.warn('TERMII_API_KEY not configured, skipping SMS');
    return;
  }

  const payload: TermiiPayload = {
    to,
    from: env.TERMII_SENDER_ID || 'BPOS',
    sms: message,
    type: 'plain',
    channel: 'dnd',
  };

  const response = await fetch('https://api.termii.com/api/sms/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.TERMII_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new ExternalServiceError('Termii', `SMS failed: ${response.status}`);
  }
}
```

### 2.2 Structured Log Drain
**Current:** Pino logs to stdout only.
**Required:** PRD Section 7 NFR - "Structured log drain: ship logs to a persistent store."

**Options:**
1. **Axiom** - Add `pino-axiom` transport
2. **Loki** - Add `pino-loki` transport
3. **Datadog** - Add `pino-datadog` transport

```typescript
// src/app.ts - Production logging
const loggerConfig = {
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  ...(env.NODE_ENV === 'production' && env.AXIOM_TOKEN
    ? {
        transport: {
          target: 'pino-axiom',
          options: {
            url: 'https://api.axiom.co/v1/datasets',
            token: env.AXIOM_TOKEN,
            dataset: 'bpos-production',
          },
        },
      }
    : {}),
};
```

### 2.3 Sentry Integration
**Current:** No exception tracker despite "observability" goals.
**Required:** PRD Definition of Done - "<1% error rate under normal load."

```typescript
// src/plugins/sentry.ts
import fp from 'fastify-plugin';
import * as Sentry from '@sentry/node';
import { env } from '../config/env.js';

async function sentryPlugin(app: FastifyInstance) {
  if (!env.SENTRY_DSN) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });

  app.setErrorHandler((error, request, reply) => {
    Sentry.withScope((scope) => {
      scope.setTag('request_id', request.id);
      scope.setUser({ tenant_id: request.user?.tenantId });
      Sentry.captureException(error);
    });

    // Continue with existing error handler
    return reply.status(error.statusCode || 500).send({
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  });
}
```

### 2.4 Backup Configuration
**Current:** No automated PostgreSQL backups.
**Required:** PRD Section 6 TODO - "Automated PostgreSQL backups on Neon + restore test."

**Neon Configuration:**
1. Enable point-in-time recovery in Neon dashboard
2. Set retention period to 7 days minimum
3. Document restore procedure

---

## Priority 3: Medium (Quality & Maintainability)

### 3.1 Test Coverage for Missing Modules
**Current:** No dedicated tests for 10 modules.
**Required:** PRD Section 6 TODO - "Integration test suite covering the payment → ledger path end-to-end."

**Priority test files to create:**
```
test/integration/
├── auth.test.ts           # Login, refresh, logout, me
├── customers.test.ts      # CRUD operations
├── expenses.test.ts       # Record, list, ledger posting
├── invoicing.test.ts      # Generate, PDF, status transitions
├── locations.test.ts      # CRUD, soft-delete
├── staff.test.ts          # Invite, role changes, deactivation
├── reporting.test.ts      # P&L, best-sellers, CSV exports
├── whatsapp.test.ts       # Session state machine
├── onboarding.test.ts     # Setup checklist
└── shipping.test.ts       # Zones, methods, rates, conditions
```

### 3.2 Response Schema Documentation
**Current:** Most routes return `{ success: true, data: ... }` without OpenAPI schemas.
**Required:** Complete API documentation for frontend contractors.

**High-priority routes to document:**
- `GET /v1/reports/pl` - P&L report response
- `GET /v1/reports/inventory-valuation` - Inventory valuation response
- `POST /v1/orders` - Order creation response
- `POST /v1/payments/initiate` - Payment initiation response
- `GET /v1/ledger/balances` - Account balances response

### 3.3 Consistent Guard Naming
**Current:** Some modules use `readGuard`/`writeGuard`, others use `guard`, others use inline arrays.
**Required:** Consistent patterns across all modules.

**Standardize to:**
```typescript
const readGuard = [requireAuth, resolveTenant, requireFeature('feature:read')];
const writeGuard = [requireAuth, resolveTenant, requireManager, requireFeature('feature:write')];
const adminGuard = [requireAuth, resolveTenant, requireOwner, requireFeature('feature:admin')];
```

### 3.4 Webhook Response Consistency
**Current:** Some webhooks return early with 401, others always return 200, dispatch returns `{ received: boolean }`.
**Required:** Consistent webhook handling per industry best practices.

**Standard:**
- Always return 200 to webhook providers (Paystack, Flutterwave, Meta, TRAKA)
- Log verification failures as warnings
- Return `{ received: true }` or empty 200 for all webhooks

```typescript
// Standard webhook pattern
app.post('/webhook/paystack', async (request, reply) => {
  try {
    const signature = request.headers['x-paystack-signature'] as string;
    const isValid = verifyPaystackSignature(request.body, signature);

    if (!isValid) {
      app.log.warn({ requestId: request.id }, 'Invalid Paystack webhook signature');
      return reply.status(200).send({ received: true });
    }

    await processPaystackEvent(request.body);
    return reply.status(200).send({ received: true });
  } catch (error) {
    app.log.error({ error, requestId: request.id }, 'Paystack webhook processing failed');
    return reply.status(200).send({ received: true });
  }
});
```

### 3.5 Middleware Test Coverage
**Current:** No tests for `requireAuth`, `resolveTenant`, `requireRole`, `requireManager`.
**Required:** Core security middleware should have dedicated tests.

```typescript
// test/unit/middleware/auth.test.ts
describe('requireAuth middleware', () => {
  it('should reject request without Authorization header', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
    });
    expect(response.statusCode).toBe(401);
  });

  it('should reject expired JWT', async () => {
    const expiredToken = signExpiredToken();
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    expect(response.statusCode).toBe(401);
  });

  it('should attach user to request with valid JWT', async () => {
    const token = await getTestToken();
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.json().user).toBeDefined();
  });
});
```

---

## Priority 4: Low (Nice-to-Have)

### 4.1 API Versioning Strategy
**Current:** All routes under `/v1/`.
**Recommendation:** Document versioning strategy for future breaking changes.

### 4.2 Rate Limiting per Tenant
**Current:** Global rate limiting only.
**Recommendation:** Per-tenant rate limiting based on subscription tier.

```typescript
// src/plugins/rate-limit.ts
const tierLimits = {
  starter: { max: 100, timeWindow: '1 minute' },
  growth: { max: 500, timeWindow: '1 minute' },
  enterprise: { max: 2000, timeWindow: '1 minute' },
};

export async function tenantRateLimit(request: FastifyRequest) {
  const tier = request.user?.planTier || 'starter';
  return tierLimits[tier] || tierLimits.starter;
}
```

### 4.3 Request Validation Middleware
**Current:** Validation happens in route schemas.
**Recommendation:** Extract common validation patterns to shared middleware.

```typescript
// src/shared/middleware/validate.ts
export function validateDateRange(query: { from?: string; to?: string }) {
  if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
    throw new ValidationError("'from' must be before 'to'");
  }
}
```

### 4.4 API Changelog
**Current:** No changelog documentation.
**Recommendation:** Maintain `CHANGELOG.md` for API consumers.

### 4.5 OpenAPI Diff in CI
**Current:** No automated API change detection.
**Recommendation:** Add OpenAPI diff tool to detect breaking changes.

```yaml
# .github/workflows/api-diff.yml
- name: Check API diff
  run: |
    npx openapi-diff \
      --base docs/openapi.json \
      --compare \
      --fail-on-breaking
```

---

## Summary

| Priority | Category | Count | Effort |
|----------|----------|-------|--------|
| P1 | Critical | 3 | 2-3 days |
| P2 | High | 4 | 1-2 weeks |
| P3 | Medium | 5 | 2-3 weeks |
| P4 | Low | 5 | Ongoing |
| **Total** | | **17** | **6-8 weeks** |

**Recommended next steps:**
1. Start with P1 items (health check, graceful shutdown, password reset) - blocks production
2. Then P2 items (Termii SMS, logging, Sentry, backups) - security & reliability
3. P3 items can be tackled incrementally alongside feature work
4. P4 items are long-term improvements
