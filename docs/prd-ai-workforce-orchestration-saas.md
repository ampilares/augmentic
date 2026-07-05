# PRD: Augmentic AI Workforce Orchestration SaaS for SMBs

Status: Draft for product/engineering review  
Owner: Augmentic  
Created: 2026-07-05  
Primary repo input: `research/cyndra/cyndra-ai-analysis.md`  
Inspirations: Cyndra-style AI employee SaaS, Paperclip-style org/work chart concept supplied by the founder

## 1. Executive summary

Build Augmentic as an AI workforce orchestration SaaS for small and medium businesses that need practical help automating manual admin, revenue, finance, support, and marketing tasks. The product should feel less like an abstract agent builder and more like an operating system for hiring, managing, supervising, and measuring AI employees.

The recommended product shape is a Cyndra-inspired SaaS, not a literal copy of Cyndra's proprietary UI, copy, screenshots, or templates. The clone target is feature architecture: agent roster, role templates, app connections, skills, knowledge, workflows, schedules, approvals, audit logs, usage, billing, and workspace controls. The major differentiator should be a Paperclip-inspired **Work Chart**: an interactive org-chart-like map of human roles, AI employees, owned workflows, connected tools, approval routes, KPIs, and ROI.

The core promise: **deploy AI employees that complete repetitive business work through the tools the business already uses, while humans stay in control of risky actions.**

## 2. Problem

SMB owners and operators have high-value but low-leverage manual work scattered across email, calendars, CRMs, finance tools, spreadsheets, chat, ticketing, documents, and social channels. They do not want to build agents from first principles. They want an outcome: fewer missed leads, cleaner CRM, faster client follow-up, reliable weekly reports, invoice chasing, inbox triage, content drafts, and task handoff.

Current automation products fall into three buckets:

1. **Workflow automation tools** such as Zapier or Make: powerful, but often brittle, node-heavy, and poor at judgement-heavy work.
2. **Chatbots and copilots**: helpful for one-off drafting, but weak at recurring, accountable execution.
3. **Agent demos**: exciting but not trustworthy enough for SMBs to grant write access, external communication, or spend authority.

Augmentic should sit between automation and staffing: each AI employee has a job, tools, routines, policies, approvals, memory, run history, and measurable output.

## 3. Research synthesis

### 3.1 Internal Cyndra research takeaways

The Cyndra research in this repo shows a product model built around “AI employees” operating inside familiar tools and channels. The app is not only a chat UI; it includes agents, integrations, workflows, skills, knowledge, schedules, billing, brands, team, audit, usage analytics, settings, and chat.

The most important patterns to carry forward:

- Package agents as jobs, not prompts.
- Let users choose from ready-made roles or create a custom role.
- Treat apps as permissions/tools, skills as know-how, and workflows/schedules as recurring execution.
- Make approvals and autonomy levels first-class.
- Include workspace-level trust primitives: audit, usage, spend caps, roles, security settings, and billing.
- Use plain-language workflow setup rather than forcing SMB users into visual node-canvas automation.
- Avoid copying proprietary UI, copy, screenshots, visual assets, or exact templates.

### 3.2 External research and platform signals

Recent agent benchmarks show that fully autonomous SaaS operation is still unreliable for realistic professional workflows. SaaS-Bench evaluates agents across deployable SaaS environments and found that even the strongest model completed fewer than 4% of tasks end-to-end. The product should therefore optimize for constrained scopes, durable workflows, API-first integrations, approvals, run logs, recovery, and measurable task completion rather than promising broad unattended autonomy.

Agent security research also shows that tool-using agents are vulnerable to prompt injection from external data. Augmentic should adopt least privilege, untrusted-content labeling, policy checks outside the model, tool-specific guardrails, explicit approvals for sensitive actions, and thorough logging.

OpenAI's current agent platform guidance supports app-owned orchestration when the application owns tool execution, approvals, and state. The right design for Augmentic is therefore: product-owned workflow state, product-owned permissions, product-owned approval and audit systems, with LLM agents used inside those boundaries.

