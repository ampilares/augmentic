import { eq } from "drizzle-orm";
import { brandProfiles } from "@augmentic/db";
import { requireWorkspace } from "@/lib/context";
import { saveBrandProfileAction } from "@/lib/actions/knowledge-actions";
import { Button, Card, Label, PageHeader, Textarea } from "@/components/ui";

const FIELDS: { name: string; label: string; hint: string }[] = [
  { name: "tone", label: "Tone of voice", hint: "How should agents write? e.g. warm, concise, no exclamation marks." },
  { name: "offerings", label: "What you offer", hint: "Services/products agents may reference." },
  { name: "icp", label: "Ideal customers", hint: "Who you serve — helps agents prioritize." },
  { name: "competitors", label: "Competitors", hint: "Names to watch and never disparage." },
  { name: "pricingNotes", label: "Pricing notes", hint: "What agents may (and may not) say about pricing." },
  { name: "escalationRules", label: "Escalation rules", hint: "When should agents stop and hand off to a human?" },
  { name: "forbiddenClaims", label: "Forbidden claims", hint: "Things agents must never state or promise." },
  { name: "facts", label: "Approved facts", hint: "Reusable facts agents can cite confidently." },
];

export default async function BrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const [profile] = await ctx.db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.workspaceId, ctx.workspace.id));

  const defaults = (profile ?? {}) as Record<string, string>;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Company & brand profile"
        subtitle="Injected into every agent prompt — tone, boundaries, and approved facts."
      />
      <Card>
        <form action={saveBrandProfileAction.bind(null, slug)} className="space-y-4">
          {FIELDS.map((f) => (
            <div key={f.name}>
              <Label>{f.label}</Label>
              <p className="mb-1 text-xs text-slate-400">{f.hint}</p>
              <Textarea name={f.name} rows={2} defaultValue={defaults[f.name] ?? ""} />
            </div>
          ))}
          <Button type="submit">Save profile</Button>
        </form>
      </Card>
    </div>
  );
}
