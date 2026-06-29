# Execution Plan: Multi-Tenant Commerce & Operations Platform

**Project:** Bumpa-alternative commerce and business operations platform for Nigerian SMEs
**Engagement type:** Equity-based side contract
**Backend lead:** Stephen Oyeyemi (20 hrs/week)
**Web & mobile:** Contracted out
**Target:** First paying customer live in 6 to 8 weeks (Phase 1 scope only)
**Last updated:** June 2026


---

## 1. Scope Definition

### 1.1 In Scope (Phase 1 / v1)

The committed deliverable is a working commerce and operations platform that can onboard one real paying merchant. Concretely:

- Multi-tenant backend (schema-per-tenant on PostgreSQL)
- Merchant storefront (web) with product catalogue, cart, checkout
- WhatsApp-native ordering channel (browse, cart, checkout in chat)
- Inventory management with variants, stock tracking, low-stock alerts
- Unified order pipeline across website, POS, WhatsApp, manual entry
- Payments via Paystack and Flutterwave (card, transfer, USSD)
- Platform wallet with transaction reconciliation
- Double-entry ledger underpinning every financial transaction
- Invoicing, receipts, expense tracking
- Profit-and-loss, revenue-by-location, and staff sales reports
- Role-based staff accounts and multi-location support
- POS (web/mobile)
- Subscription billing and feature-gating engine (monthly ₦3,500 entry tier)

### 1.2 Explicitly Out of Scope (Deferred to Phase 2 / 3)

These are NOT to be built in the 6 to 8 week window, even if time appears available. Scope discipline here is what makes the timeline real:

- Virtual account issuance (requires CBN-licensed banking partner)
- Float / wallet holding at scale (requires PSSP licence)
- FIRS tax filing integration (requires confirmed compliance pathway)
- Multi-currency settlement (NGN only at launch)
- Loyalty rewards, advanced analytics, gift cards
- Wholesale/B2B pricing tiers (architect the data model for it, do not build the full UI)

### 1.3 Scope Change Rule

Any request to add a feature during the build triggers an explicit trade: something of equal effort moves out, or the timeline moves. No silent scope growth. This is written down so it can be pointed to later.

---

## 2. Pre-Conditions (Must Be Resolved Before Build Proceeds)

These gate the project. Foundation work (Section 5, Stage 0) may begin in parallel, but feature development should not start until these are cleared.

### 2.1 Commercial Gates

- [ ] Term sheet open items agreed in writing (equity %, dilution, vesting, retainer, revenue share)
- [ ] Formal Memorandum of Agreement signed by both parties
- [ ] IP ownership and handover terms confirmed
- [ ] Client's registered business entity confirmed (needed for merchant accounts)

### 2.2 External Lead-Time Gates (Start Day One)

- [ ] **Meta Business Manager account created and WhatsApp Business API application submitted** — this is the critical path, 2 to 4 week review
- [ ] Paystack merchant account application submitted under client entity
- [ ] Flutterwave merchant account application submitted under client entity
- [ ] Primary domain registered and DNS access secured
- [ ] Settlement bank account decision made

### 2.3 Resourcing Gates

- [ ] Web/mobile contractor identified, scoped, and contracted
- [ ] Client-side point of contact named for product decisions during build

---

## 3. Team & Responsibilities

| Role | Owner | Responsibility |
|------|-------|----------------|
| Backend & platform architecture | Stephen (20 hrs/wk) | API, data model, payments, ledger, WhatsApp integration, feature gating, deployment |
| Web frontend | Contractor | Merchant dashboard + storefront against the backend API |
| Mobile | Contractor | POS and merchant mobile app against the backend API |
| Design | Contractor (single pass) | Dashboard and storefront templates |
| Product decisions | Client POC | Timely answers to scope questions to avoid build stalls |

**Key dependency risk:** The backend API contract must be defined and stable early, because two contractors are building against it. If the API is a moving target, their work stalls and rework costs blow the timeline. API-first is not optional here.