Durable execution is mandatory. Agents will wait for approvals, react to webhooks, run schedules, retry external APIs, and resume after failures. The orchestrator must treat LLM calls and integrations as recoverable steps, not ephemeral request handlers.

## 4. Product thesis

Augmentic wins by becoming the **AI Workforce OS for SMB operators**.

The winning wedge is not “build any agent”. It is:

> “Hire AI employees for the jobs your team keeps doing manually. Connect your tools, review risky actions, and watch the work chart fill with completed work and ROI.”

This thesis implies three product principles:

1. **Role-first setup:** users start with jobs such as Executive Assistant, Sales Ops Rep, Client Success Rep, Finance Admin, Marketing Ops Assistant, or Support Triage Rep.
2. **Work-chart management:** the home screen is an org/work chart, not a blank chat window. It shows who does what, what is automated, what needs approval, what tools are connected, and how much value has been created.
3. **Trust before autonomy:** agents draft and recommend by default; external writes, customer communication, spend, deletion, and publishing require approval until the workspace policy explicitly allows more autonomy.

## 5. Target customers and personas

### Initial customer segment

Focus on service-oriented SMBs with 5-100 employees and high communication/admin load:

- Digital agencies and creative studios.
- Professional services firms: consultants, accountants, recruiters, fractional operators.
- Local service businesses with lead response, quoting, scheduling, review requests, and payment follow-up.

### Primary personas

**Owner/operator**  
Needs time back, fewer dropped balls, and visibility. Cares about trust, ROI, and avoiding reputational damage.

**Ops manager / chief of staff**  
Owns processes, inboxes, reports, CRM hygiene, handoffs, and recurring work. Wants configurable workflows, reliable logs, and escalation controls.

**Team lead**  
Wants help in a department: sales, support, finance, marketing, or client success. Needs agents to fit existing tools and SOPs.

**Approver / reviewer**  
May not configure agents but must review drafts, approve sensitive actions, and inspect what happened.

## 6. Positioning

### Category

AI workforce orchestration for SMBs.

### Primary messaging

- “Hire AI employees for repetitive business work.”
- “Turn your org chart into a work chart.”
- “Connect your apps, assign jobs, approve risky actions, and measure work completed.”
- “AI agents that work like staff, not scripts.”

### Avoid

- “Fully autonomous workforce” as a default promise.
- “No humans needed.”
- “Clone Cyndra” in public-facing language.
- “Universal browser automation” as the core wedge.

## 7. Product scope

### MVP must include

1. Multi-tenant workspace, users, roles, and team invitations.
2. Work Chart home screen.
3. Agent templates for 5 initial AI employee roles.
4. Agent detail pages with role description, tools, skills, workflows, memory, access, settings, and activity.
5. Integration connections for the highest-value SMB stack.
6. Knowledge base and company/brand profile.
7. Plain-language workflow builder with template and custom modes.
8. Schedules, manual runs, webhook triggers, and app-event triggers.
9. Approval center and approval lifecycle.
10. Run log, step traces, artifacts, usage ledger, and audit log.
11. Usage-based billing foundation with per-agent packaging.
12. Simulation mode for previews before enabling real actions.

### Initial AI employee templates

| Template | Primary jobs | Initial tools | Approval defaults |
|---|---|---|---|
| Executive Assistant | Inbox triage, meeting prep, scheduling drafts, follow-up drafts | Gmail/Outlook, Google Calendar/Microsoft Calendar, Slack/Teams, Drive | Ask before sending or modifying calendar |
| Sales Ops Rep | Lead enrichment, CRM cleanup, follow-up drafts, pipeline summaries | HubSpot/Pipedrive, Gmail, Calendar, LinkedIn/manual data, Sheets | Ask before external emails or CRM stage changes |
| Client Success Rep | Weekly client summaries, ticket digest, action-item follow-up, renewal prep | Slack/Teams, Gmail, Notion/Drive, Zendesk/Intercom later | Ask before customer-facing messages |
| Finance Admin | Invoice chasing, receipt collection, cashflow snapshots, bookkeeping prep | QuickBooks/Xero, Gmail, Drive, Sheets | Ask before sending payment requests or finance changes |
| Marketing Ops Assistant | Social drafts, competitor watch, content repurposing, campaign reports | Drive/Notion, Slack, social draft export, analytics imports | Ask before publishing or ad changes |

