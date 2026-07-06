# Augmentic — Implementation Plan

Status: Draft v1
Created: 2026-07-06
Companion doc: [`docs/specifications.md`](specifications.md) (referenced below as "Spec")
Source PRD: [`docs/prd-ai-workforce-orchestration-saas.md`](prd-ai-workforce-orchestration-saas.md)

## How this plan is organized

- **Phase 1 (MVP)** builds the most critical parts: the full trust loop — *hire an AI employee → connect a tool → run a workflow → approve a risky action → see it in the log*. Everything in the PRD's "MVP must include" list (§7) lands here.
- **Phase 2** makes the MVP beta-ready: more integrations, ROI visibility, notifications, billing enforcement.
- **Phase 3** is paid-pilot readiness: vertical packs, admin/export controls, client-safe approvals.
- **Phase 4** is scale and expansion.

Within every phase, tasks are ordered **highest priority first**, and each task lists its dependencies so work can be parallelized where the dependency graph allows. A task is "done" when its acceptance criteria pass and the contract-sync rule holds (db + shared + server + ui updated together — Spec §3.3).

Suggested cadence: Phase 1 ≈ 8–10 weeks for a small team, with milestones M1–M4 as noted.

---

## Phase 1 — MVP: the core trust loop

Goal: a user can create a workspace, hire an AI employee from a template, connect Google Workspace + Slack, create a plain-language workflow, simulate it, run it on a trigger, approve a sensitive action days later, and see everything in run/audit logs and on a read-only Work Chart.

### 1.1 Monorepo scaffold and dev environment — P0

Depends on: nothing.

- pnpm workspace per Spec §3.3: `apps/web`, `packages/db`, `packages/shared`, `packages/engine`, `packages/agent-runtime`, `packages/connectors`, `packages/policy`.
- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui; Drizzle + Postgres with embedded PGlite in dev (`DATABASE_URL` unset ⇒ zero-setup, Paperclip pattern).
- CI: typecheck, Vitest, build on every PR. Migration workflow (`db:generate`, `db:migrate`).

**Accept:** `pnpm install && pnpm dev` starts app + embedded DB on a clean machine; CI green.

### 1.2 Core schema and shared contracts — P0

Depends on: 1.1.

- All Spec §4 tables in `packages/db` (tenancy, agents/Work Chart, integrations/tools, knowledge/brand, workflows/runs, governance/metering).
- `packages/shared`: zod validators, enums (risk tiers, autonomy modes, run statuses, RBAC roles), API path constants.
- Seed script: demo workspace, 5 agent templates (stubs), tool definitions with risk tiers.

**Accept:** migrations apply cleanly; seeded workspace queryable; shared types imported by web app.

### 1.3 Auth, workspaces, RBAC, memberships (FR-001) — P0

Depends on: 1.2.

- Email/OAuth sign-in (e.g. Auth.js), workspace create/switch, invitations, roles: owner/admin/operator/approver/viewer.
- **Workspace-scoping middleware**: every service call carries workspace context; cross-tenant access is impossible by construction (Paperclip invariant). Integration tests prove isolation.
- Audit events for auth and membership mutations from day one (the audit table exists before the features that write to it).

**Accept:** two workspaces with distinct data; a member of A can never read B (test-enforced); viewer cannot mutate.

### 1.4 Agent model, templates, and hiring wizard (FR-003, FR-004, Journey B) — P0

Depends on: 1.3.

- 5 role templates with original content (Executive Assistant, Sales Ops Rep, Client Success Rep, Finance Admin, Marketing Ops Assistant): job description, default skills, app dependencies, default workflows, approval defaults (PRD §7 table).
- Hiring wizard: pick template (or custom plain-language job description) → name agent → review recommended apps/skills/routines/safety card → connect apps or mark for later.
- Agent statuses (active/paused/needs_setup/blocked/error), autonomy modes (draft_only default), supervisor assignment, spend cap field.

**Accept:** hiring from a template produces an agent with status `needs_setup` or `ready` and populated defaults, without engineering help.

### 1.5 Integration framework + Google Workspace, Slack, webhook (FR-006, FR-007) — P0

Depends on: 1.3. Parallel with 1.4.

- Connector interface per Spec §8; KMS-encrypted `secret_ref` storage; token refresh; health checks.
- Connectors: **Gmail** (read, draft, send), **Google Calendar** (read, draft event), **Google Drive** (read, create doc), **Slack** (read channel, post message), **generic signed webhook** (inbound trigger + outbound delivery).
- Every tool gets a `tool_definition` with risk tier + zod input schema; integration catalog page with connection status and scopes (FR-006).
- Per-agent `tool_permission_policy` (allow / require_approval / deny) with tier defaults from Spec §7.1 (FR-008).

