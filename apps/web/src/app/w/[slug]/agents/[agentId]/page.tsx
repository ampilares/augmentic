import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import {
  agents,
  agentSkills,
  agentTemplates,
  auditEvents,
  skills,
  chatMessages,
  chatThreads,
  integrationConnections,
  knowledgeItems,
  memoryItems,
  memberships,
  toolDefinitions,
  toolPermissionPolicies,
  users,
  workflowRuns,
  workflows,
} from "@augmentic/db";
import { TIER_DEFAULT_POLICY, type RiskTier } from "@augmentic/shared";
import { requireWorkspace, roleAtLeast } from "@/lib/context";
import {
  addMemoryAction,
  completeAgentSetupAction,
  deleteMemoryAction,
  setToolPermissionAction,
  updateAgentAction,
} from "@/lib/actions/agent-actions";
import { sendChatMessageAction } from "@/lib/actions/chat-actions";
import { toggleAgentSkillAction } from "@/lib/actions/skill-actions";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  RiskBadge,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";

const TABS = [
  "overview",
  "chat",
  "workflows",
  "tools",
  "skills",
  "knowledge",
  "memory",
  "settings",
  "activity",
] as const;

export default async function AgentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; agentId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug, agentId } = await params;
  const { tab: rawTab } = await searchParams;
  const tab = (TABS as readonly string[]).includes(rawTab ?? "") ? rawTab! : "overview";
  const ctx = await requireWorkspace(slug);

  const [agent] = await ctx.db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.workspaceId, ctx.workspace.id)));
  if (!agent) notFound();

  const template = agent.templateId
    ? ((
        await ctx.db
          .select()
          .from(agentTemplates)
          .where(eq(agentTemplates.id, agent.templateId))
      )[0] ?? null)
    : null;

  return (
    <div>
      <PageHeader
        title={agent.name}
        subtitle={agent.roleTitle}
        action={<StatusBadge status={agent.status} />}
      />
      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/w/${slug}/agents/${agentId}?tab=${t}`}
            className={`border-b-2 px-3 py-2 text-sm font-medium capitalize ${
              tab === t
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t}
          </Link>
        ))}
      </div>

      {tab === "overview" && <OverviewTab ctx={ctx} agent={agent} template={template} slug={slug} />}
      {tab === "chat" && <ChatTab ctx={ctx} agent={agent} slug={slug} />}
      {tab === "workflows" && <WorkflowsTab ctx={ctx} agent={agent} slug={slug} />}
      {tab === "tools" && <ToolsTab ctx={ctx} agent={agent} slug={slug} />}
      {tab === "skills" && <SkillsTab ctx={ctx} agent={agent} slug={slug} />}
      {tab === "knowledge" && <KnowledgeTab ctx={ctx} agent={agent} slug={slug} />}
      {tab === "memory" && <MemoryTab ctx={ctx} agent={agent} slug={slug} />}
      {tab === "settings" && <SettingsTab ctx={ctx} agent={agent} slug={slug} />}
      {tab === "activity" && <ActivityTab ctx={ctx} agent={agent} slug={slug} />}
    </div>
  );
}

type Ctx = Awaited<ReturnType<typeof requireWorkspace>>;
type Agent = typeof agents.$inferSelect;