### Out of scope for MVP

- Autonomous bank payments or money movement.
- Autonomous ad spend changes.
- Browser-account automation using stored passwords.
- Open-ended web RPA for arbitrary websites.
- Marketplace for third-party agent templates.
- White-label reseller platform.
- Full HIPAA/PCI/FINRA-grade compliance claims.

## 8. Work Chart concept

The Work Chart is the product's primary navigation and differentiation. It borrows the clarity of an org chart but maps work rather than hierarchy.

### Nodes

Each node represents either a human owner, AI employee, department, workflow, tool, or approval queue.

For each AI employee node, show:

- Name and role.
- Human supervisor.
- Status: active, paused, needs setup, blocked, error.
- Connected apps.
- Enabled skills.
- Owned workflows and schedules.
- Approval policy.
- Monthly budget / spend cap.
- Recent work completed.
- KPI contribution, such as leads touched, replies drafted, invoices chased, hours estimated saved.

### Edges

Edges represent responsibility and execution routes:

- Human supervises AI employee.
- Workflow triggers AI employee.
- AI employee uses app/tool.
- AI employee hands off to another role.
- Sensitive action routes to approver.
- Output delivered to channel/report/client draft.

### Work Chart MVP views

1. **Overview:** departments and AI employees.
2. **Responsibilities:** every recurring workflow mapped to an owner.
3. **Approvals:** which actions are blocked and who must approve them.
4. **Tools:** which agents can read/write each integration.
5. **ROI:** completed runs, time saved estimate, cost, and human edit rate.

## 9. Core user journeys

### Journey A: Set up a workspace

1. User creates workspace.
2. User answers a short onboarding interview: industry, team size, common tools, top manual tasks, risk tolerance.
3. Augmentic proposes an initial Work Chart with 2-3 AI employees and recommended workflows.
4. User invites teammates or skips.
5. User connects Google Workspace or Microsoft 365.
6. User sees setup readiness and missing dependencies.

Success: user reaches a populated Work Chart and has at least one connected app.

### Journey B: Hire an AI employee from a template

1. User clicks “Hire AI employee”.
2. User selects a role template.
3. Product shows job description, recommended apps, skills, default routines, and safety policy.
4. User names the agent and edits the job description in plain English.
5. User connects required apps or marks them for later.
6. Agent runs a setup interview to learn SOPs, tone, escalation rules, and forbidden actions.
7. Agent appears on the Work Chart with status “Ready” or “Needs setup”.

Success: agent can complete a safe read/draft workflow without engineering help.

### Journey C: Create a workflow

1. User chooses a template or starts blank.
2. User defines trigger: manual, schedule, app event, or webhook.
3. User assigns an AI employee.
4. User defines instructions and output destination.
5. Product runs dependency checks.
6. Product simulates one run using recent or sample data.
7. User enables workflow with approval policy.

Success: workflow completes one run and records a run log.

### Journey D: Approve a sensitive action

1. Agent proposes an action such as sending an email, changing CRM stage, publishing content, or updating finance data.
2. Approval request shows original instruction, evidence, proposed tool call, diff/preview, risk level, and agent rationale.
3. Human approves, rejects, edits, or asks the agent to revise.
4. Same run resumes from saved state.
5. Audit log records decision, approver, time, data shared, and final external action.

Success: high-risk work is completed without losing control or context.

### Journey E: Monitor and improve

1. User opens Work Chart or Usage dashboard.
2. User sees work completed, blocked runs, cost, approval acceptance rate, human edit rate, and time saved estimate.
3. User drills into a problematic agent or workflow.
4. User edits SOP, permissions, schedule, or autonomy level.

Success: owner trusts the system enough to add another workflow or agent.

