# Augmentic — Technical Specifications

Status: Draft v1
Created: 2026-07-06
Sources: [`docs/prd-ai-workforce-orchestration-saas.md`](prd-ai-workforce-orchestration-saas.md), `research/cyndra/cyndra-ai-analysis.md`, `research/paperclip/`
Companion doc: [`docs/implementation-plan.md`](implementation-plan.md)

---

## 1. What we are building

Augmentic is an AI workforce orchestration SaaS for SMBs. Users "hire" AI employees from role templates, connect the tools their business already uses, assign plain-language workflows, and supervise risky actions through an approval center. The home surface is a **Work Chart** — an org-chart-like map of humans, AI employees, workflows, tools, approval routes, and ROI.

Core promise (from PRD §1): *deploy AI employees that complete repetitive business work through the tools the business already uses, while humans stay in control of risky actions.*

Three product principles (PRD §4):

1. **Role-first setup** — users pick jobs (Executive Assistant, Sales Ops Rep, …), not prompts.
2. **Work-chart management** — the home screen maps work, not a blank chat.
3. **Trust before autonomy** — draft-by-default; external writes require approval until policy says otherwise.

## 2. Learnings adopted from the reference projects

### 2.1 From Cyndra (product feature architecture — `research/cyndra/cyndra-ai-analysis.md`)

We adopt the *feature architecture*, never the proprietary UI, copy, or templates:

- **Information architecture:** Agents, Integrations, Workflows, Skills, Knowledge, Schedules, Billing, Brand profile, Team, Audit, Usage, Settings, Chat.
- **Agent object model:** identity + runtime state + channels + connected apps + skills + memory + access + settings + activity, with explicit autonomy levels ("always asks first", "asks when unsure", "works independently").
- **Three-abstraction split:** *apps are permissions/tools, skills are know-how, workflows/schedules are recurring execution.*
- **Two-step workflow creation:** Choose (template or blank) → Set up (dependency readiness, name/instructions, trigger, agent, delivery). Create is disabled until dependencies are ready (e.g. "0 of 1 ready").
- **Plain-language workflows**, not node canvases: name + instructions + trigger.
- **Four trigger modes:** manual, schedule (with timezone + next-run preview), app event, signed webhook.
- **Approvals as a workflow-lifecycle primitive** (Pending / History tabs), not a chat modal.
- **Governance layer as table stakes:** spend caps, credit ledger, audit log, team roles, autonomy settings.

### 2.2 From Paperclip (orchestration control-plane engineering — `research/paperclip/`)

Paperclip is an open-source (MIT) control plane for agent companies. We borrow engineering patterns:

- **Org chart as the management metaphor** → our Work Chart. Agents have a supervisor, a title, a job description, and reporting/responsibility edges.
- **Tenant-scoped everything:** every domain entity is scoped to a tenant (Paperclip: company; Augmentic: workspace) and boundaries are enforced in routes/services, not just queries.
- **Control-plane invariants** enforced in code: single-assignee work model, atomic checkout/execution locks (no double-work), approval gates for governed actions, budget hard-stop auto-pause, activity logging for every mutating action.
- **Contract layering:** when schema/API changes, all layers update together — `packages/db` (schema), `packages/shared` (types/validators/API path constants), `server` (routes/services), `ui` (clients/pages).
- **Monorepo structure:** pnpm workspaces with `server/`, `ui/`, `packages/db` (Drizzle + Postgres), `packages/shared`, adapter/plugin packages.
- **Heartbeat/wakeup queue pattern:** DB-backed scheduling with coalescing, budget checks before execution, and automatic recovery of orphaned runs.
- **Cost tracking dimensions:** token/cost events by workspace, agent, workflow, run, provider, and model, with scoped budget policies (warning threshold + hard stop).
- **Zero-setup dev:** embedded Postgres (PGlite) when `DATABASE_URL` is unset, so `pnpm install && pnpm dev` just works.

## 3. Architecture

### 3.1 Decision (PRD §12.1)

A **product-owned durable orchestration layer** is the system of record. LLM agents run *inside* it. The model is never the orchestrator of record: workflow state, permissions, approvals, and audit live in our database and engine.

