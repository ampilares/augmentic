import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { workflowTriggers, workflows } from "@augmentic/db";
import { getBootedDb } from "@/lib/boot";
import { enqueueRun } from "@augmentic/engine";

export const dynamic = "force-dynamic";

// Signed inbound webhook trigger (FR-013). The URL token identifies the
// trigger; the HMAC signature over the raw body proves the sender holds the
// per-trigger secret.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const db = await getBootedDb();
  const [trigger] = await db
    .select()
    .from(workflowTriggers)
    .where(eq(workflowTriggers.webhookToken, token));
  if (!trigger || trigger.triggerType !== "webhook" || !trigger.enabled) {
    return Response.json({ error: "unknown webhook" }, { status: 404 });
  }

  const body = await req.text();
  const signature = req.headers.get("x-augmentic-signature") ?? "";
  const expected = crypto
    .createHmac("sha256", trigger.webhookSecret ?? "")
    .update(body)
    .digest("hex");
  const valid =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  const [wf] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, trigger.workflowId));
  if (!wf || wf.status === "paused" || wf.status === "blocked") {
    return Response.json({ error: "workflow not active" }, { status: 409 });
  }

  let payload: unknown = {};
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    payload = { raw: body.slice(0, 4000) };
  }

  const runId = await enqueueRun(db, {
    workspaceId: trigger.workspaceId,
    workflowId: trigger.workflowId,
    triggerType: "webhook",
    triggerSnapshot: { payload, receivedAt: new Date().toISOString() },
  });
  await db
    .update(workflowTriggers)
    .set({ lastFiredAt: new Date(), updatedAt: new Date() })
    .where(eq(workflowTriggers.id, trigger.id));

  return Response.json({ ok: true, runId });
}
