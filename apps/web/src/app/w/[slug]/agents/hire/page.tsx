import Link from "next/link";
import { eq, isNull } from "drizzle-orm";
import { agentTemplates, integrationConnections } from "@augmentic/db";
import { requireWorkspace } from "@/lib/context";
import { hireAgentAction } from "@/lib/actions/agent-actions";
import {
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";

// Journey B: choose role → review the job package → name it → hire.
export default async function HirePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ template?: string }>;
}) {
  const { slug } = await params;
  const { template: templateSlug } = await searchParams;
  const ctx = await requireWorkspace(slug, "operator");

  const templates = await ctx.db
    .select()
    .from(agentTemplates)
    .where(isNull(agentTemplates.workspaceId));

  const connections = await ctx.db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.workspaceId, ctx.workspace.id));
  const connectedProviders = new Set(connections.map((c) => c.provider));

  const selected = templates.find((t) => t.slug === templateSlug) ?? null;

  if (!selected && templateSlug !== "custom") {
    // Step 1: choose a role.
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Hire an AI employee"
          subtitle="Start from a role your team keeps doing manually, or describe a custom job."
        />
        <div className="grid grid-cols-2 gap-4">
          {templates.map((t) => (
            <Link key={t.id} href={`/w/${slug}/agents/hire?template=${t.slug}`}>
              <Card className="h-full transition-colors hover:border-brand-500">
                <p className="font-medium text-slate-900">{t.roleTitle}</p>
                <p className="mt-1 text-sm text-slate-500">{t.shortPitch}</p>
                <p className="mt-3 text-xs text-slate-400">
                  needs: {(t.appDependencies as string[]).join(", ") || "no apps"}
                </p>
              </Card>
            </Link>
          ))}
          <Link href={`/w/${slug}/agents/hire?template=custom`}>
            <Card className="flex h-full flex-col justify-center border-dashed text-center transition-colors hover:border-brand-500">
              <p className="font-medium text-slate-900">Custom role</p>
              <p className="mt-1 text-sm text-slate-500">
                Describe the job in plain English.
              </p>
            </Card>
          </Link>
        </div>
      </div>
    );
  }

  // Step 2: review the package and hire.
  const deps = (selected?.appDependencies ?? []) as string[];
  const setupQuestions = (selected?.setupQuestions ?? []) as string[];
  const approvalDefaults = (selected?.approvalPolicyDefaults ?? {}) as Record<string, string>;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={selected ? `Hire: ${selected.roleTitle}` : "Hire: Custom role"}
        subtitle={selected?.shortPitch ?? "Describe the job in plain English."}
      />
      <form action={hireAgentAction.bind(null, slug)} className="space-y-6">
        <input type="hidden" name="templateId" value={selected?.id ?? ""} />

        {selected && (
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">The job package</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium uppercase text-slate-400">Recommended apps</p>
                <div className="mt-1 flex gap-2">
                  {deps.map((d) => (
                    <span
                      key={d}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        connectedProviders.has(d)
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {d} {connectedProviders.has(d) ? "· connected" : "· connect later"}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-slate-400">Safety defaults</p>
                <ul className="mt-1 space-y-0.5 text-slate-600">
                  <li>Drafts and recommendations by default; sensitive actions ask first.</li>
                  {Object.entries(approvalDefaults).map(([tool, setting]) => (
                    <li key={tool}>
                      <code className="text-xs">{tool}</code> → {setting.replaceAll("_", " ")}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-slate-400">
                  Setup interview (asked after hiring)
                </p>
                <ul className="mt-1 list-inside list-disc text-slate-600">
                  {setupQuestions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        )}

        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Agent name</Label>
              <Input
                name="name"
                required
                placeholder={selected ? `e.g. ${suggestName(selected.roleTitle)}` : "e.g. Piper"}
              />
            </div>
            <div>
              <Label>Role title</Label>
              <Input name="roleTitle" required defaultValue={selected?.roleTitle ?? ""} />
            </div>
          </div>
          <div>
            <Label>Job description (plain English — edit freely)</Label>
            <Textarea
              name="jobDescription"
              required
              rows={8}
              defaultValue={selected?.jobDescription ?? ""}
              placeholder="Describe what this AI employee should do, how it should behave, and what it must never do."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Autonomy</Label>
              <Select name="autonomyMode" defaultValue="draft_only">
                <option value="draft_only">Draft only (recommended)</option>
                <option value="ask_before_acting">Ask before acting</option>
                <option value="ask_when_unsure">Ask when unsure</option>
                <option value="autonomous_low_risk">Autonomous for low-risk tools</option>
              </Select>
            </div>
            <div>
              <Label>Monthly spend cap (USD, optional)</Label>
              <Input name="spendCapMonthlyCents" type="number" min="0" step="1" placeholder="50" />
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Link
            href={`/w/${slug}/agents/hire`}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back
          </Link>
          <Button type="submit">Hire</Button>
        </div>
      </form>
    </div>
  );
}

function suggestName(roleTitle: string): string {
  const names: Record<string, string> = {
    "Executive Assistant": "Emmy",
    "Sales Ops Rep": "Sawyer",
    "Client Success Rep": "Cleo",
    "Finance Admin": "Frankie",
    "Marketing Ops Assistant": "Marlo",
  };
  return names[roleTitle] ?? "Alex";
}