## 10. Functional requirements

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---:|---|
| FR-001 | Multi-tenant workspace and membership | P0 | Users can create workspaces, invite teammates, assign owner/admin/member/approver roles, and switch workspaces. |
| FR-002 | Work Chart | P0 | Shows AI employees, human owners, workflows, tools, approval queues, status, and KPI cards. Clicking any node opens detail. |
| FR-003 | Agent templates | P0 | At least 5 role templates exist with job description, default skills, app dependencies, workflows, and approval policy. |
| FR-004 | Custom agent creation | P0 | User can create an agent from plain-language job description and attach skills/tools. |
| FR-005 | Agent detail page | P0 | Tabs for Overview, Chat, Workflows, Tools, Skills, Knowledge, Memory, Access, Settings, Activity. |
| FR-006 | Integration catalog | P0 | Searchable catalog with OAuth connection status, scopes, app health, and tool permissions. |
| FR-007 | Initial integrations | P0 | Google Gmail, Google Calendar, Google Drive, Slack, HubSpot or Pipedrive, QuickBooks or Xero, generic webhook. |
| FR-008 | Tool permission policy | P0 | Every tool has read/draft/write/send/delete/spend/admin risk tier and per-agent allow/approval/deny setting. |
| FR-009 | Knowledge base | P0 | Upload docs, add links/text, tag to workspace or agent, search/retrieve in runs, show citations/evidence in outputs. |
| FR-010 | Company/brand profile | P0 | Stores tone, offerings, ICP, competitors, pricing notes, escalation rules, forbidden claims, and reusable facts. |
| FR-011 | Workflow templates | P0 | At least 10 templates across reports, follow-ups, CRM hygiene, finance admin, inbox triage, and content drafts. |
| FR-012 | Plain-language workflow builder | P0 | User can set name, instructions, trigger, assigned agent, output destination, approval policy, and dependency checks. |
| FR-013 | Triggers | P0 | Manual, schedule, webhook, and at least one app-event trigger work end-to-end. |
| FR-014 | Simulation mode | P0 | User can preview plan, evidence, likely tool calls, and output using sample/recent data before activation. |
| FR-015 | Approval center | P0 | Pending and historical approval requests with approve, reject, edit, revise, and comment actions. |
| FR-016 | Resumable runs | P0 | A run paused for approval can resume from saved state after minutes or days without restarting. |
| FR-017 | Run log and step trace | P0 | Every run shows trigger, plan, tool calls, evidence, approvals, outputs, errors, retries, duration, and cost. |
| FR-018 | Audit log | P0 | Append-only log for auth, settings, integration, permission, approval, tool-call, and external-write events. |
| FR-019 | Usage ledger | P0 | Tracks model usage, tool usage, credits/cost, workflow runs, active agents, and per-agent spend caps. |
| FR-020 | Agent autonomy settings | P0 | Modes: draft-only, ask before acting, ask when unsure, autonomous for approved low-risk tools only. |
| FR-021 | Notifications | P1 | Email/Slack notifications for approvals, blocked runs, failures, and weekly value summaries. |
| FR-022 | ROI dashboard | P1 | Shows time saved estimate, work completed, revenue touched, invoices chased, leads handled, human edit rate. |
| FR-023 | Custom skills | P1 | Admin can create reusable skills with instructions, input schema, output schema, allowed tools, and tests. |
| FR-024 | Client-safe approval links | P1 | Agencies can share an approval-only link for external stakeholders to approve drafts. |
| FR-025 | Vertical packs | P1 | Pack includes templates, SOPs, policies, and recommended integrations for a specific SMB vertical. |

## 11. Non-functional requirements

### Reliability

- Workflow and agent runs must be durable, replayable, retryable, and idempotent.
- External writes must be idempotency-keyed when the target API supports it.
- A failed tool call must not silently create a duplicate action on retry.
- Product must make partial progress visible and recoverable.

### Security and privacy

- OAuth-first integrations; no browser password storage in MVP.
- Encrypt secrets with cloud KMS or envelope encryption.
- Store minimum required OAuth scopes.
- Isolate tenant data by workspace.
- Log all data shared with third-party tools and MCP servers.
- Treat retrieved web/email/doc content as untrusted data, never as instructions.
- Support workspace-level data retention controls.

