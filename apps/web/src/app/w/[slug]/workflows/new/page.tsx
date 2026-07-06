import Link from "next/link";
import { eq } from "drizzle-orm";
import {
  agents,
  integrationConnections,
  workflowTemplates,
} from "@augmentic/db";
import { requireWorkspace } from "@/lib/context";
import { createWorkflowAction } from "@/lib/actions/workflow-actions";
import {
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";

// Two-step creation (Cyndra pattern, Spec §10): Choose → Set up with a
// dependency-readiness gate.
export default async function NewWorkflowPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ template?: string }>;
}) {
  const { slug } = await params;
  const { template: templateSlug } = await searchParams;
  const ctx = await requireWorkspace(slug, "operator");

  const templates = await ctx.db.select().from(workflowTemplates);
  const selected = templates.find((t) => t.slug === templateSlug) ?? null;

  if (!selected && templateSlug !== "blank") {
    const categories = [...new Set(templates.map((t) => t.category))];
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="New workflow — choose"
          subtitle="Start from a template or from scratch."
          action={
            <Link
              href={`/w/${slug}/workflows/new?template=blank`}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Start blank
            </Link>
          }
        />
        {categories.map((cat) => (
          <div key={cat} className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {cat}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {templates
                .filter((t) => t.category === cat)
                .map((t) => (
                  <Link key={t.id} href={`/w/${slug}/workflows/new?template=${t.slug}`}>
                    <Card className="h-full transition-colors hover:border-brand-500">
                      <p className="font-medium text-slate-900">{t.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{t.description}</p>
                      <p className="mt-2 text-xs text-slate-400">
                        needs: {(t.dependencies as string[]).join(", ") || "nothing"} · success:{" "}
                        {t.successMetric}
                      </p>
                    </Card>
                  </Link>
                ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Step 2: set up.
  const [agentRows, connections] = await Promise.all([
    ctx.db.select().from(agents).where(eq(agents.workspaceId, ctx.workspace.id)),
    ctx.db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.workspaceId, ctx.workspace.id)),
  ]);
  const connectedProviders = new Set(connections.map((c) => c.provider));
  const deps = ((selected?.dependencies ?? []) as string[]);
  const missingDeps = deps.filter((d) => !connectedProviders.has(d));
  const ready = missingDeps.length === 0 && agentRows.length > 0;
  const defaultAgent =
    agentRows.find((a) => {
      // Prefer the agent hired from the template's default role.
      return selected?.defaultRoleSlug && a.roleTitle
        .toLowerCase()
        .includes(selected.defaultRoleSlug.replaceAll("-", " ").split(" ")[0] ?? "");
    }) ?? agentRows[0];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={selected ? `Set up: ${selected.name}` : "Set up: blank workflow"}
        subtitle={selected?.description ?? "Describe the recurring work in plain language."}
      />

      <Card className="mb-6">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Dependency check</h3>
        <ul className="space-y-1 text-sm">
          <li className={agentRows.length > 0 ? "text-emerald-700" : "text-red-600"}>
            {agentRows.length > 0 ? "✓" : "✕"} At least one AI employee hired
            {agentRows.length === 0 && (
              <Link href={`/w/${slug}/agents/hire`} className="ml-2 text-brand-600 hover:underline">
                hire one →
              </Link>
            )}
          </li>
          {deps.map((d) => (
            <li key={d} className={connectedProviders.has(d) ? "text-emerald-700" : "text-red-600"}>
              {connectedProviders.has(d) ? "✓" : "✕"} {d} connected
              {!connectedProviders.has(d) && (
                <Link href={`/w/${slug}/integrations`} className="ml-2 text-brand-600 hover:underline">
                  connect →
                </Link>
              )}
            </li>
          ))}
        </ul>
        {!ready && (
          <p className="mt-2 text-xs text-slate-500">
            {deps.length - missingDeps.length} of {deps.length} app dependencies ready — Create is
            disabled until everything above is green.
          </p>
        )}
      </Card>

      {selected && (
        <Card className="mb-6 bg-slate-50">
          <h3 className="mb-1 text-sm font-semibold text-slate-900">Sample output</h3>
          <pre className="whitespace-pre-wrap text-xs text-slate-600">{selected.sampleOutput}</pre>
        </Card>
      )}

      <form action={createWorkflowAction.bind(null, slug)} className="space-y-6">
        <input type="hidden" name="templateId" value={selected?.id ?? ""} />
        <Card className="space-y-4">
          <div>
            <Label>Workflow name</Label>
            <Input name="name" required defaultValue={selected?.name ?? ""} />
          </div>
          <div>
            <Label>Instructions (plain English)</Label>
            <Textarea
              name="instructions"
              rows={7}
              required
              defaultValue={selected?.instructions ?? ""}
              placeholder="Every Monday, review last week's client email and draft a status update per client…"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Assigned AI employee</Label>
              <Select name="agentId" required defaultValue={defaultAgent?.id}>
                {agentRows.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {a.roleTitle}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Trigger</Label>
              <Select name="triggerType" defaultValue={(selected?.triggerOptions as string[] | undefined)?.[0] ?? "manual"}>
                <option value="manual">Manual (Run button)</option>
                <option value="schedule">Schedule (cron)</option>
                <option value="webhook">Webhook (signed URL)</option>
                <option value="app_event">App event (Gmail new message)</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Cron (if scheduled)</Label>
              <Input name="cron" defaultValue="0 8 * * 1-5" placeholder="0 8 * * 1-5" />
            </div>
            <div>
              <Label>Timezone</Label>
              <Input name="timezone" defaultValue="Australia/Sydney" />
            </div>
            <div>
              <Label>Event filter (if app event)</Label>
              <Input name="eventFilter" placeholder="from:client.com" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Delivery</Label>
              <Select name="deliveryTarget" defaultValue="run_log">
                <option value="run_log">Run log</option>
                <option value="slack_channel">Slack channel</option>
                <option value="email_draft">Email draft</option>
              </Select>
            </div>
            <div>
              <Label>Slack channel (if Slack)</Label>
              <Input name="slackChannel" placeholder="#reports" />
            </div>
            <div>
              <Label>Email to (if email draft)</Label>
              <Input name="emailTo" placeholder="you@company.com" />
            </div>
          </div>
        </Card>
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            New workflows start as <strong>ready</strong> — simulate before activating. External
            sends always require approval.
          </p>
          <Button type="submit" disabled={!ready}>
            Create workflow
          </Button>
        </div>
      </form>
    </div>
  );
}
