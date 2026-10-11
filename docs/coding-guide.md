# Augmentic — Coding Guide

Audience: anyone (human or AI model) changing this codebase. If you follow
nothing else, follow the **Invariants** section — every one of them is
enforced by tests or review, and every one exists because breaking it causes
a real failure, not a style complaint.

Companion docs: [`specifications.md`](specifications.md) (architecture),
[`implementation-plan.md`](implementation-plan.md) (roadmap and feature ids
like "FR-016" or "plan 2.5" referenced in code comments).

---

## 1. Repo shape and layering

pnpm monorepo. Dependencies point strictly downward — a package may import
from anything below it, never above:

```
apps/web            Next.js App Router UI + server actions + route handlers
  ↓
packages/engine     durable run engine: worker, pipeline, approvals, billing,
                    retention, notifications, audit, secrets
packages/agent-runtime  LLM tool-calling loop (provider-agnostic, keyless fallback)
packages/connectors     tool execution per provider + OAuth + MCP client
  ↓
packages/policy     deterministic risk classification + arg validation + untrusted wrapping
packages/db         Drizzle schema, migrations, seeds, PGlite/Postgres client
packages/shared     enums, zod validators, tool catalog, plan catalog, types
```

`shared` and `policy` are pure (no I/O). `db` owns all schema. The engine
owns all run/approval state transitions — the web app never flips a run or
approval status directly; it calls engine functions.

**Contract-sync rule (Spec §3.3):** a schema or contract change updates
`packages/db`, `packages/shared`, the engine/service layer, and the UI in
the *same commit*. Never land a column the UI doesn't render or an enum
value the engine doesn't handle.

## 2. Invariants (non-negotiable)