async function OverviewTab({
  ctx,
  agent,
  template,
  slug,
}: {
  ctx: Ctx;
  agent: Agent;
  template: typeof agentTemplates.$inferSelect | null;
  slug: string;
}) {
  const setupQuestions = ((template?.setupQuestions ?? []) as string[]).slice(0, 6);
  const runs = await ctx.db
    .select()
    .from(workflowRuns)
    .where(
      and(eq(workflowRuns.workspaceId, ctx.workspace.id), eq(workflowRuns.agentId, agent.id)),
    )
    .orderBy(desc(workflowRuns.createdAt))
    .limit(5);

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-6">
        {agent.status === "needs_setup" && (
          <Card className="border-amber-300 bg-amber-50">
            <h3 className="font-medium text-slate-900">Setup interview</h3>
            <p className="mb-4 mt-1 text-sm text-slate-600">
              Answer a few questions so {agent.name} learns your SOPs, tone, and boundaries.
              Answers are saved to editable memory.
            </p>
            <form
              action={completeAgentSetupAction.bind(null, slug, agent.id)}
              className="space-y-3"
            >
              {(setupQuestions.length > 0
                ? setupQuestions
                : [
                    "What should this agent focus on first?",
                    "What tone should it use?",
                    "Anything it must never do?",
                  ]
              ).map((q) => (
                <div key={q}>
                  <input type="hidden" name="question" value={q} />
                  <Label>{q}</Label>
                  <Input name="answer" placeholder="Optional — skip any question" />
                </div>
              ))}
              <Button type="submit">Finish setup & activate</Button>
            </form>
          </Card>
        )}
        <Card>
          <h3 className="mb-2 font-medium text-slate-900">Job description</h3>
          <p className="whitespace-pre-wrap text-sm text-slate-600">{agent.jobDescription}</p>
        </Card>
        <Card>
          <h3 className="mb-3 font-medium text-slate-900">Recent runs</h3>
          {runs.length === 0 ? (
            <p className="text-sm text-slate-500">No runs yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {runs.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <Link
                    href={`/w/${slug}/runs/${r.id}`}
                    className="text-sm text-brand-600 hover:underline"
                  >
                    {r.mode} run · {new Date(r.createdAt).toLocaleString()}
                  </Link>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="space-y-6">
        <Card>
          <h3 className="mb-3 font-medium text-slate-900">At a glance</h3>
          <dl className="space-y-2 text-sm">
            <Row k="Autonomy" v={agent.autonomyMode.replaceAll("_", " ")} />
            <Row
              k="Spend cap"
              v={
                agent.spendCapMonthlyCents !== null
                  ? `$${(agent.spendCapMonthlyCents / 100).toFixed(0)}/mo`
                  : "none"
              }
            />
            <Row k="Hired" v={new Date(agent.createdAt).toLocaleDateString()} />
          </dl>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{k}</dt>
      <dd className="font-medium text-slate-800">{v}</dd>
    </div>
  );
}

async function ChatTab({ ctx, agent, slug }: { ctx: Ctx; agent: Agent; slug: string }) {
  const [thread] = await ctx.db
    .select()
    .from(chatThreads)
    .where(
      and(
        eq(chatThreads.workspaceId, ctx.workspace.id),
        eq(chatThreads.agentId, agent.id),
        eq(chatThreads.userId, ctx.user.id),
      ),
    );
  const messages = thread
    ? await ctx.db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.threadId, thread.id))
        .orderBy(chatMessages.createdAt)
    : [];

  const pendingReply =
    messages.length > 0 && messages[messages.length - 1]!.role === "user";

  return (
    <div className="mx-auto max-w-3xl">
      <Card>
        <div className="mb-4 max-h-[26rem] space-y-3 overflow-y-auto">
          {messages.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">
              Ask {agent.name} for a one-off task. Chat runs through the same policy and
              approval pipeline as workflows.
            </p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.role === "agent" && m.workflowRunId && (
                <Link
                  href={`/w/${slug}/runs/${m.workflowRunId}`}
                  className="mt-1 block text-xs text-slate-500 hover:underline"
                >
                  view step log →
                </Link>
              )}
            </div>
          ))}
          {pendingReply && (
            <p className="text-sm text-slate-400">
              {agent.name} is working…{" "}
              <Link href={`/w/${slug}/agents/${agent.id}?tab=chat`} className="text-brand-600 hover:underline">
                refresh
              </Link>
            </p>
          )}
        </div>
        <form
          action={sendChatMessageAction.bind(null, slug, agent.id)}
          className="flex gap-2"
        >
          <Input name="message" required placeholder={`Ask ${agent.name} to do something…`} />
          <Button type="submit">Send</Button>
        </form>
      </Card>
    </div>
  );
}

async function WorkflowsTab({ ctx, agent, slug }: { ctx: Ctx; agent: Agent; slug: string }) {
  const rows = await ctx.db
    .select()
    .from(workflows)
    .where(and(eq(workflows.workspaceId, ctx.workspace.id), eq(workflows.agentId, agent.id)));
  if (rows.length === 0) {
    return (
      <EmptyState
        title={`${agent.name} owns no workflows yet`}
        hint="Assign recurring work with a workflow."
        action={
          <Link href={`/w/${slug}/workflows/new`} className="text-sm font-medium text-brand-600 hover:underline">
            Create workflow →
          </Link>
        }
      />
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((w) => (
        <Link key={w.id} href={`/w/${slug}/workflows/${w.id}`} className="block">
          <Card className="flex items-center justify-between transition-colors hover:border-brand-500">
            <div>
              <p className="font-medium text-slate-900">{w.name}</p>
              <p className="line-clamp-1 text-sm text-slate-500">{w.instructions}</p>
            </div>
            <StatusBadge status={w.status} />
          </Card>
        </Link>
      ))}
    </div>
  );
}

