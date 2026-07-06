import { eq, isNull, or } from "drizzle-orm";
import { skills } from "@augmentic/db";
import { TOOL_CATALOG } from "@augmentic/shared";
import { requireWorkspace, roleAtLeast } from "@/lib/context";
import { createSkillAction, deleteSkillAction } from "@/lib/actions/skill-actions";
import {
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Textarea,
} from "@/components/ui";

export default async function SkillsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const canManage = roleAtLeast(ctx.role, "admin");
  const rows = await ctx.db
    .select()
    .from(skills)
    .where(or(isNull(skills.workspaceId), eq(skills.workspaceId, ctx.workspace.id)));

  const builtIns = rows.filter((s) => s.workspaceId === null);
  const custom = rows.filter((s) => s.workspaceId !== null);

  return (
    <div>
      <PageHeader
        title="Skills"
        subtitle="Reusable know-how. Apps are permissions; skills are how the work gets done well. Enable them per agent."
      />
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {custom.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Your custom skills
              </h3>
              <div className="space-y-3">
                {custom.map((s) => (
                  <Card key={s.id} className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{s.name}</p>
                      <p className="text-sm text-slate-500">{s.description}</p>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
                          instructions
                        </summary>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">
                          {s.instructions}
                        </p>
                      </details>
                      {(s.allowedTools as string[]).length > 0 && (
                        <p className="mt-1 text-xs text-slate-400">
                          tools: {(s.allowedTools as string[]).join(", ")}
                        </p>
                      )}
                    </div>
                    {canManage && (
                      <form action={deleteSkillAction.bind(null, slug, s.id)}>
                        <Button variant="ghost" type="submit">✕</Button>
                      </form>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Built-in skills
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {builtIns.map((s) => (
                <Card key={s.id}>
                  <p className="font-medium text-slate-900">{s.name}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{s.description}</p>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
                      instructions
                    </summary>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">
                      {s.instructions}
                    </p>
                  </details>
                </Card>
              ))}
            </div>
          </div>
        </div>

        {canManage && (
          <Card className="h-fit">
            <h3 className="mb-3 font-medium text-slate-900">Create a custom skill</h3>
            <form action={createSkillAction.bind(null, slug)} className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input name="name" required placeholder="Proposal writing" />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  name="description"
                  required
                  placeholder="One line on what this skill is for"
                />
              </div>
              <div>
                <Label>Instructions (the know-how)</Label>
                <Textarea
                  name="instructions"
                  rows={6}
                  required
                  placeholder="Exactly how should agents do this work? Structure, rules, what good looks like, what to never do…"
                />
              </div>
              <div>
                <Label>Tools this skill uses (optional)</Label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {TOOL_CATALOG.map((t) => (
                    <label key={t.name} className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" name="allowedTools" value={t.name} />
                      {t.name}
                    </label>
                  ))}
                </div>
              </div>
              <Button type="submit">Create skill</Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