1. **Workspace scoping.** Every domain table has `workspace_id`; every query
   filters on it; every server action starts with
   `requireWorkspace(slug, minRole)` ([context.ts](../apps/web/src/lib/context.ts)).
   Cross-tenant access must be impossible *by construction*, and each new
   entity gets an isolation test (see "cross-tenant approval decisions are
   rejected" in [pipeline.test.ts](../packages/engine/test/pipeline.test.ts)).

2. **Policy outside the model.** No tool executes without clearance from
   `classifyToolCall` ([classify.ts](../packages/policy/src/classify.ts)) —
   deterministic, server-side, in every surface (workflow, chat, simulation,
   evidence loop). The model's output *never* influences the risk tier: tiers
   come from the tool catalog, permissions from the DB. The connector layer
   re-blocks simulation side effects as defense in depth
   ([execute.ts](../packages/connectors/src/execute.ts)).

3. **Untrusted content stays untrusted.** Anything retrieved from an external
   tool is wrapped by `wrapUntrustedEvidence` and sanitized with
   `sanitizeUntrusted` before it reaches a prompt. If you add a new data
   source, its output is untrusted. Add a poisoned-fixture test for any new
   retrieval path (see the red-team suites in
   [hardening.test.ts](../packages/engine/test/hardening.test.ts) and
   [classify.test.ts](../packages/policy/test/classify.test.ts)).

4. **Audit everything.** Every mutating action and every external write emits
   an `audit_event` via `recordAudit` — in the same PR as the feature. The
   audit table is append-only: no update or delete code path may touch it
   (retention purge is the single, itself-audited exception).

5. **Cost events at the source.** Any code path that calls a model or
   executes a tool writes `usage_ledger` entries via `recordUsage`. Budget
   and quota checks (`checkAgentBudget`, `checkRunQuota`) run *before* the
   spend, not after.

6. **Never lose work.** Over-quota or over-budget behavior parks runs
   (`blocked`, `waiting_approval`) — it never deletes or drops them. The
   retention purge only deletes *terminal* runs; parked work is exempt
   regardless of age ([retention.ts](../packages/engine/src/retention.ts)).

7. **Original content only.** Templates, sample outputs, and UI copy are
   original. Reference projects inform architecture, never assets.

## 3. Engine rules

The engine is a DB-backed durable worker ([worker.ts](../packages/engine/src/worker.ts),
[pipeline.ts](../packages/engine/src/pipeline.ts)). State lives entirely in
Postgres so the executor can be swapped (Inngest/Temporal) without touching
run data. When you touch it:

- **Atomic checkout.** A run is claimed by an UPDATE whose WHERE re-checks
  `status = 'queued'`. Two workers can never both win. Preserve this shape.
- **Heartbeat the lock.** `processRun` refreshes `lockedAt` every 15s while
  executing. The orphan reaper reclaims anything staler than
  `ORPHAN_TIMEOUT_MS` — without the heartbeat, any run slower than the
  timeout gets double-executed. If you add long work outside `processRun`,
  it needs the same treatment.
- **Idempotency keys on external writes.** Every side-effecting tool call
  carries a deterministic key (`run:phase:index:tool`); a retried step finds
  the existing `tool_calls` row and returns its result instead of re-sending.
  New external actions must construct keys the same way.
- **Park, don't poll.** Long waits (approvals) save `resume_state`, set the
  run to `waiting_approval`, and *return*. The decision path re-queues the
  run; the pipeline re-enters at the saved phase. Never hold a worker slot
  waiting on a human.
- **Every step is recorded.** Wrap all work in the `step()` helper so it
  lands in `run_steps` (streamed to the UI over SSE). No silent phases.
- **Deadlines on everything external.** Every `fetch` to a provider, model,
  or MCP server sets `AbortSignal.timeout(...)`. A hung upstream must fail
  the step (retry/park logic takes over), never pin a worker slot. Grep for
  `await fetch(` before merging — a bare one is a bug.
- **Quota/budget gates are layered.** `enqueueRun` gates at insert (parks as
  `blocked`), the pipeline preflight re-checks (excluding the current run
  from its own count — see `checkRunQuota`'s `excludeRunId`), and
  `checkAgentBudget` hard-stops mid-run. Keep all three; they cover
  different races.

## 4. Database rules

- **Migrations are generated, never hand-edited after they've been applied.**
  Change [schema.ts](../packages/db/src/schema.ts), run `pnpm db:generate`
  from `packages/db`, review the SQL, commit schema + SQL + snapshot +
  journal together. If a merge brings a colliding migration number, drop the
  incoming files and regenerate on top of the local chain (this happened at
  the Phase 4 merge; see commit `5080ce0`).
- **Every FK declares its delete behavior.** `cascade` for owned children,
  `set null` for references that should survive (e.g.
  `chat_messages.workflow_run_id`, so retention purges don't strand chat
  history). A bare `.references()` blocks deletes and will break the purge —
  that exact bug shipped once already.
- **PGlite and Postgres must both work.** Dev runs embedded PGlite when
  `DATABASE_URL` is unset; tests run PGlite in-memory. Don't use SQL that
  PGlite lacks; jsonb operators (`->>`) are fine. Anything cleverer needs a
  test proving it runs under PGlite.
- **`workspaces.settings` is a jsonb grab-bag** for per-workspace options
  (plan, trial, retention, security, notification channel). When writing it
  from a form action, *merge with the existing object* and preserve keys the
  submitting form doesn't own (see the marker-field pattern in
  [notification-actions.ts](../apps/web/src/lib/actions/notification-actions.ts)) —
  two settings forms clobbering each other is a silent data-loss bug.
- **Seeds are idempotent and read-mostly.** `seedBuiltins` runs on every
  boot: one SELECT per table, batch INSERT for missing rows, UPDATE only on
  actual change. Keep new seed types on this pattern.

## 5. Query discipline

These are the patterns the codebase settled on after fixing their absence:

- **Bound every list query.** `.limit(n)` plus `orderBy(desc(...))` on
  anything user-visible; project only needed columns for scans (see
  `searchKnowledge`'s column projection + `KNOWLEDGE_SCAN_CAP`).
- **Count in SQL.** For badges/tiles use
  `select({ count: sql<number>\`count(*)\` })`, never fetch rows to take
  `.length` (layout badges, health page).
- **No awaits in loops for independent work.** Batch independent reads with
  `Promise.all` (the pipeline's "load the world" block is the reference —
  one round trip of latency instead of ten). Batch deletes/inserts with
  `inArray`/multi-row `values(...)` instead of per-row statements.
- **Filter in SQL, not JS.** If you fetch rows only to `.filter()` them
  immediately, move the predicate into the WHERE clause (handoff edges,
  active approval links).
- **Background jobs gate SQL-side.** Hourly maintenance must not scan every
  workspace when a jsonb predicate can select the few that opted in
  (`purgeExpiredData`).

## 6. Web app rules

- **Server components + server actions.** No client-side data fetching, no
  REST client layer. Route handlers exist only where the caller isn't the
  app itself: SSE streaming, OAuth callbacks, signed webhooks, file exports.
- **Every action:** `"use server"` → `requireWorkspace(slug, minRole)` →
  zod-parse inputs from `FormData` → mutate → `recordAudit` → `revalidatePath`.
  Role minimums: mutations `operator`, approvals `approver`, settings/policy
  `admin`. Read the existing actions in
  [apps/web/src/lib/actions](../apps/web/src/lib/actions) before writing a
  new one; match their shape exactly.
- **Unauthenticated surfaces are token-scoped.** The external approval page
  re-validates its token *at decision time*, exposes approve/reject only,
  and audits with `actorType: "external"`
  ([external-approval-actions.ts](../apps/web/src/lib/actions/external-approval-actions.ts)).
  Any new public surface follows that template: the token is the credential,
  every guard re-checked server-side on the mutation.
- **Mobile is not optional.** The shell has a desktop sidebar and a mobile
  top bar; new page layouts use responsive grids (`grid-cols-1 md:grid-cols-2`),
  and anything reachable from a notification must be usable on a phone.
- **UI primitives** come from [components/ui.tsx](../apps/web/src/components/ui.tsx)
  (`Card`, `Button`, `PageHeader`, `StatusBadge`, …). Don't hand-roll
  variants of these.

## 7. Configuration posture

Every external dependency is optional and *degrades, never breaks*:

| Capability | Env | Without it |
|---|---|---|
| LLM runtime | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | deterministic simulated runtime |
| Real OAuth connections | per-provider `*_CLIENT_ID`/`*_CLIENT_SECRET` | demo connections, same product flow |
| Email notifications | `RESEND_API_KEY` + `EMAIL_FROM` | in-app + Slack only |
| Stripe checkout | `STRIPE_SECRET_KEY` | direct plan switch |
| Absolute links | `AUGMENTIC_APP_URL` | `http://localhost:3000` |

Rules: check availability with a helper (`isEmailConfigured()`), never
scatter raw `process.env` reads; the canonical base-URL helper is `appUrl()`
from the engine — do not invent new env names for existing concepts (there
was exactly one `AUGMENTIC_BASE_URL` stray; it's gone, keep it that way).
In-app records are always the source of truth; external delivery (Slack,
email) is best-effort fire-and-forget.

## 8. Testing

`pnpm -r test` (Vitest) and `pnpm -r typecheck` must both be clean before
any commit. Tests run against in-memory PGlite
(`process.env.PGLITE_DATA_DIR = ":memory:"`) with `seedBuiltins` — no mocks
of the database, ever.

What a change must ship with:

- **New entity / route** → workspace-isolation test (member of A cannot
  touch B's rows).
- **New tool or retrieval source** → policy test (deny/approval tiers hold)
  and a poisoned-fixture test if it returns external content.
- **New engine behavior** → a test that exercises the *durable* property:
  restart-resume, exactly-once, park-and-resume, or quota parking — not just
  the happy path (see [billing.test.ts](../packages/engine/test/billing.test.ts)
  for the shape: insert cheap rows to reach boundaries instead of executing
  hundreds of runs).
- **Bug fix** → the test that would have caught it, in the same commit.

## 9. Style

- TypeScript strict; no `any` (the rare drizzle jsonb impedance uses
  `as never` — copy existing usage, don't invent new escapes).
- Comments state **constraints and reasons the code can't express** — why a
  lock is re-checked, why a count excludes a row, which spec section demands
  a behavior (`(FR-016)`, `(plan 2.5)`, `(Spec §7.2)`). Never narrate what
  the next line does, and never leave "changed X to Y" archaeology.
- Exports are demand-driven: a package's `index.ts` exposes only what
  another package imports today. Internal helpers stay unexported; dead
  modules get deleted, not kept "just in case". There is no backwards
  compatibility to preserve — this repo has no external consumers, so when
  you rename or replace something, migrate *all* callers and delete the old
  thing in the same commit.
- Naming: tables `snake_case`, TS `camelCase`, enums as `as const` arrays in
  [shared/enums.ts](../packages/shared/src/enums.ts) with derived types.
  Tools are `provider.verb_noun` (`gmail.send_email`, `mcp.<server>.<tool>`).
- Money is integer cents (`costCents`, `priceCentsMonthly`). Time constants
  are underscored ms literals (`86_400_000`) with a named constant when
  reused.

## 10. Pitfalls that actually happened (checklist)

Before you commit, check your change against the class of bug each of these
represents:

- [ ] Long-running work without a lock heartbeat → double execution when the
      reaper fires. (`processRun` heartbeat)
- [ ] A quota/limit re-check that counts the thing being checked →
      self-blocking at the boundary. (`checkRunQuota(..., excludeRunId)`)
- [ ] An FK without `onDelete` → blocks retention/cascade deletes months
      later. (`chat_messages.workflow_run_id`)
- [ ] Two forms writing one jsonb settings blob → the second form silently
      wipes the first form's keys. (marker-field merge pattern)
- [ ] External `fetch` without `AbortSignal.timeout` → wedged worker slot or
      hung request handler.
- [ ] Unbounded `select()` that "works in dev" → full-table scan into memory
      at customer scale. (knowledge search cap)
- [ ] Per-row SELECT/INSERT loops in boot or maintenance paths → hundreds of
      round trips nobody notices locally. (seed rewrite)
- [ ] Trusting a redirect/query param as proof of payment or identity →
      verify server-side against the source (Stripe session verification).
- [ ] Merge bringing parallel migrations → renumber on top of the local
      chain and regenerate; never keep two files with the same index.
- [ ] Notification spam from recurring triggers → dedupe with a time-window
      check before notifying. (quota-blocked run notifications)