**Accept:** OAuth connect/disconnect/re-auth works for Google + Slack; catalog shows health; a denied tool is rejected server-side regardless of what the model asks for.

> **Milestone M1 (≈ week 3):** sign in, create a workspace, hire an agent, connect Gmail + Slack.

### 1.6 Durable run engine and run-log data model (FR-016, FR-017) — P0

Depends on: 1.2. Engine core can start in parallel with 1.4/1.5; execution steps need 1.5.

The highest-risk build in the MVP — start early.

- Inngest-backed pipeline implementing the 11-step lifecycle (Spec §5); every step writes `run_step`; state lives in our DB so the engine is swappable (PRD §12.1).
- Invariants: atomic run checkout (no double-execution), retries with idempotency keys on external writes, orphaned-run reaper, budget check before every model/tool call.
- Run log UI: per-run timeline of trigger, plan, tool calls (args/results), errors, retries, duration, cost — streamed over SSE within 1s of step completion.

**Accept:** a run survives worker restart mid-pipeline and resumes; a forced duplicate trigger executes once; a failed external call retried does not double-send (integration-tested with a fake connector).

### 1.7 Agent runtime (planning + tool-calling) — P0

Depends on: 1.6 core, 1.5 tools.

- Provider-agnostic tool-calling loop in `packages/agent-runtime` (Spec §6): prompt assembly (identity + brand + memory + skills + instructions + delimited untrusted evidence), bounded plans, cheap-model routing for classify/extract.
- `packages/policy`: deterministic risk classification of every proposed tool call — outside the model; server-side zod validation of args; untrusted-content labeling (Spec §7.2).
- Agent setup interview writing `memory_item`s.

**Accept:** an agent given "summarize yesterday's inbox to Slack" plans, reads Gmail (read tier, auto-allowed), drafts, posts to Slack only per policy; a prompt-injection string inside a retrieved email cannot cause an unapproved external send (test with a poisoned fixture).

### 1.8 Plain-language workflow builder + triggers (FR-011/012/013, Journey C) — P0

Depends on: 1.6, 1.7.

- Two-step creation (Choose template / Start blank → Set up) with dependency-readiness gating (Spec §10).
- ≥10 original workflow templates from PRD §14 (inbox triage digest, meeting prep brief, follow-up draft, stalled deal nudge, weekly pipeline summary, CRM hygiene, invoice chaser draft, weekly client report, ticket triage summary, weekly social drafts), each with dependencies, sample output, trigger options, default role, scopes, approval policy, success metric.
- Triggers: **manual** Run button; **schedule** (cron + timezone + next-runs preview); **signed webhook URL**; **app event** for ≥1 provider (recommend: Gmail new-message matched by query) end-to-end.
- Delivery targets: run log (default), Slack channel, email draft.

**Accept:** Journey C end-to-end — template → dependency check → trigger → enable → one completed run with a full run log. All four trigger types fire.

> **Milestone M2 (≈ week 6):** a scheduled "daily inbox triage digest" runs unattended and delivers to Slack.

### 1.9 Approval center + resumable approvals (FR-015, FR-016, Journey D) — P0

Depends on: 1.6, 1.7. The differentiating trust feature.

- Sensitive tool calls (per policy engine) create `approval_request`s and park the run in `waiting_approval` — resumable after minutes or days.
- Approval center: Pending / History tabs; each request shows the full contract of Spec §7.3 (instruction, exact payload/diff, tool + account, data leaving workspace, risk + policy reason, evidence).
- Actions: approve / reject / edit payload / request revision (agent revises within same run) / comment. Decisions audit-logged.

**Accept:** an external email send pauses the run; approving 24h later (simulated) resumes the same run from saved state and sends exactly the (possibly edited) approved payload; reject cancels with a logged reason.

### 1.10 Audit log + usage ledger + spend caps (FR-018, FR-019, FR-020) — P0

Depends on: 1.6 (events exist). Write-paths land alongside 1.3–1.9; this task is the UI + enforcement.

- Append-only `audit_event` viewer with filters (actor, event type, entity, date).
- `usage_ledger` recording model tokens, tool calls, runs, cost — by workspace/agent/workflow/run/provider/model (Paperclip dimensions).
- Per-agent spend caps: warning threshold + hard stop that pauses the agent and cancels queued runs.
- Activation metric events (Spec §14) emitted from the engine.