### Governance

- Append-only audit log for high-risk state changes and external actions.
- Tool-level approval policies.
- Per-agent spend caps.
- RBAC with owner, admin, operator, approver, viewer.
- Policy templates for sensitive categories: customer communication, finance, publishing, deletion, admin changes, spend.

### Performance

- Work Chart loads initial state within 2 seconds for beta-sized workspaces.
- Run log streams step updates within 1 second of step completion.
- Long-running runs can continue asynchronously without open browser sessions.
- Approval center should support delayed approvals and resume later.

## 12. Recommended architecture

### 12.1 Architecture decision

Use a **product-owned durable orchestration layer** as the system of record, and run LLM agents inside it. Do not let the model be the orchestrator of record.

Recommended target stack:

- Frontend: Next.js / React.
- Backend API: TypeScript service layer.
- Database: Postgres with row-level workspace isolation patterns; pgvector or managed vector DB for knowledge retrieval.
- Durable orchestration: Temporal Cloud for core workflow and agent-run state.
- Agent runtime: OpenAI Agents SDK or Responses API wrapped by Augmentic's run engine.
- Integrations: OAuth official APIs first; trusted MCP servers or internal connector wrappers where useful.
- Realtime: Server-sent events or WebSockets for run logs and Work Chart state.
- Object storage: artifacts, uploaded docs, generated reports, screenshots if later added.
- Secrets: KMS-backed encrypted store.
- Observability: OpenTelemetry plus product run traces.
- Billing: Stripe plus internal usage ledger.

For a very fast prototype, Inngest or Trigger.dev can be used for early durable background jobs. The long-term architecture should still separate `workflow_run`, `agent_run`, `approval_request`, and `tool_call` state so the execution engine can be swapped or hardened.

### 12.2 Run lifecycle

1. **Trigger received:** manual, schedule, webhook, or app event.
2. **Preflight:** check integration health, tool permissions, spend cap, knowledge readiness, and policy.
3. **Plan:** agent creates a bounded plan with expected tools and outputs.
4. **Retrieve evidence:** fetch knowledge, emails, CRM records, docs, calendar events, or finance records with least-privilege tools.
5. **Draft/propose:** agent creates output or proposes a tool call.
6. **Risk classify:** system policy classifies action as read, draft, write, send, delete, spend, or admin.
7. **Approve or auto-execute:** low-risk allowed actions execute; sensitive actions create approval requests.
8. **Execute:** tool call runs with idempotency and logs arguments/results.
9. **Verify:** check outcome, validate output, detect errors, and create artifact.
10. **Deliver:** send to run log, Slack/email, report, CRM note, or draft queue.
11. **Ledger and audit:** record cost, duration, approvals, external writes, and value metrics.

### 12.3 Agent orchestration pattern

Start with one role agent per AI employee. Add specialist subagents only when there is a real contract boundary: different tools, policy, output schema, or trace clarity. Prefer **manager-style agents-as-tools** for bounded specialist operations such as summarization, classification, extraction, or evidence checking. Use handoffs only when another AI employee truly owns the next branch of work.

### 12.4 Data model

Core entities:

- `workspace`
- `user`
- `membership`
- `workspace_role`
- `org_node`
- `agent`
- `agent_template`
- `agent_skill`
- `skill`
- `integration_connection`
- `tool_definition`
- `tool_permission_policy`
- `knowledge_item`
- `knowledge_collection`
- `brand_profile`
- `memory_item`
- `workflow`
- `workflow_template`
- `workflow_trigger`
- `workflow_run`
- `agent_run`
- `run_step`
- `tool_call`
- `approval_request`
- `artifact`
- `audit_event`
- `usage_ledger_entry`
- `secret_ref`
- `notification_subscription`

## 13. Safety, policy, and trust model

### Tool risk levels