async function ToolsTab({ ctx, agent, slug }: { ctx: Ctx; agent: Agent; slug: string }) {
  const [defs, perms, conns] = await Promise.all([
    ctx.db.select().from(toolDefinitions),
    ctx.db
      .select()
      .from(toolPermissionPolicies)
      .where(
        and(
          eq(toolPermissionPolicies.workspaceId, ctx.workspace.id),
          eq(toolPermissionPolicies.agentId, agent.id),
        ),
      ),
    ctx.db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.workspaceId, ctx.workspace.id)),
  ]);
  const permByDef = new Map(perms.map((p) => [p.toolDefinitionId, p.setting]));
  const connected = new Set(conns.map((c) => c.provider));
  const canEdit = roleAtLeast(ctx.role, "admin");
  const providerConnected = (p: string) =>
    p === "internal" || (["gmail", "gcal", "gdrive"].includes(p) ? connected.has("google") : connected.has(p));

  return (
    <Card>
      <p className="mb-4 text-sm text-slate-500">
        Per-tool permission for {agent.name}. Denied tools are rejected server-side no matter
        what the model proposes. External sends and publishing always require approval in MVP.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="pb-2">Tool</th>
            <th className="pb-2">Risk</th>
            <th className="pb-2">Connection</th>
            <th className="pb-2">Permission</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {defs.map((d) => {
            const effective = permByDef.get(d.id) ?? TIER_DEFAULT_POLICY[d.riskTier as RiskTier];
            return (
              <tr key={d.id}>
                <td className="py-2.5">
                  <p className="font-medium text-slate-800">{d.name}</p>
                  <p className="text-xs text-slate-500">{d.description}</p>
                </td>
                <td className="py-2.5">
                  <RiskBadge tier={d.riskTier} />
                </td>
                <td className="py-2.5 text-xs text-slate-500">
                  {providerConnected(d.provider) ? "connected" : "not connected"}
                </td>
                <td className="py-2.5">
                  {canEdit ? (
                    <form action={setToolPermissionAction.bind(null, slug)} className="flex gap-2">
                      <input type="hidden" name="agentId" value={agent.id} />
                      <input type="hidden" name="toolDefinitionId" value={d.id} />
                      <Select name="setting" defaultValue={effective} className="!w-40">
                        <option value="allow">allow</option>
                        <option value="require_approval">require approval</option>
                        <option value="deny">deny</option>
                      </Select>
                      <Button type="submit" variant="secondary">Save</Button>
                    </form>
                  ) : (
                    <span className="text-slate-600">{effective.replaceAll("_", " ")}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

async function SkillsTab({ ctx, agent, slug }: { ctx: Ctx; agent: Agent; slug: string }) {
  const [allSkills, enabledRows] = await Promise.all([
    ctx.db
      .select()
      .from(skills)
      .where(or(isNull(skills.workspaceId), eq(skills.workspaceId, ctx.workspace.id))),
    ctx.db
      .select()
      .from(agentSkills)
      .where(
        and(
          eq(agentSkills.workspaceId, ctx.workspace.id),
          eq(agentSkills.agentId, agent.id),
        ),
      ),
  ]);
  const enabledBySkill = new Map(enabledRows.map((r) => [r.skillId, r.enabled]));
  const canEdit = roleAtLeast(ctx.role, "operator");

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Enabled skills are injected into {agent.name}'s prompt as know-how on every run.{" "}
        <Link href={`/w/${slug}/skills`} className="text-brand-600 hover:underline">
          Manage the skill library →
        </Link>
      </p>
      <div className="grid grid-cols-2 gap-3">
        {allSkills.map((s) => {
          const enabled = enabledBySkill.get(s.id) ?? false;
          return (
            <Card key={s.id} className={enabled ? "border-brand-300" : ""}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {s.name}
                    {s.workspaceId !== null && (
                      <span className="ml-2 rounded bg-purple-50 px-1.5 py-0.5 text-[11px] text-purple-700">
                        custom
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">{s.description}</p>
                </div>
                {canEdit && (
                  <form action={toggleAgentSkillAction.bind(null, slug, agent.id, s.id)}>
                    <Button variant={enabled ? "primary" : "secondary"} type="submit">
                      {enabled ? "Enabled" : "Enable"}
                    </Button>
                  </form>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

async function KnowledgeTab({ ctx, agent, slug }: { ctx: Ctx; agent: Agent; slug: string }) {
  const items = await ctx.db
    .select()
    .from(knowledgeItems)
    .where(eq(knowledgeItems.workspaceId, ctx.workspace.id))
    .orderBy(desc(knowledgeItems.createdAt))
    .limit(20);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Workspace knowledge available to {agent.name} during runs.{" "}
        <Link href={`/w/${slug}/knowledge`} className="text-brand-600 hover:underline">
          Manage knowledge →
        </Link>
      </p>
      {items.length === 0 ? (
        <EmptyState title="No knowledge yet" hint="Add SOPs, docs, or facts on the Knowledge page." />
      ) : (
        items.map((k) => (
          <Card key={k.id}>
            <p className="font-medium text-slate-900">{k.title}</p>
            <p className="mt-1 line-clamp-2 text-sm text-slate-500">{k.content}</p>
          </Card>
        ))
      )}
    </div>
  );
}

async function MemoryTab({ ctx, agent, slug }: { ctx: Ctx; agent: Agent; slug: string }) {
  const items = await ctx.db
    .select()
    .from(memoryItems)
    .where(
      and(eq(memoryItems.workspaceId, ctx.workspace.id), eq(memoryItems.agentId, agent.id)),
    )
    .orderBy(desc(memoryItems.createdAt));
  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-3">
        {items.length === 0 ? (
          <EmptyState
            title="No memories yet"
            hint="Setup interview answers and learned facts appear here. You can edit or delete anything."
          />
        ) : (
          items.map((m) => (
            <Card key={m.id} className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase text-slate-400">{m.kind}</p>
                <p className="mt-1 text-sm text-slate-700">{m.content}</p>
              </div>
              <form action={deleteMemoryAction.bind(null, slug, agent.id, m.id)}>
                <Button variant="ghost" type="submit">✕</Button>
              </form>
            </Card>
          ))
        )}
      </div>
      <Card className="h-fit">
        <h3 className="mb-3 font-medium text-slate-900">Teach {agent.name} something</h3>
        <form action={addMemoryAction.bind(null, slug, agent.id)} className="space-y-3">
          <div>
            <Label>Kind</Label>
            <Select name="kind" defaultValue="fact">
              <option value="fact">Fact</option>
              <option value="preference">Preference</option>
              <option value="sop">SOP</option>
              <option value="escalation_rule">Escalation rule</option>
              <option value="forbidden_action">Forbidden action</option>
            </Select>
          </div>
          <div>
            <Label>Content</Label>
            <Textarea name="content" rows={3} required />
          </div>
          <Button type="submit">Add memory</Button>
        </form>
      </Card>
    </div>
  );
}

async function SettingsTab({ ctx, agent, slug }: { ctx: Ctx; agent: Agent; slug: string }) {
  const members = await ctx.db
    .select({ id: users.id, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.workspaceId, ctx.workspace.id));
  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <form action={updateAgentAction.bind(null, slug, agent.id)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Name</Label>
              <Input name="name" defaultValue={agent.name} />
            </div>
            <div>
              <Label>Role title</Label>
              <Input name="roleTitle" defaultValue={agent.roleTitle} />
            </div>
          </div>
          <div>
            <Label>Job description</Label>
            <Textarea name="jobDescription" rows={8} defaultValue={agent.jobDescription} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Autonomy</Label>
              <Select name="autonomyMode" defaultValue={agent.autonomyMode}>
                <option value="draft_only">Draft only</option>
                <option value="ask_before_acting">Ask before acting</option>
                <option value="ask_when_unsure">Ask when unsure</option>
                <option value="autonomous_low_risk">Autonomous (low-risk)</option>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select name="status" defaultValue={agent.status === "paused" ? "paused" : "active"}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </Select>
            </div>
            <div>
              <Label>Spend cap (USD/mo)</Label>
              <Input
                name="spendCapMonthly"
                type="number"
                min="0"
                defaultValue={
                  agent.spendCapMonthlyCents !== null
                    ? String(agent.spendCapMonthlyCents / 100)
                    : ""
                }
              />
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Supervisors in this workspace: {members.map((m) => m.name).join(", ")}
          </p>
          <Button type="submit">Save settings</Button>
        </form>
      </Card>
    </div>
  );
}

async function ActivityTab({ ctx, agent, slug }: { ctx: Ctx; agent: Agent; slug: string }) {
  const events = await ctx.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.workspaceId, ctx.workspace.id))
    .orderBy(desc(auditEvents.createdAt))
    .limit(100);
  const related = events.filter(
    (e) =>
      e.entityId === agent.id ||
      e.actorId === agent.id ||
      JSON.stringify(e.payload).includes(agent.id),
  );
  return (
    <Card>
      {related.length === 0 ? (
        <p className="text-sm text-slate-500">No activity recorded yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {related.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2">
              <span className="text-slate-700">
                <span className="font-medium">{e.eventType}</span>
                <span className="ml-2 text-slate-400">by {e.actorLabel}</span>
              </span>
              <span className="text-xs text-slate-400">
                {new Date(e.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-400">
        Full workspace audit log:{" "}
        <Link href={`/w/${slug}/audit`} className="text-brand-600 hover:underline">
          Audit →
        </Link>
      </p>
    </Card>
  );
}