**Accept:** every mutation and external write appears in audit; a capped agent hard-stops mid-backlog; per-run cost visible in the run log.

### 1.11 Knowledge base + brand profile (FR-009, FR-010) — P0

Depends on: 1.2; retrieval wiring depends on 1.7.

- Upload docs / add links / paste text; chunking + pgvector embeddings; workspace- or agent-scoped collections; tags.
- Brand profile form (tone, offerings, ICP, competitors, pricing notes, escalation rules, forbidden claims) injected into prompt assembly.
- Runs retrieve knowledge in the evidence step and outputs show citations.

**Accept:** an uploaded SOP changes a workflow's output and is cited in the run log.

### 1.12 Simulation mode (FR-014) — P0

Depends on: 1.8.

- Dry-run against recent/sample data: shows plan, evidence, likely tool calls, and rendered output; external writes are hard-blocked at the policy layer in simulation.
- Required (or strongly prompted) before first activation of a workflow.

**Accept:** simulating the invoice-chaser shows the exact draft email and intended recipients with zero external side effects (asserted at connector layer).

> **Milestone M3 (≈ week 8):** full Journey D — simulate, enable, run, approve a real external send, audit it.

### 1.13 Work Chart, read-only (FR-002, PRD §8) — P0

Depends on: 1.4, 1.8, 1.9 (needs real nodes/edges/statuses to render).

Built late in Phase 1 deliberately: it is the signature surface, but it visualizes entities the other tasks create.

- Graph home screen (React Flow or similar): human, agent, department, workflow, tool, approval-queue nodes; supervises / triggers / uses-tool / routes-approval / delivers-to edges.
- Agent cards: status, supervisor, connected apps, owned workflows/schedules, approval policy, spend vs cap, recent work.
- MVP views: Overview, Responsibilities, Approvals, Tools (ROI view is Phase 2). Click-through to detail pages. <2s initial load; SSE status updates.

**Accept:** a new workspace after onboarding shows a populated chart; pausing an agent updates its node live; every node opens its detail page.

### 1.14 Agent detail page (FR-005) + chat surface — P0

Depends on: 1.4–1.11 (aggregates them).

- Tabs: Overview, Chat, Workflows, Tools, Skills, Knowledge, Memory (view/edit/delete facts), Access, Settings (autonomy, spend cap, supervisor), Activity.
- Chat runs through the same engine + policy pipeline as workflows (visible step logs; approvals apply identically).

**Accept:** every tab functional; a chat-initiated external send still routes through the approval center.

### 1.15 Onboarding flow (Journey A) + billing foundation — P1 (last in phase)

Depends on: 1.4, 1.5, 1.13.

- Onboarding interview (industry, team size, tools, top manual tasks, risk tolerance) → proposed Work Chart with 2–3 recommended agents and workflows → invite teammates → connect Google → setup-readiness checklist.
- Billing *foundation* only: Stripe customer per workspace, plan records, credit balance display fed by the usage ledger. Enforcement/paywalls are Phase 2.

**Accept:** Journey A success criterion — a new user reaches a populated Work Chart with ≥1 connected app; usage accrues against a visible credit balance.

> **Milestone M4 / MVP complete (≈ week 10):** all 12 PRD MVP items demoable end-to-end; internal dogfooding starts.

---

## Phase 2 — Beta readiness: visibility, reach, and money

Goal: 10–15 external beta workspaces can rely on the product daily (PRD Phase 3 milestone). Highest priority first:

### 2.1 Notifications (FR-021) — P0

