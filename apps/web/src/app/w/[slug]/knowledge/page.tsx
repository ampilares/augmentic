import { desc, eq } from "drizzle-orm";
import { knowledgeItems } from "@augmentic/db";
import { requireWorkspace } from "@/lib/context";
import { addKnowledgeAction, deleteKnowledgeAction } from "@/lib/actions/knowledge-actions";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";

export default async function KnowledgePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const items = await ctx.db
    .select()
    .from(knowledgeItems)
    .where(eq(knowledgeItems.workspaceId, ctx.workspace.id))
    .orderBy(desc(knowledgeItems.createdAt));

  return (
    <div>
      <PageHeader
        title="Knowledge"
        subtitle="SOPs, docs, links, and facts your AI employees can search during runs — with citations in outputs."
      />
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-3">
          {items.length === 0 ? (
            <EmptyState
              title="No knowledge yet"
              hint="Paste an SOP or company doc — agents cite what they use."
            />
          ) : (
            items.map((k) => (
              <Card key={k.id} className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{k.title}</p>
                  <p className="text-xs text-slate-400">
                    {k.sourceType}
                    {k.url ? ` · ${k.url}` : ""} · {new Date(k.createdAt).toLocaleDateString()}
                  </p>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">
                    {k.content}
                  </p>
                </div>
                <form action={deleteKnowledgeAction.bind(null, slug, k.id)}>
                  <Button variant="ghost" type="submit">✕</Button>
                </form>
              </Card>
            ))
          )}
        </div>
        <Card className="h-fit">
          <h3 className="mb-3 font-medium text-slate-900">Add knowledge</h3>
          <form action={addKnowledgeAction.bind(null, slug)} className="space-y-3">
            <div>
              <Label>Type</Label>
              <Select name="sourceType" defaultValue="text">
                <option value="text">Text / SOP</option>
                <option value="link">Link</option>
                <option value="upload">Document (paste content)</option>
              </Select>
            </div>
            <div>
              <Label>Title</Label>
              <Input name="title" required placeholder="Invoice follow-up SOP" />
            </div>
            <div>
              <Label>URL (for links)</Label>
              <Input name="url" type="url" placeholder="https://…" />
            </div>
            <div>
              <Label>Content</Label>
              <Textarea
                name="content"
                rows={6}
                required
                placeholder="Paste the SOP, doc text, or notes…"
              />
            </div>
            <Button type="submit">Add</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
