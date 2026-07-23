# Backend Best Practices — Pedantic Tasks

This document identifies backend best practices not yet implemented in the BPOS codebase, organized by priority.

---

## Priority 1: Critical (Blocks Production)

- [x] **1.1 Health Check Enhancement** — DB + Redis + queue status checks
- [x] **1.2 Graceful Shutdown** — BullMQ worker drain + Redis close
- [x] **1.3 Password Reset Endpoint** — forgot-password + reset-password with rate limiting

---

## Priority 2: High (Security & Reliability)

- [x] **2.1 Termii SMS Integration** — Pluggable SMS provider (Termii + VTPASS), all 4 workers updated
- [ ] **2.2 Structured Log Drain** — Pino → Axiom/Loki/Datadog for persistent log storage
- [ ] **2.3 Sentry Integration** — Exception tracking with request context
- [ ] **2.4 Backup Configuration** — Neon point-in-time recovery (dashboard config)

---

## Priority 3: Medium (Quality & Maintainability)

- [ ] **3.1 Test Coverage for Missing Modules** — auth, customers, expenses, invoicing, locations, staff, reporting, whatsapp, onboarding, shipping
- [ ] **3.2 Response Schema Documentation** — OpenAPI response schemas for all endpoints
- [ ] **3.3 Consistent Guard Naming** — Standardize readGuard/writeGuard/adminGuard across modules
- [ ] **3.4 Webhook Response Consistency** — Always return 200 to providers, log failures
- [ ] **3.5 Middleware Test Coverage** — requireAuth, resolveTenant, requireRole, requireManager

---

## Priority 4: Low (Nice-to-Have)

- [ ] **4.1 API Versioning Strategy** — Document /v1/ strategy for future breaking changes
- [ ] **4.2 Rate Limiting per Tenant** — Tier-based limits (starter/growth/enterprise)
- [ ] **4.3 Request Validation Middleware** — Extract common validation patterns
- [ ] **4.4 API Changelog** — Maintain CHANGELOG.md for API consumers
- [ ] **4.5 OpenAPI Diff in CI** — Detect breaking API changes

---

## Summary

| Priority | Category | Total | Done | Remaining |
|----------|----------|-------|------|-----------|
| P1 | Critical | 3 | 3 | 0 |
| P2 | High | 4 | 1 | 3 |
| P3 | Medium | 5 | 0 | 5 |
| P4 | Low | 5 | 0 | 5 |
| **Total** | | **17** | **4** | **13** |

**Completed this session:**
1. ✅ Health check with DB/Redis/queue status
2. ✅ Graceful shutdown with BullMQ drain
3. ✅ Password reset endpoints (forgot + reset)
4. ✅ Pluggable SMS provider (Termii + VTPASS) with all workers updated
5. ✅ Controller layer refactoring (19 modules, on `refactor` branch)

**Next session priorities:**
1. Merge `refactor` branch into `development`
2. Structured log drain (Axiom or Loki)
3. Sentry error tracking
4. Test coverage for missing modules