---

## 4. Technical Architecture (Reference)

- **Runtime/Framework:** Node.js + TypeScript, Fastify
- **ORM/DB:** Prisma + PostgreSQL (Neon), schema-per-tenant isolation
- **Cache/Queue:** Upstash Redis + BullMQ
- **Storage:** Cloudflare R2
- **Payments:** Paystack + Flutterwave (gateway abstraction layer)
- **Messaging:** WhatsApp Business API (Meta), Termii for SMS
- **Deployment:** Hetzner VPS + Dokploy + Docker
- **Pattern:** Modular monolith, single deployable service organised by domain module
- **Observability:** Logging, tracing, metrics from day one

Design principles that protect the timeline: API-first contract, configuration-driven feature gating (no hardcoded plan checks), idempotent webhook handling with signature verification, event-driven background jobs.

---

## 5. Build Plan by Stage

Stages are sequenced by dependency, not calendar. At 20 hrs/week solo on the backend, these are tight. Each stage names its exit criteria.

### Stage 0: Foundation (can run during contract negotiation)

- Repository, CI/CD pipeline, environment config
- Hetzner + Dokploy deployment skeleton, Neon dev/prod databases
- Multi-tenant scaffolding: tenant provisioning, schema switching, base middleware
- Auth, role-based access control, tenant context resolution
- **Exit:** A new tenant can be provisioned and a authenticated request resolves to the right schema.

### Stage 1: Commerce Core

- Product catalogue, variants, categories
- Inventory tracking with movement audit trail and low-stock alerts
- Customer records
- Order pipeline (state machine) with manual order entry first
- **Exit:** A merchant can add products and record an order end to end via API.

### Stage 2: Payments & Ledger

- Payment gateway abstraction (Paystack + Flutterwave)
- Webhook handling (idempotent, signature-verified)
- Platform wallet and reconciliation
- Double-entry ledger with balanced-entry enforcement
- Journal templates for order payment, refund, expense
- **Exit:** A paid order posts correct, balanced ledger entries and updates the wallet.

### Stage 3: Subscription & Feature Gating

- Plan definitions, subscription lifecycle state machine (TRIAL → ACTIVE → GRACE → LAPSED)
- Configuration-driven feature-gating engine
- Monthly billing at ₦3,500 entry tier
- **Exit:** A merchant can subscribe, and feature access reflects their plan automatically.

### Stage 4: WhatsApp Commerce

- WhatsApp Business API integration (assumes approval cleared by now)
- Conversational session state machine (browse → cart → checkout → payment)
- Order capture into the same pipeline as web/POS
- **Exit:** A full order can be placed and paid for inside a WhatsApp conversation.
- **Risk note:** If Meta approval is delayed, this stage stalls. Build it against a sandbox/stub so backend logic is ready the moment approval lands.

### Stage 5: Reporting & Operations

- P&L, revenue-by-location, staff sales reports from the ledger
- Invoicing and receipts (PDF generation)
- Expense tracking
- Multi-location and staff assignment
- **Exit:** A merchant can pull an accurate P&L and staff sales report for any date range.

### Stage 6: Integration, Hardening, Launch Prep

- Web dashboard and mobile POS integrated against final API
- End-to-end testing across all channels
- Observability validated, backups configured
- Onboarding flow for the first merchant
- **Exit:** First merchant onboarded on production with real payments flowing.

---

## 6. Timeline (6 to 8 Week Target)

This assumes the contract is signed, WhatsApp approval is in motion from day one, and contractors are working in parallel. Backend stages overlap with contracted frontend work.