| Level | Examples | Default policy |
|---|---|---|
| Read | Search inbox, read calendar, fetch CRM record | Allow after OAuth consent |
| Draft | Draft email, draft CRM note, draft invoice reminder | Allow; save as draft |
| Internal write | Create task, update internal note, tag record | Approval until trusted, then configurable |
| External send | Send email, Slack external channel, customer message | Always approval in MVP |
| Publish | Post social, update website, send campaign | Always approval in MVP |
| Delete | Delete record/file/message | Deny or owner approval only |
| Spend/money | Ads spend, payments, refunds | Out of scope or owner approval only |
| Admin/security | Change permissions, invite users, rotate secrets | Deny for agents in MVP |

### Prompt-injection mitigations

- Separate trusted instructions from untrusted retrieved content.
- Label all external data as untrusted evidence.
- Never allow retrieved content to modify policy, identity, tool permissions, or approval requirements.
- Use narrow tool schemas and server-side validation.
- Use deterministic policy checks outside the model.
- Require approval for sensitive MCP/connectors and external writes.
- Log data shared with third-party tools.
- Maintain allowlists for trusted MCP servers and domains.

### Approval UX requirements

Every approval request must show:

- Who/what requested the action.
- Original user/business instruction.
- Proposed action and exact payload/diff.
- Tool and connected account to be used.
- Data that will be sent externally.
- Risk category and policy reason.
- Evidence/citations used.
- Approve, reject, edit, revise, and comment actions.

## 14. MVP workflow templates

Start with templates that produce visible business value and low legal/compliance risk:

1. Daily inbox triage digest.
2. Meeting prep brief.
3. Post-meeting follow-up draft.
4. Stalled deal nudge draft.
5. Weekly pipeline summary.
6. CRM hygiene suggestions.
7. Invoice payment chaser draft.
8. Receipt collection reminder draft.
9. Weekly client status report draft.
10. Support ticket triage summary.
11. Competitor page watch summary.
12. Weekly social post drafts.

Each template must include:

- Setup dependencies.
- Sample output.
- Trigger options.
- Assigned default agent role.
- Required tool scopes.
- Default approval policy.
- Success metric.

## 15. Metrics

### Activation metrics

- Workspace created.
- First integration connected.
- First AI employee created.
- First workflow simulated.
- First workflow run completed.
- First approval completed.
- Time to first completed work.

### Product quality metrics

- Workflow completion rate.
- Tool-call success rate.
- Approval acceptance rate.
- Human edit rate on drafts.
- Retry/failure rate.
- Prompt-injection/policy tripwire count.
- Cost per completed workflow.
- Time from trigger to delivery.

### Business metrics

- Weekly active workspaces.
- Active AI employees per workspace.
- Scheduled workflows per workspace.
- Runs per workspace per week.
- Gross margin after model/tool costs.
- Expansion: additional agents added.
- Retention by workflow success.

### ROI metrics shown to users

- Estimated hours saved.
- Leads followed up.
- Customer replies drafted.
- Meetings prepared.
- Reports generated.
- Invoices chased.
- Human approvals completed.
- Work completed per dollar of AI spend.

## 16. Pricing hypothesis

Use simple packaging that maps to “AI employees” plus usage.

Suggested beta pricing:

- Starter: 1 AI employee, core integrations, limited runs, approval center.
- Growth: 3-5 AI employees, workflows, schedules, usage dashboard, team roles.
- Pro: more agents, higher limits, custom workflows, vertical packs, priority support.
- Managed implementation add-on: fixed onboarding package for SMBs that need SOP mapping and setup.

Keep usage transparent with credits or metered run costs, but do not make the user think about tokens. Show cost per agent, run, workflow, and workspace.

## 17. Go-to-market wedge

Recommended first wedge: **agency and professional-services operations**.

Why:

- High manual communication load.
- Clear recurring workflows.
- Many businesses use similar tools: Gmail, Calendar, Slack, Drive, HubSpot/Pipedrive, Notion/Docs, QuickBooks/Xero.
- Outputs can start as drafts, reducing risk.
- ROI is easy to show: response time, reports, client follow-up, CRM hygiene, invoices chased.

