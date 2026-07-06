# Augmentic

**AI workforce orchestration for SMBs.** Hire AI employees for repetitive business work, connect the tools your business already uses, approve risky actions, and watch the Work Chart fill with completed work.

Docs: [PRD](docs/prd-ai-workforce-orchestration-saas.md) · [Specifications](docs/specifications.md) · [Implementation plan](docs/implementation-plan.md)

## Quickstart (zero setup)

```bash
pnpm install
pnpm dev          # → http://localhost:3000
```

No database or API keys needed for a full demo:

- **Database**: embedded PGlite (persisted under `.pglite/`) when `DATABASE_URL` is unset. Set `DATABASE_URL` for real Postgres.
- **LLM**: a deterministic simulated runtime runs the full product loop offline. Set `ANTHROPIC_API_KEY` (preferred) or `OPENAI_API_KEY` for real models. Override models with `AUGMENTIC_MODEL` / `AUGMENTIC_CHEAP_MODEL`.
- **Integrations**: "demo accounts" simulate Gmail/Calendar/Drive/Slack with a realistic fictional dataset. Set `GOOGLE_CLIENT_ID/SECRET` and `SLACK_CLIENT_ID/SECRET` for real OAuth.
- **Secrets**: set `AUGMENTIC_SECRET_KEY` in production (OAuth tokens are AES-256-GCM encrypted at rest).

Try the core trust loop: sign up → create workspace → **Integrations**: connect demo Google + Slack → **Hire AI employee** (e.g. Finance Admin) → finish the setup interview → **Workflows → New** from the *Invoice payment chaser* template → **Simulate** (no side effects) → **Run now** → the external email send parks in the **Approval Center** → approve (or edit the payload) → the same run resumes and completes → inspect the run log, **Audit**, **Usage**, and the **Work Chart**.

## Monorepo layout (Spec §3.3)

```
apps/web                 Next.js app (UI + server actions + API routes)
packages/db              Drizzle schema, migrations, seeds (PGlite or Postgres)
packages/shared          enums, zod validators, tool catalog, API paths
packages/engine          durable run engine: 11-step lifecycle, worker loop,
                         approvals/resume, schedules, budgets, audit/usage
packages/agent-runtime   provider-agnostic LLM runtime (Anthropic/OpenAI/simulated)
packages/connectors      integration connectors (demo + real executors, OAuth)
packages/policy          deterministic risk classification & arg validation
```

**Contract-sync rule:** any schema or API change updates `packages/db`, `packages/shared`, server, and UI in the same change.

## Engineering invariants

- Workflow state, approvals, and audit live in **our DB** — the engine is swappable (Inngest/Temporal later), the model is never the orchestrator of record.
- Every model-proposed tool call is validated (JSON schema) and risk-classified **outside the model**; external sends/publishes always require human approval in MVP; retrieved content is wrapped as untrusted evidence.
- Runs are durable and resumable: approval pauses park the run in the DB and resume days later; external writes carry idempotency keys (no double-send on retry); an orphan reaper reclaims dead workers.
- Every mutation and external write emits an append-only `audit_event`; every model/tool call writes a `usage_ledger` entry; per-agent spend caps hard-stop and pause the agent.

## Commands

```bash
pnpm dev              # run the app (embedded DB, embedded engine worker)
pnpm build            # build all packages + the web app
pnpm typecheck        # typecheck everything
pnpm test             # run tests (policy unit tests + engine integration tests)
pnpm db:generate      # generate SQL migrations after schema changes
pnpm db:migrate       # apply migrations explicitly (also runs on boot)
pnpm db:seed          # seed built-in templates & tool definitions (also runs on boot)
```