Email + Slack notifications for pending approvals, blocked runs, and failures (approval latency is the #1 driver of workflow completion). Weekly value-summary email. Per-user `notification_subscription` preferences.

### 2.2 CRM integration: HubSpot or Pipedrive (FR-007) — P0

Resolve PRD open question #2 with beta-customer data; ship one CRM deeply: read contacts/deals, draft notes, stage-change proposals (internal-write tier, approval-gated). Unlocks Sales Ops Rep templates (stalled deal nudge, pipeline summary, CRM hygiene) with real data.

### 2.3 Finance integration: QuickBooks or Xero (FR-007) — P0

Resolve open question #3; read invoices/bills, draft payment-chaser emails. Unlocks the Finance Admin template family. Spend-tier actions remain out of scope.

### 2.4 ROI dashboard + Work Chart ROI view (FR-022) — P1

Time-saved estimates, work completed, invoices chased, leads handled, approval acceptance rate, human edit rate, cost per completed workflow — from metric events already emitted in 1.10. Defines the minimum credible ROI calc (PRD open question #5) with beta users.

### 2.5 Billing enforcement + plans (PRD §16) — P1

Starter/Growth/Pro limits (agent count, runs), Stripe checkout + invoices, credit consumption with transparent per-agent/per-run cost display, graceful over-limit behavior (pause new runs, never lose state).

### 2.6 Reliability & security hardening pass — P1

Load-test run engine; evaluate Inngest → Temporal migration using the engine-agnostic state layer (Spec §3.2); prompt-injection red-team round with poisoned fixtures; data-retention controls per workspace; penetration checklist for OAuth token handling.

### 2.7 Custom skills (FR-023) — P2

Admin-created reusable skills: instructions, input/output schemas, allowed tools, test cases. Skill library UI; enable per agent.

### 2.8 Workflow template expansion — P2

Grow toward the full PRD §14 list (competitor page watch, receipt collection, support ticket triage with Zendesk/Intercom exploration) based on beta usage data.

---

## Phase 3 — Paid pilots: packaging and admin trust

Goal: convert betas to paid (PRD Phase 4 milestone). Highest priority first:

### 3.1 Vertical pack #1 (FR-025) — P0

Agency/professional-services pack (PRD §17 wedge): bundled templates, SOP prompts, policy defaults, recommended integrations; one-click install during onboarding. The "install your first AI ops team in a week" offer.

### 3.2 Client-safe approval links (FR-024) — P1

Tokenized approval-only external view (no workspace access) so agency clients can approve drafts. Expiring links, watermarked previews, full audit of external decisions.

### 3.3 Admin controls + exportable audit — P1

Workspace security settings (session policy, allowed domains), audit log export (CSV/JSON), data deletion/retention execution (open question #8), org-level policy templates for sensitive categories.

### 3.4 Mobile-first approvals — P2

Responsive approval center + email/Slack deep links that make phone approvals one tap (open question #7). No native app yet.

### 3.5 Onboarding concierge tooling — P2

Managed-implementation add-on support: setup diagnostics ("Gmail connected, calendar permission missing, CRM field mapping needs review"), internal playbooks, workspace health report.

---

## Phase 4 — Scale and expansion

Ordered by expected leverage; sequence with real demand data:

1. **Second CRM + second finance integration** — whichever of HubSpot/Pipedrive and QuickBooks/Xero wasn't chosen; plus Notion, Zendesk/Intercom.
2. **Trusted MCP server support** — allowlisted MCP connectors with approval + data-sharing logging (Spec §7.2), opening the long-tail integration surface safely.
3. **Multi-agent handoffs on the Work Chart** — agent→agent handoff edges executed by the engine (Spec §6) with per-hop policy checks.
4. **Additional vertical packs** — local services (lead response, quoting, review requests), finance/admin-heavy firms.
5. **Second channel surfaces** — Teams, and inbound email-as-channel for agents.
6. **Template marketplace & white-label** — explicitly out of MVP scope (PRD §7); revisit only with retention proof.

---

## Cross-cutting engineering rules (all phases)

1. **Contract sync:** schema/API changes update `packages/db`, `packages/shared`, server, and UI together (Spec §3.3).
2. **Workspace scoping:** every new entity and route is workspace-scoped and covered by an isolation test.
3. **Audit everything:** every mutating action and external write emits an `audit_event` — in the same PR as the feature.
4. **Policy outside the model:** no tool executes without deterministic policy-engine clearance, in every surface (workflow, chat, simulation).
5. **Cost events at the source:** any code path calling a model or tool writes `usage_ledger` entries.
6. **Original content only:** templates, copy, and UI are independent designs — Cyndra informs architecture, never assets (PRD §19 IP risk).

## Key risks to watch (from PRD §19, sequenced against this plan)

| Risk | Where the plan addresses it |
|---|---|
| Durable engine complexity blows the schedule | 1.6 starts early, in parallel; Inngest first, Temporal later behind our own state layer |
| Users expect full autonomy | draft_only default (1.4), approval-always tiers (1.5/1.9), positioning in onboarding (1.15) |
| Prompt injection | 1.7 policy package + poisoned-fixture tests; hardening round in 2.6 |
| Integration sprawl | MVP capped at Google + Slack + webhook; one CRM and one finance app in Phase 2 |
| LLM cost vs margin | cheap-model routing (1.7), per-run cost tracking (1.10), caps (1.10), transparent pricing (2.5) |
| Generic-agent-builder drift | role templates (1.4), Work Chart (1.13), and vertical packs (3.1) stay the primary UX |
