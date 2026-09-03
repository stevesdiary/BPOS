# Admin Portal — Implementation Plan

**Status:** Proposed
**Depends on:** `development` @ `5a180bc`
**Audiences:** business owner (merchant), support team (internal), super-admin (internal)

---

## 1. Context

BPOS has 19 tenant-facing modules and no platform-side administration. `PRD.md` names a
"Platform Admin" persona (§4, Persona 4) whose only implemented capability is receiving
Slack alerts. Three distinct audiences need admin surfaces, and today **none of the two
internal ones can even be represented in the auth model**:

| Audience | Needs | Exists today |
|---|---|---|
| Business owner | Manage own business: team, billing, settings, activity trail | Partially — `staff`, `subscriptions`, `locations`, `reporting`. No audit trail, no billing history, no session control |
| Support (admin) | Cross-tenant read + a narrow set of audited repair actions | **Nothing.** No non-tenant identity can exist |
| Super-admin | Tenant lifecycle, plan control, platform user management, audit | **Nothing** |

There is also a live security gap this plan closes: **`POST /v1/tenants` is
unauthenticated** (`src/modules/tenants/routes.ts` registers no `preHandler`), so any
caller can provision a Postgres schema — both an access-control hole and a
resource-exhaustion vector.

### Decisions taken

- Support gets **read + narrow writes** — a fixed whitelist of repair actions, no
  order/inventory/ledger mutation.
- Support access is **visible to the merchant and actively notified** — it lands in the
  merchant's own audit log and triggers an owner notification when a grant opens.
- Build order: **platform foundation first** (Phase A), because it unblocks both internal
  audiences and closes the `/v1/tenants` hole.

---

## 2. Core architectural decision: a second identity plane

Today every authenticated request is tenant-scoped:

```ts
// src/shared/types/fastify.d.ts
payload: { sub, tid, role: 'owner'|'manager'|'staff'|'viewer', email, type }
// src/shared/middleware/tenant.ts — throws if tid absent
// src/shared/http/context.ts    — reads request.user.tid
```

Platform users cannot be squeezed into this shape, for three reasons:

1. They belong to no tenant, so `tid` would be meaningless or forged.
2. Adding `super_admin` to `userRoleEnum` would mean **any row in any tenant's `users`
   table could be escalated to platform-wide power by a single `UPDATE`**. Unacceptable
   blast radius.
3. One JWT secret minting both tenant and platform tokens turns any tenant-token
   forgery bug into a full platform compromise.

**Therefore: separate table, separate role enum, separate JWT secret, separate audience
claim, separate guard.** The two planes never share a credential.

### New tables (public schema — `src/shared/db/schema/public.ts`)

```
platform_role_enum        'super_admin' | 'admin' | 'support' | 'read_only'

platform_users            id, email (unique), passwordHash, firstName, lastName,
                          role: platform_role_enum, isActive,
                          mfaSecretEncrypted, mfaEnabledAt, lastLoginAt,
                          createdAt, updatedAt

platform_sessions         id, platformUserId FK, tokenHash, tokenPrefix,
                          expiresAt, revokedAt, createdAt
                          — mirrors the refreshTokens design incl. the tokenPrefix
                            index pattern from f0074b6

platform_audit_log        id, actorId, actorEmail, actorRole, action, targetType,
                          targetId, tenantId, reason, ipAddress, userAgent,
                          requestId, metadata jsonb, createdAt
                          — APPEND-ONLY. No update/delete endpoint, ever.

tenant_access_grants      id, platformUserId FK, tenantId FK, scope 'read'|'write',
                          reason (NOT NULL), expiresAt, revokedAt, createdAt
```

`platform_users` is deliberately **not** related to any tenant's `users` table. A person
who is both a merchant and an employee has two separate accounts.

### JWT

```ts
{ sub, role: PlatformRole, email, aud: 'platform', type: 'access' }  // note: no tid
```

Signed with a **new** `JWT_PLATFORM_SECRET` (add to `src/config/env.ts`, required when
`NODE_ENV === 'production'`). Register a second `@fastify/jwt` instance under a namespace
so both key sets coexist:

```ts
// src/app.ts
void app.register(jwtPlugin, {
  secret: env.JWT_PLATFORM_SECRET,
  namespace: 'platform',
  jwtVerify: 'platformJwtVerify',
  jwtSign: 'platformJwtSign',
  sign: { expiresIn: '15m', aud: 'platform' },
});
```