```
┌────────────────────────────────────────────────────────────────┐
│                          AUGMENTIC                             │
│                                                                │
│  Next.js Web App (Work Chart, agent pages, workflows,          │
│  approvals, run logs, settings)  ←SSE/WebSocket─┐              │
│                                                 │              │
│  ┌──────────────────────────────────────────────┴───────────┐  │
│  │ API layer (TypeScript, tRPC or REST)                     │  │
│  │  auth · RBAC · workspace scoping · validation · audit    │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             │                                  │
│  ┌──────────────────────────┴───────────────────────────────┐  │
│  │ Durable run engine (Inngest for MVP → Temporal later)    │  │
│  │  triggers · preflight · plan · evidence · draft ·        │  │
│  │  risk-classify · approve/execute · verify · deliver ·    │  │
│  │  ledger+audit  — every step recoverable & replayable     │  │
│  └───────┬──────────────────┬──────────────────┬────────────┘  │
│          │                  │                  │               │
│  ┌───────┴──────┐  ┌────────┴───────┐  ┌───────┴────────┐      │
│  │ Agent runtime│  │ Integration    │  │ Policy engine  │      │
│  │ (LLM tool-   │  │ connectors     │  │ (deterministic │      │
│  │  calling)    │  │ (OAuth, tools) │  │  risk checks)  │      │
│  └──────────────┘  └────────────────┘  └────────────────┘      │
│                                                                │
│  Postgres (+pgvector) · Object storage · KMS secrets · Stripe  │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js (App Router) + React + TypeScript | Tailwind + shadcn/ui; React Flow (or similar) for the Work Chart graph |
| API | TypeScript service layer (tRPC or REST + zod) | All contracts defined in `packages/shared` |
| Database | Postgres + Drizzle ORM | `workspace_id` on every domain table; pgvector for knowledge retrieval; embedded PGlite in dev |
| Durable orchestration | Inngest (MVP) → Temporal Cloud (hardening) | Engine-agnostic state: `workflow_run` / `agent_run` / `approval_request` / `tool_call` live in *our* DB so the engine can be swapped (PRD §12.1) |
| Agent runtime | Provider-agnostic tool-calling wrapper | Default provider per PRD (OpenAI Agents SDK / Responses API); adapter interface so Anthropic Claude models are drop-in. Cheap models for classify/extract steps |
| Integrations | OAuth-first official APIs | Connector interface per app; generic signed webhook; trusted MCP servers post-MVP |
| Realtime | SSE (upgrade to WebSockets if needed) | Run-step streaming, Work Chart status |
| Object storage | S3-compatible | Artifacts, uploads, generated reports |
| Secrets | KMS-backed envelope encryption | OAuth tokens, webhook signing keys |
| Billing | Stripe + internal usage ledger | Credits/metered runs; users never see tokens |
| Observability | OpenTelemetry + product run traces | Paperclip pattern: opt-in OTLP exporter |

### 3.3 Monorepo layout (Paperclip-derived)

```
augmentic/
├── apps/
│   └── web/                 # Next.js app (UI + API routes)
├── packages/
│   ├── db/                  # Drizzle schema, migrations, seed, clients
│   ├── shared/              # types, zod validators, constants, API paths,
│   │                        #   risk tiers, policy defaults
│   ├── engine/              # durable run engine: lifecycle steps, retries,
│   │                        #   idempotency, resume-from-approval
│   ├── agent-runtime/       # LLM wrapper: planning, tool-calling loop,
│   │                        #   provider adapters, prompt assembly
│   ├── connectors/          # integration connectors (gmail, gcal, drive,
│   │                        #   slack, webhook, hubspot, quickbooks, …)
│   └── policy/              # deterministic risk classification, tool
│                            #   permission checks, injection guards
├── docs/                    # PRD, this spec, implementation plan
└── research/                # reference material (not shipped)
```

**Contract-sync rule (adopted from Paperclip AGENTS.md):** any schema or API behavior change must update `packages/db`, `packages/shared`, server routes/services, and UI clients in the same change.

## 4. Data model

All tables carry `id` (uuid), `workspace_id` (except `user` and `workspace`), `created_at`, `updated_at`. Workspace scoping is enforced in the service layer on every query and mutation.

### 4.1 Tenancy & identity

| Entity | Key fields | Notes |
|---|---|---|
| `workspace` | name, slug, settings (retention, security), onboarding_profile | Tenant root |
| `user` | email, name, auth identity | Global |
| `membership` | user_id, workspace_id, role | role ∈ owner, admin, operator, approver, viewer (PRD §11 RBAC) |
| `invitation` | email, role, token, expires_at | |

### 4.2 Agents & Work Chart

| Entity | Key fields | Notes |
|---|---|---|
| `agent` | name, role_title, job_description, status, autonomy_mode, supervisor_user_id, spend_cap_monthly, template_id, avatar | status ∈ active, paused, needs_setup, blocked, error. autonomy ∈ draft_only, ask_before_acting, ask_when_unsure, autonomous_low_risk |
| `agent_template` | role, job_description, default_skills, app_dependencies, default_workflows, approval_policy_defaults | 5 MVP templates (PRD §7) |
| `org_node` | node_type, ref_id, parent_node_id, position | node_type ∈ human, agent, department, workflow, tool, approval_queue |
| `org_edge` | from_node_id, to_node_id, edge_type | edge_type ∈ supervises, triggers, uses_tool, hands_off, routes_approval, delivers_to (PRD §8) |
| `skill` | name, description, instructions, input_schema, output_schema, allowed_tools, tests | Custom skills are P1 |
| `agent_skill` | agent_id, skill_id, enabled | |
| `memory_item` | agent_id, kind, content, source_run_id | Editable/deletable facts learned in setup interview & runs |

### 4.3 Integrations & tools

| Entity | Key fields | Notes |
|---|---|---|
| `integration_connection` | provider, account_label, oauth scopes, secret_ref_id, health_status, connected_by | OAuth-first; health checked in preflight |
| `tool_definition` | provider, name, description, input_schema, risk_tier | risk_tier ∈ read, draft, internal_write, external_send, publish, delete, spend, admin (PRD §13) |
| `tool_permission_policy` | agent_id, tool_definition_id, setting | setting ∈ allow, require_approval, deny |
| `secret_ref` | kms key ref, ciphertext, rotation metadata | Never stored plaintext |

### 4.4 Knowledge & brand

| Entity | Key fields | Notes |
|---|---|---|
| `knowledge_collection` | name, scope (workspace \| agent) | |
| `knowledge_item` | collection_id, source_type (upload, link, text), content, embedding, tags | pgvector; chunked; citations tracked per run |
| `brand_profile` | tone, offerings, ICP, competitors, pricing_notes, escalation_rules, forbidden_claims, facts | PRD FR-010 |

### 4.5 Workflows & runs

| Entity | Key fields | Notes |
|---|---|---|
| `workflow` | name, instructions, agent_id, delivery_target, approval_policy, status, template_id | Plain-language; status ∈ draft, ready, active, paused, blocked |
| `workflow_template` | category, name, instructions, dependencies, sample_output, trigger_options, default_role, required_scopes, default_approval_policy, success_metric | ≥10 at MVP (PRD §14) |
| `workflow_trigger` | workflow_id, trigger_type, config | trigger_type ∈ manual, schedule (cron+tz), webhook (signed URL), app_event |
| `workflow_run` | workflow_id, trigger snapshot, status, started/finished, cost_total | status ∈ queued, running, waiting_approval, succeeded, failed, cancelled |
| `agent_run` | workflow_run_id, agent_id, plan, model usage, status | |
| `run_step` | agent_run_id, seq, step_type, input, output, error, duration, cost | step_type follows lifecycle §5 |
| `tool_call` | run_step_id, tool_definition_id, connection_id, args, result, idempotency_key, risk_tier, approval_request_id | Args/results logged; external data shared is recorded |
| `approval_request` | workflow_run_id, tool_call_id, requested_action, payload_diff, evidence, risk_tier, policy_reason, status, decided_by, decision_note | status ∈ pending, approved, rejected, edited, revision_requested, expired |
| `artifact` | run_id, kind, storage_ref, metadata | Reports, drafts, files |

### 4.6 Governance & metering

| Entity | Key fields | Notes |
|---|---|---|
| `audit_event` | actor (user \| agent \| system), event_type, entity ref, payload, ip | **Append-only** — no update/delete path in code; covers auth, settings, integrations, permissions, approvals, tool calls, external writes (FR-018) |
| `usage_ledger_entry` | scope (workspace/agent/workflow/run), kind (model_tokens, tool_call, run, credit), quantity, cost, provider, model | Paperclip-style multi-dimension cost events (FR-019) |
| `budget_policy` | scope, monthly_cap, warning_threshold, hard_stop | Hard stop auto-pauses agent and cancels queued work |
| `notification_subscription` | user_id, channel (email, slack), event_types | P1 |

## 5. Run lifecycle (the heart of the system)

Every workflow run executes this pipeline as durable, individually-retryable steps (PRD §12.2). Each step writes a `run_step` row and streams to the UI within 1s of completion.

1. **Trigger** — manual / schedule / webhook / app event. Trigger payload snapshotted onto the run.
2. **Preflight** — integration health, tool permissions, spend cap vs `budget_policy`, knowledge readiness, workflow status. Fail → run `blocked` with a legible reason ("Gmail connection expired").
3. **Plan** — agent produces a bounded plan: expected tools, outputs, step budget.
4. **Retrieve evidence** — least-privilege reads (knowledge, email, CRM, calendar, finance). All retrieved content is tagged **untrusted** (§7).
5. **Draft / propose** — agent produces output or a proposed tool call.
6. **Risk classify** — `packages/policy` deterministically classifies each proposed action by tool risk tier + agent permission policy + workspace policy. *Outside the model.*
7. **Approve or auto-execute** — allowed low-risk actions run; sensitive actions create an `approval_request` and the run parks in `waiting_approval`. **Resumable for minutes or days** (FR-016): all resume state is in the DB, not in process memory.
8. **Execute** — tool call with idempotency key; args and results logged. A retry must never duplicate an external action (PRD §11).
9. **Verify** — outcome check, output validation, artifact creation.
10. **Deliver** — run log, Slack/email, report, CRM note, or draft queue per workflow `delivery_target`.
11. **Ledger & audit** — cost, duration, approvals, external writes, and value metrics recorded.

**Engine invariants (Paperclip-derived):**

- Atomic run checkout — one execution lock per run; no double-work on concurrent triggers.
- Budget check precedes every model/tool call; hard-stop pauses the agent and cancels queued runs.
- Orphaned-run recovery — a reaper reclaims runs whose worker died and resumes or fails them explicitly.
- Idempotency keys on every external write where the target API supports it.

## 6. Agent runtime

- **One role-agent per AI employee.** Specialist subagents only at real contract boundaries (different tools/policy/output schema); prefer manager-style *agents-as-tools* for bounded ops (summarize, classify, extract, evidence-check). Handoffs only when another AI employee owns the branch (PRD §12.3).
- **Prompt assembly:** system frame (identity, job description, autonomy, forbidden actions) + brand profile + relevant memory + skill instructions + workflow instructions + *clearly delimited untrusted evidence*.
- **Provider adapter interface** so model/provider is configuration, not architecture. Cheap models for extraction/classification steps to protect margin (PRD §19).
- **Setup interview:** on first activation the agent runs a structured interview (SOPs, tone, escalation rules, forbidden actions) whose answers become `memory_item`s and policy suggestions.
- **Chat surface** per agent for ad-hoc tasks, with visible step logs — chat tasks flow through the same run pipeline and policy engine as workflows.

## 7. Safety, policy & trust model

### 7.1 Tool risk tiers and defaults (PRD §13)

| Tier | Examples | MVP default |
|---|---|---|
| Read | search inbox, read calendar, fetch CRM record | Allow after OAuth consent |
| Draft | draft email/CRM note/invoice reminder | Allow; saved as draft |
| Internal write | create task, tag record, internal note | Approval until trusted, then configurable |
| External send | send email, customer message | **Always approval in MVP** |
| Publish | social post, campaign, website | **Always approval in MVP** |
| Delete | delete record/file/message | Deny or owner-approval only |
| Spend | payments, refunds, ads | Out of scope / owner-approval only |
| Admin | permissions, invites, secrets | **Deny for agents in MVP** |

### 7.2 Prompt-injection mitigations

- Trusted instructions and untrusted retrieved content are structurally separated in prompts; all external data labeled as untrusted evidence.
- Retrieved content can never modify policy, identity, tool permissions, or approval requirements — enforced because policy decisions happen in `packages/policy`, outside the model.
- Narrow tool schemas + server-side zod validation of every tool call.
- Approval required for external writes and sensitive connectors; allowlists for MCP servers/domains (post-MVP).
- Every payload shared with a third-party tool is logged to `tool_call` / `audit_event`.

### 7.3 Approval UX contract (PRD §13)

Every approval request must show: requester (agent + workflow), original instruction, proposed action with **exact payload/diff**, tool + connected account, data leaving the workspace, risk tier + policy reason, evidence/citations, and actions: **approve / reject / edit / request revision / comment**. Decisions are audit-logged with approver, time, and final external action; the paused run resumes from saved state.

## 8. Integrations (MVP set, PRD FR-007)

Google Gmail, Google Calendar, Google Drive, Slack, one CRM (HubSpot *or* Pipedrive — open question §20 of PRD), one finance app (QuickBooks *or* Xero), and a generic signed webhook. Each connector implements a common interface:

```ts
interface Connector {
  provider: string;
  oauth: { scopes: string[]; authorize; refresh; revoke };
  health(): ConnectionHealth;
  tools: ToolDefinition[];          // each with risk_tier + zod input schema
  events?: AppEventSource;          // for app-event triggers
}
```

Minimum OAuth scopes; connection health surfaced in preflight and the integration catalog ("connected / needs re-auth / missing permission").

## 9. Work Chart

Interactive graph (nodes/edges from §4.2) with five MVP views (PRD §8): **Overview** (departments + AI employees), **Responsibilities** (workflow → owner), **Approvals** (blocked actions + approvers), **Tools** (agent ↔ integration read/write map), **ROI** (runs, time-saved estimate, cost, human edit rate). Agent nodes show status, supervisor, connected apps, owned workflows, approval policy, spend vs cap, and recent work. Loads in <2s for beta-sized workspaces; status updates stream over SSE. Clicking any node opens its detail page.

## 10. Workflows, triggers, simulation

- **Two-step creation** (Cyndra pattern): Choose (≥10 templates across reports, follow-ups, CRM hygiene, finance admin, inbox triage, content drafts — PRD §14; or blank) → Set up (name, instructions, trigger, agent, delivery, approval policy) with a **dependency-readiness gate**: create disabled until required connections exist.
- **Triggers:** manual (Run button), schedule (cron + timezone + next-runs preview), signed webhook URL (generated on save), app event (≥1 provider end-to-end at MVP).
- **Simulation mode (FR-014):** dry-run the pipeline against recent/sample data — shows plan, evidence, likely tool calls, and output. No external writes ever execute in simulation; required before first activation.

## 11. Billing & usage

Internal `usage_ledger` is the source of truth; Stripe handles payment. Packaging maps to AI employees + usage credits (PRD §16: Starter / Growth / Pro + managed onboarding). Users see cost per agent, run, workflow, workspace — never tokens. Per-agent monthly spend caps enforce hard stops via `budget_policy`.

## 12. Non-functional requirements (PRD §11)

- **Reliability:** runs durable, replayable, retryable, idempotent; partial progress visible and recoverable; failed tool calls never silently duplicate external actions.
- **Security:** OAuth-first (no browser password storage), KMS envelope encryption, minimum scopes, workspace isolation on every query, third-party data-sharing logged, retention controls per workspace.
- **Governance:** append-only audit, tool-level approval policies, per-agent spend caps, 5-role RBAC, policy templates for sensitive categories.
- **Performance:** Work Chart <2s initial load; run-step streaming <1s; long runs continue without an open browser; approvals can be delayed days and resume.

## 13. Out of scope for MVP (PRD §7)

Autonomous payments/money movement, autonomous ad-spend changes, browser-password automation, open-ended web RPA, third-party template marketplace, white-label reseller platform, HIPAA/PCI/FINRA compliance claims.

## 14. Success metrics to instrument from day one

Activation: workspace created → first integration → first agent → first simulation → first completed run → first approval → time-to-first-completed-work. Quality: workflow completion rate, tool-call success rate, approval acceptance rate, human edit rate, cost per completed workflow. These drive the ROI dashboard later, so events are emitted from the run engine at MVP even though the dashboard is Phase 2 (full list in PRD §15).