Initial offer:

> “In one week, we install your first AI ops team: Executive Assistant, Sales Ops Rep, and Finance Admin. They triage your inbox, prep meetings, chase invoices, clean CRM, and draft follow-ups with approvals.”

## 18. Milestones

### Phase 0: Product validation and clickable prototype

- Work Chart prototype.
- Agent hiring wizard prototype.
- Workflow setup prototype.
- Approval request prototype.
- 5 customer interviews with SMB operators.
- Select first vertical pack.

### Phase 1: Core platform foundation

- Workspace, auth, RBAC.
- Agent model and templates.
- Work Chart read-only view.
- Google Workspace and Slack integrations.
- Knowledge base and company profile.
- Run log data model.

### Phase 2: Durable runs and approvals

- Durable workflow engine.
- Manual and scheduled workflow triggers.
- Agent run lifecycle.
- Approval center and resumable state.
- Audit log and usage ledger.
- Simulation mode.

### Phase 3: Private beta

- 10-15 beta workspaces.
- 10 workflow templates.
- HubSpot/Pipedrive and QuickBooks/Xero connection path.
- Weekly ROI summaries.
- Reliability and safety review.

### Phase 4: Paid pilots

- Vertical onboarding package.
- Billing and plan limits.
- Customer success playbooks.
- Admin controls and exportable audit logs.
- Case studies from successful workflows.

## 19. Key risks and mitigations

| Risk | Mitigation |
|---|---|
| Users expect full autonomy and are disappointed | Position as supervised AI employees; start with drafts and approvals. |
| Agents make mistakes in customer-facing actions | Approval-by-default for external sends; show previews and diffs. |
| Browser automation breaks or creates security issues | OAuth/API-first; browser automation out of scope for MVP. |
| Prompt injection via emails/docs/web pages | Untrusted-content labeling, tool-level validation, least privilege, approvals. |
| Integrations are too broad to maintain | Start with 6-8 high-value tools and a generic webhook. |
| LLM costs hurt margins | Track per-run cost, use cheaper models for extraction/classification, cache and batch where safe. |
| Product becomes a generic agent builder | Keep role templates, vertical packs, and Work Chart as primary UX. |
| Copying Cyndra creates IP/design risk | Clone product architecture patterns only; create independent design, copy, and templates. |

## 20. Open questions

1. Which first wedge should be prioritized: agencies, professional services, or local services?
2. Should the first CRM be HubSpot or Pipedrive?
3. Should finance start with QuickBooks or Xero?
4. How opinionated should onboarding be: pure SaaS self-serve vs concierge setup?
5. What is the minimum credible ROI calculation for beta users?
6. Should Work Chart include human employees in v1 or only AI employees plus human approvers?
7. Which approval events should be mobile-first?
8. What data retention and deletion controls are required for the first paid pilots?

## 21. Source notes

Internal repo source:

- `research/cyndra/cyndra-ai-analysis.md`: Cyndra crawl, app structure, workflow patterns, governance notes, monetization signals, MVP recommendations, and cautions.

External source categories used:

- OpenAI Agents SDK docs: app-owned orchestration, tool execution, approvals, state, handoffs, agents-as-tools, guardrails, human review.
- OpenAI MCP/connectors docs: connectors, remote MCP, explicit approvals, data-sharing review, prompt-injection safety.
- Temporal docs: durable workflow execution, event history, replay, activities for external interactions including LLM calls.
- Inngest docs: durable functions, triggers, schedules, workflow steps, retries.
- SaaS-Bench: realistic SaaS professional workflow benchmark and current limitations of computer-use agents.
- AgentDojo and related prompt-injection research: tool-using agent security risk.
- WORKBank / Future of Work with AI Agents: importance of aligning automation with human agency preferences.
- Business press around “work chart” and human/AI task routing: market signal that agent management may move beyond classic org charts.

Paperclip note: I could not verify a public Paperclip source in the repo or web search during this pass. This PRD treats the Paperclip “org chart idea” as founder-provided product inspiration and translates it into the Work Chart concept above.