Platform access tokens live **15 minutes**, refresh **8 hours** — versus the tenant
plane's 7 days. Short sessions are the cheapest mitigation for a high-privilege console.

### New middleware — `src/shared/middleware/platform-auth.ts`

- `requirePlatformAuth` — `platformJwtVerify()`, assert `aud === 'platform'`, load the
  user, assert `isActive`, attach `request.platformUser`.
- `requirePlatformPermission(perm)` — config-driven; deliberately mirrors the existing
  `requireFeature` shape in `src/shared/middleware/feature-gate.ts`.
- `requireTenantGrant(scope)` — resolves an active `tenant_access_grants` row for
  (platformUser, `:tenantId` route param) and **populates `request.tenant` with the same
  `{ tenantId, schema }` contract `resolveTenant` produces**.

That last one is the key bridge: because the contract is identical, every existing
tenant-scoped service (`orders`, `payments`, `ledger`, …) is reusable from support
tooling with **zero changes**. No service needs to learn what a platform user is.

### Permissions config — `src/config/platform-permissions.ts`

Deliberately a **separate** map from `PLAN_ENTITLEMENTS`. Plan entitlements answer "what
did this merchant pay for"; platform permissions answer "what is this employee trusted
with". Conflating them would let a billing change alter internal access.

```ts
export type PlatformPermission =
  | 'tenants:read' | 'tenants:create' | 'tenants:suspend' | 'tenants:delete'
  | 'tenants:change_plan' | 'tenants:override_features'
  | 'platform_users:read' | 'platform_users:manage'
  | 'audit:read'
  | 'support:grant_read' | 'support:grant_write'
  | 'support:resend_receipt' | 'support:retry_webhook'
  | 'support:unlock_account' | 'support:reset_password'
  | 'billing:read' | 'billing:refund'
  | 'analytics:read';

export const PLATFORM_PERMISSIONS: Record<PlatformRole, PlatformPermission[]>;
```

| Role | Grants |
|---|---|
| `read_only` | `tenants:read`, `audit:read`, `analytics:read`, `billing:read` |
| `support` | above + `support:grant_read`, `support:grant_write`, and the four repair actions |
| `admin` | above + `tenants:create`, `tenants:suspend`, `tenants:change_plan`, `platform_users:read` |
| `super_admin` | everything, incl. `tenants:delete`, `tenants:override_features`, `platform_users:manage`, `billing:refund` |

### Audit log

Every platform-plane mutation writes exactly one row via an explicit
`writeAudit(ctx, {...})` call from the controller. Explicit rather than an automatic hook:
a reviewer can grep for the call and see precisely what is recorded, and a silently
missing hook is worse than a visible omission.

Because support access is merchant-visible, a grant writes to **both** the platform audit
log *and* the tenant's own `audit_log`, then enqueues an owner notification on
`notificationsQueue`.

---

## 3. Module layout

Follows the established 4-file convention (`controller.ts` / `service.ts` / `routes.ts` /
`validators.ts`) and the `createContext` → controller → service call path.

```
src/modules/platform/
├── auth/       POST /login  /refresh  /logout  /mfa/setup  /mfa/verify   GET /me
├── tenants/    GET /  GET /:id  POST /
│               PATCH /:id/suspend  /:id/reactivate  /:id/plan
│               DELETE /:id        GET /:id/health
├── users/      GET /  POST /  PATCH /:id  DELETE /:id  POST /:id/reset-password
├── audit/      GET /  (filter: actor, action, tenantId, dateRange)   GET /:id
├── support/    POST /grants  GET /grants  DELETE /grants/:id
│               GET  /tenants/:id/orders | /payments | /subscription   (via grant)
│               POST /tenants/:id/resend-receipt  /retry-webhook
│                    /unlock-account  /reset-user-password
└── analytics/  GET /overview  /revenue  /usage
```

All registered under `/v1/platform/*` in `src/app.ts`, all behind `requirePlatformAuth`.

Owner-side (tenant plane) — one new module plus a new tenant table:

```
src/modules/settings/   GET|PATCH /business
                        GET /audit          — the owner's own activity trail
                        GET /sessions   DELETE /sessions/:id
                        POST /export        — NDPR data export
```

Add `audit_log` to `src/shared/db/schema/tenant.ts` so owners see who did what inside
their own business (`Chike voided order ORD-000123 at 14:02`), with support access
appearing as a first-class entry.

---

## 4. Security hardening bundled in

