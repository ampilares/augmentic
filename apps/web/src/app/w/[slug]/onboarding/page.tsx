import { AGENCY_PACK } from "@augmentic/db/seed";
import { requireWorkspace } from "@/lib/context";
import { applyOnboardingAction } from "@/lib/actions/onboarding-actions";
import { installPackAction } from "@/lib/actions/pack-actions";
import { Button, Card, Input, Label, PageHeader, Select } from "@/components/ui";

const TASK_OPTIONS = [
  { value: "inbox", label: "Inbox triage & follow-ups" },
  { value: "scheduling", label: "Scheduling & meeting prep" },
  { value: "leads", label: "Lead follow-up" },
  { value: "crm", label: "CRM updates & pipeline reports" },
  { value: "client_updates", label: "Client status updates" },
  { value: "support", label: "Support request triage" },
  { value: "invoices", label: "Invoice chasing" },
  { value: "bookkeeping", label: "Receipts & bookkeeping prep" },
  { value: "social", label: "Social media drafts" },
  { value: "content", label: "Content repurposing & reports" },
];

const TOOL_OPTIONS = ["google", "slack", "monday", "xero"];

// Journey A: short interview → Augmentic proposes an initial Work Chart with
// 2-3 AI employees and recommended workflows.
export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireWorkspace(slug, "admin");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Set up your AI workforce"
        subtitle="Five quick questions — we'll propose your first AI employees and their workflows. Nothing runs without your say-so."
      />
      <Card className="mb-6 border-brand-300 bg-brand-50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold text-slate-900">
              ⚡ {AGENCY_PACK.name} — one-click install
            </p>
            <p className="mt-1 text-sm text-slate-600">{AGENCY_PACK.pitch}</p>
            <p className="mt-2 text-xs text-slate-500">
              Includes {AGENCY_PACK.agentTemplateSlugs.length} AI employees,{" "}
              {AGENCY_PACK.workflows.length} scheduled workflows, {AGENCY_PACK.sops.length}{" "}
              agency SOPs, and safety defaults. Everything starts draft-first — nothing runs
              until you activate it.
            </p>
          </div>
          <form action={installPackAction.bind(null, slug, AGENCY_PACK.slug)}>
            <Button type="submit">Install pack</Button>
          </form>
        </div>
      </Card>

      <p className="mb-4 text-center text-xs uppercase tracking-wider text-slate-400">
        or answer a few questions for a tailored proposal
      </p>

      <form action={applyOnboardingAction.bind(null, slug)} className="space-y-6">
        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Industry</Label>
              <Input name="industry" placeholder="e.g. design agency, consulting" />
            </div>
            <div>
              <Label>Team size</Label>
              <Select name="teamSize" defaultValue="2-10">
                <option value="1">Just me</option>
                <option value="2-10">2–10</option>
                <option value="11-50">11–50</option>
                <option value="51-100">51–100</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Which tools does your team live in?</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {TOOL_OPTIONS.map((t) => (
                <label key={t} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <input type="checkbox" name="tools" value={t} defaultChecked={t === "google"} />
                  {t === "google" ? "Google Workspace" : t === "monday" ? "monday.com" : t[0]!.toUpperCase() + t.slice(1)}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label>What eats the most manual time? (pick up to 3)</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {TASK_OPTIONS.map((t) => (
                <label key={t.value} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <input type="checkbox" name="topTasks" value={t.value} />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label>How hands-on do you want to be?</Label>
            <Select name="riskTolerance" defaultValue="conservative">
              <option value="conservative">
                Review everything — agents draft, I approve (recommended)
              </option>
              <option value="hands_off">
                Let agents handle low-risk work; ask me when unsure
              </option>
            </Select>
          </div>
        </Card>
        <div className="flex justify-end">
          <Button type="submit">Propose my AI team →</Button>
        </div>
      </form>
    </div>
  );
}