| Week | Backend focus (Stephen) | Parallel track |
|------|------------------------|----------------|
| 1 | Stage 0 foundation + API contract definition | WhatsApp/Paystack/Flutterwave applications submitted; contractors onboarded |
| 2 | Stage 1 commerce core | Web/mobile scaffolding against API contract |
| 3 | Stage 2 payments + ledger | Storefront + dashboard build |
| 4 | Stage 3 subscriptions + gating | POS build |
| 5 | Stage 4 WhatsApp (live if approval cleared, stubbed if not) | Dashboard integration |
| 6 | Stage 5 reporting + operations | Mobile integration |
| 7 | Stage 6 integration + hardening | End-to-end testing |
| 8 | Launch prep + first merchant onboarding | Buffer for slippage |

**Honest risk flags on this timeline:**
- 20 hrs/week solo backend across six technical stages in eight weeks has almost no slack. Any one stage running long compresses launch prep.
- WhatsApp approval (Week 1 dependency) is the most likely cause of slip. Mitigated by stubbing, but live testing still needs the real approval.
- Contractor delays on web/mobile directly hit Stage 6. The API-first approach is the main mitigation.
- If contract signing slips, Week 1 slips with it. The clock starts at signature, not today.

---

## 7. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Contract not signed before build | Work done for unsecured equity | Medium | Gate feature work behind signature; only Stage 0 proceeds early |
| WhatsApp API approval delayed | Core differentiator stalls | High | Submit day one; build against stub so logic is ready |
| Scope creep into regulated features | Timeline blows, compliance exposure | High | Section 1.3 scope rule; Phase 2/3 explicitly deferred |
| Contractor slippage (web/mobile) | Integration stage slips | Medium | API-first contract; clear specs; milestone check-ins |
| Solo backend bandwidth (20 hrs/wk) | Stages run long | Medium-High | Ruthless scope hold; no gold-plating; defer anything non-essential |
| Regulatory exposure (financial features) | Legal/CBN risk | Medium | Keep all licensed activity in Phase 2 behind a partner; NDPR-compliant data handling |
| Client payment/retainer lapses | Work continues unpaid | Medium | Retainer terms in formal agreement; 60-day cessation clause from term sheet |
| Client slow to set up or fund paid accounts | Build stalls waiting on infrastructure/API access | Medium | Client registers and funds accounts in Week 1; treat as a pre-condition, not a mid-build task; Developer gets delegated access promptly |

---

## 8. Definition of Done (Phase 1 Launch)

Phase 1 is complete when ALL of the following are true:

- [ ] Platform is live on production infrastructure
- [ ] One real merchant is onboarded and operational
- [ ] Real payments are flowing through Paystack/Flutterwave
- [ ] Orders can be placed via website, POS, and WhatsApp
- [ ] The double-entry ledger produces an accurate P&L
- [ ] Subscription billing and feature gating work end to end
- [ ] Backups and observability are confirmed working
- [ ] The front-loaded equity vest condition (per term sheet) is met

---

## 9. Immediate Next Actions (This Week)

In priority order, independent of build start:

1. Submit the WhatsApp Business API application via Meta Business Manager. Nothing else on this list matters as much.
2. Drive the term sheet open items to written agreement, then get the formal agreement signed.
3. Submit Paystack and Flutterwave merchant applications under the client entity.
4. Register the domain and secure DNS access.
5. Identify and contract the web/mobile developer(s).
6. Confirm the client-side point of contact for product decisions.

---

## 10. Open Questions for the Client

- Confirmation of Phase 1 scope as the committed v1 (Section 1.1)
- Confirmation of registered business entity for merchant accounts and WhatsApp API
- Confirmation of delivery timeline and payment structure
- Sign-off to begin external account applications immediately

**Resolved:** The client bears all infrastructure and third-party service costs (hosting, database, SMS, WhatsApp Business API, payment processing fees) throughout the build and beyond. As an existing business operator, the client is familiar with these operating costs. This should be stated explicitly in the formal agreement so it is not left as a verbal understanding. Accounts for paid services should be registered under the client's entity and billed to the client directly, rather than fronted by the Developer and reimbursed later.
