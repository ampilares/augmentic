import { desc, eq } from "drizzle-orm";
import { auditEvents } from "@augmentic/db";
import { recordAudit } from "@augmentic/engine";
import { getWorkspaceContext, roleAtLeast } from "@/lib/context";

export const dynamic = "force-dynamic";

const EXPORT_LIMIT = 50_000;

// Exportable audit (plan 3.3): admins download the full audit trail as CSV
// or JSON. The export itself is an audited action.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const ctx = await getWorkspaceContext(slug);
  if (!ctx || !roleAtLeast(ctx.role, "admin")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "json";

  const rows = await ctx.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.workspaceId, ctx.workspace.id))
    .orderBy(desc(auditEvents.createdAt))
    .limit(EXPORT_LIMIT);

  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "audit.exported",
    payload: { format, rows: rows.length },
  });

  const filename = `audit-${slug}-${new Date().toISOString().slice(0, 10)}.${format}`;
  if (format === "json") {
    return new Response(JSON.stringify(rows, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const header = [
    "created_at",
    "actor_type",
    "actor_label",
    "event_type",
    "entity_type",
    "entity_id",
    "payload",
  ];
  const csvEscape = (value: unknown): string => {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.createdAt.toISOString(),
        r.actorType,
        r.actorLabel,
        r.eventType,
        r.entityType ?? "",
        r.entityId ?? "",
        JSON.stringify(r.payload),
      ]
        .map(csvEscape)
        .join(","),
    ),
  ];
  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
