import { desc, eq } from "drizzle-orm";
import { auditEvents } from "@augmentic/db";
import { getWorkspaceContext, roleAtLeast } from "@/lib/context";

export const dynamic = "force-dynamic";

// Exportable audit (Plan 3.3): full append-only log as CSV or JSON, admin+.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const ctx = await getWorkspaceContext(slug);
  if (!ctx || !roleAtLeast(ctx.role, "admin")) {
    return new Response("forbidden", { status: 403 });
  }
  const format = new URL(req.url).searchParams.get("format") ?? "json";
  const rows = await ctx.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.workspaceId, ctx.workspace.id))
    .orderBy(desc(auditEvents.createdAt));

  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    };
    const header = "created_at,actor_type,actor_label,event_type,entity_type,entity_id,payload";
    const lines = rows.map((r) =>
      [
        r.createdAt.toISOString(),
        r.actorType,
        r.actorLabel,
        r.eventType,
        r.entityType ?? "",
        r.entityId ?? "",
        JSON.stringify(r.payload),
      ]
        .map(esc)
        .join(","),
    );
    return new Response([header, ...lines].join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="augmentic-audit-${slug}-${stamp}.csv"`,
      },
    });
  }
  return new Response(JSON.stringify(rows, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="augmentic-audit-${slug}-${stamp}.json"`,
    },
  });
}