1. **Close `POST /v1/tenants`.** Split the two legitimate callers: public self-signup
   moves behind `/v1/onboarding` with email verification and a strict rate limit;
   admin-initiated provisioning becomes `POST /v1/platform/tenants` gated on
   `tenants:create`.
2. **TOTP MFA required for `super_admin`**, optional for other roles. Use `otplib`; store
   the secret through the existing `src/shared/crypto/encrypt.ts` (AES-256-GCM, already
   built for logistics keys).
3. **Separate rate-limit bucket** for `/v1/platform/*`, plus an optional IP allowlist via
   env.
4. **Audit every failed platform login**, and never log a platform JWT.
5. **Suspend, don't delete.** `tenants:delete` is super-admin-only and soft — it flips
   `isActive` and schedules schema drop after a retention window, so a mis-click is
   recoverable and NDPR retention stays satisfiable.

---

## 5. Phasing (~20 hrs/week)

### Phase A — Platform foundation (~2 weeks) ← start here
Schema (4 tables + enum) and migrations · second JWT namespace · `platform/auth` with
TOTP · `platform-auth.ts` middleware · `platform-permissions.ts` · audit write service ·
`platform/tenants` (list, detail, suspend, reactivate, change plan) · close
`POST /v1/tenants` · tests.

**Exit:** a super-admin logs in with TOTP, lists every tenant, suspends one, and that
tenant's users get 401 on their next request. Every action appears in
`platform_audit_log`. A tenant token is rejected on `/v1/platform/*` and a platform token
is rejected on `/v1/orders`.

### Phase B — Support tooling (~1.5 weeks)
`tenant_access_grants` + `requireTenantGrant` · support read endpoints reusing existing
services · the four repair actions · tenant-side `audit_log` table · owner notification on
grant open.

**Exit:** support opens a 60-minute read grant with a stated reason, reads the merchant's
orders, and the merchant sees the access in their own settings and gets notified. On
expiry the same request returns 403.

### Phase C — Owner admin (~1.5 weeks)
Tenant `audit_log` writes across mutating modules · `settings` module · session listing and
revocation · subscription/billing history · NDPR data export.

### Phase D — Platform intelligence (~1 week)
`tenant_feature_overrides` (grant one merchant a feature without changing their plan —
also fixes the static-config limitation in `PLAN_ENTITLEMENTS`) · MRR, active tenants,
churn, per-tenant usage.

Total ≈ 6 weeks at 20 hrs/week.

---

## 6. Verification

**Unit**
- Permission matrix: every `PlatformRole` × every `PlatformPermission`.
- Grant resolution: active, expired, revoked, wrong-tenant, wrong-scope.
- Audit row shape — required fields present and non-empty on every action type.
- TOTP verify: valid code, replayed code, clock-skew window.

**Integration**
- Platform login → list tenants → suspend → tenant login now 401.
- Support grant → read merchant orders → wait past `expiresAt` → 403.
- Grant opens → row present in tenant `audit_log` → notification job enqueued.
- Support attempts an order write → 403 (read+narrow-write boundary holds).

**Cross-plane isolation — the critical tests**
- Tenant token on `/v1/platform/*` → 401.
- Platform token on `/v1/orders` → 401.
- Platform user with a grant on tenant A cannot read tenant B (extends the existing
  tenant-isolation test in `test/unit/tenant.test.ts`).
- A tenant `users` row whose `role` is hand-edited to `super_admin` gains **no** platform
  access — the value isn't in `platform_role_enum` and the plane is keyed off a different
  table and secret.

**Manual**
```bash
curl -X POST /v1/platform/auth/login -d '{"email":"...","password":"...","totp":"123456"}'
curl /v1/platform/tenants           -H "Authorization: Bearer <platform_token>"
curl -X POST /v1/platform/support/grants \
     -H "Authorization: Bearer <platform_token>" \
     -d '{"tenantId":"...","scope":"read","reason":"ticket #412 — missing receipt"}'
curl /v1/platform/audit?tenantId=... -H "Authorization: Bearer <platform_token>"
```

---

## 7. Open items

- **Tenant retention window** before a suspended tenant's schema is dropped — needs an
  NDPR call (suggest 90 days).
- **Support access notification channel** — email via the existing Resend integration, SMS
  via Termii, or both. Email is the assumed default.
- **IP allowlist for `/v1/platform/*`** — worth it once support headcount exists; skip
  while the team is one person.
