# Security model & hardening notes

How Augmentic keeps tool-using agents safe, and the operational checklist for
running it with real credentials. Companion to Spec §7 and Plan 2.6.

## Trust architecture (enforced in code)

1. **Policy outside the model.** Every model-proposed tool call is validated
   against the tool's JSON schema and risk-classified by `packages/policy`
   before anything executes — in every surface (workflow, chat, simulation).
   The model cannot loosen policy; retrieved content cannot change it.
2. **Hard tiers.** `external_send` and `publish` always require human
   approval; `delete`/`spend` are denied by default; `admin` is denied for
   agents unconditionally. Per-agent settings can only tighten, never loosen
   these MVP floors (`packages/shared/src/policy-defaults.ts`).
3. **Untrusted evidence.** All retrieved content (email, docs, chat, CRM,
   finance records) is wrapped in sentinel-delimited untrusted blocks; any
   sentinel-lookalike sequences inside content are defanged
   (`packages/policy/src/untrusted.ts`).
4. **Tenant isolation.** Every domain table carries `workspace_id`; all reads
   and mutations flow through `requireWorkspace`, which resolves membership
   from the session. Cross-tenant approval decisions are rejected
   (integration-tested).
5. **Durable, idempotent execution.** External writes carry idempotency keys;
   a retried step can never double-send. Runs park in the DB for approvals
   and resume from saved state.
6. **Append-only audit.** No update/delete code path exists for
   `audit_events`. Every mutation, approval decision, external write, and
   data-retention purge is recorded. Export via Settings → Audit export.

## Red-team fixtures

The demo dataset ships with deliberate prompt-injection payloads across
surfaces — email (`m-1005`), Drive doc (`f-3003`, includes a sentinel-escape
attempt), and Slack (`#general` guest message with a webhook-exfil demand).
`packages/engine/test/hardening.test.ts` asserts none of them can produce an
unapproved sensitive tool call. Add new fixtures there when adding retrieval
surfaces.

## Secrets & OAuth checklist (before real credentials)

- [ ] Set `AUGMENTIC_SECRET_KEY` from a KMS/secret manager (OAuth tokens are
      AES-256-GCM encrypted at rest; the dev fallback key is NOT safe for
      production).
- [ ] Set `DATABASE_URL` to managed Postgres (PGlite is dev-only).
- [ ] Register OAuth apps with the **minimum scopes** listed in
      `packages/connectors/src/oauth.ts`; review Google's sensitive-scope
      verification requirements for `gmail.modify`.
- [ ] Confirm redirect URIs are exact-match HTTPS in each provider console.
- [ ] Tokens are refreshed automatically on expiry and re-encrypted
      (`refreshAccessToken`); verify refresh works per provider before beta.
- [ ] Set `AUGMENTIC_BASE_URL` so approval deep links and webhook URLs are
      correct.
- [ ] Webhook triggers verify HMAC-SHA256 signatures with per-trigger
      secrets; rotate by recreating the trigger.
- [ ] Client-safe approval links expire in 7 days and grant approval-only
      access; treat the URL as a bearer credential.
- [ ] Per-workspace data retention (Settings) purges old run data; the audit
      log is exempt by design — export and archive it externally if needed.

## Engine scaling notes (Inngest/Temporal evaluation)

All run state (`workflow_runs.resume_state`, `run_steps`, `tool_calls`,
`approval_requests`) lives in Postgres, not in the worker. The embedded
worker (`packages/engine/src/worker.ts`) is a polling loop with atomic
checkout and an orphan reaper — adequate for beta-sized workspaces
(`packages/engine/scripts/load-test.mjs` exercises it). To move to Temporal/Inngest later:
replace `startEngine`'s tick with engine-triggered invocations of
`processRun(db, runId)`; no data migration is required because the engine was
never the system of record.
