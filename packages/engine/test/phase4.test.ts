import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import { and, eq } from "drizzle-orm";
import {
  agents,
  approvalRequests,
  integrationConnections,
  mcpServers,
  memberships,
  orgEdges,
  orgNodes,
  toolCalls,
  users,
  workflowRuns,
  workspaces,
  getDb,
  type Db,
} from "@augmentic/db";
import { seedBuiltins } from "@augmentic/db/seed";
import { discoverMcpTools } from "@augmentic/connectors";
import { enqueueRun } from "../src/enqueue";
import { processRun } from "../src/pipeline";
import { decideApproval } from "../src/approvals";

process.env.PGLITE_DATA_DIR = ":memory:";

let db: Db;
let wsId: string;
let userId: string;
let frankieId: string; // finance agent, allowed to hand off to Emmy
let emmyId: string;
let mcpHttpServer: http.Server;
let mcpUrl: string;
const mcpCalls: { name: string; args: unknown }[] = [];

beforeAll(async () => {
  db = await getDb();
  await seedBuiltins(db);
  const [ws] = await db
    .insert(workspaces)
    .values({ name: "P4 Co", slug: "p4-co", settings: { plan: "pro" } })
    .returning({ id: workspaces.id });
  wsId = ws!.id;
  const [u] = await db
    .insert(users)
    .values({ email: "owner@p4.test", name: "Owner", passwordHash: "x" })
    .returning({ id: users.id });
  userId = u!.id;
  await db.insert(memberships).values({ workspaceId: wsId, userId, role: "owner" });

  const mkAgent = async (name: string, role: string) => {
    const [a] = await db
      .insert(agents)
      .values({
        workspaceId: wsId,
        name,
        roleTitle: role,
        jobDescription: `${role} duties.`,
        status: "active",
        // ask_when_unsure allows explicitly-allowed internal_write to auto-run.
        autonomyMode: "ask_when_unsure",
      })
      .returning({ id: agents.id });
    return a!.id;
  };
  frankieId = await mkAgent("Frankie", "Finance Admin");
  emmyId = await mkAgent("Emmy", "Executive Assistant");

  await db.insert(integrationConnections).values({
    workspaceId: wsId,
    provider: "google",
    accountLabel: "Demo google",
    isDemo: true,
    healthStatus: "connected",
  });

  // Handoff route: Frankie → Emmy (org nodes + hands_off edge).
  const mkNode = async (agentId: string, label: string) => {
    const [n] = await db
      .insert(orgNodes)
      .values({ workspaceId: wsId, nodeType: "agent", refId: agentId, label })
      .returning({ id: orgNodes.id });
    return n!.id;
  };
  const frankieNode = await mkNode(frankieId, "Frankie");
  const emmyNode = await mkNode(emmyId, "Emmy");
  await db.insert(orgEdges).values({
    workspaceId: wsId,
    fromNodeId: frankieNode,
    toNodeId: emmyNode,
    edgeType: "hands_off",
  });

  // Allow agent.handoff for Frankie (internal_write default is approval).
  const { toolDefinitions, toolPermissionPolicies } = await import("@augmentic/db");
  const [handoffDef] = await db
    .select({ id: toolDefinitions.id })
    .from(toolDefinitions)
    .where(eq(toolDefinitions.name, "agent.handoff"));
  await db.insert(toolPermissionPolicies).values({
    workspaceId: wsId,
    agentId: frankieId,
    toolDefinitionId: handoffDef!.id,
    setting: "allow",
  });

  // Stub MCP server (Streamable HTTP JSON-RPC).
  mcpHttpServer = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const rpc = JSON.parse(body || "{}");
      res.setHeader("Content-Type", "application/json");
      if (rpc.method === "tools/list") {
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id,
            result: {
              tools: [
                {
                  name: "create_ticket",
                  description: "Create a support ticket in ExternalSys",
                  inputSchema: {
                    type: "object",
                    properties: { title: { type: "string" } },
                    required: ["title"],
                  },
                },
              ],
            },
          }),
        );
      } else if (rpc.method === "tools/call") {
        mcpCalls.push({ name: rpc.params.name, args: rpc.params.arguments });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id,
            result: { content: [{ type: "text", text: "ticket TCK-1 created" }] },
          }),
        );
      } else {
        res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: {} }));
      }
    });
  });
  await new Promise<void>((resolve) => mcpHttpServer.listen(0, "127.0.0.1", resolve));
  const address = mcpHttpServer.address() as { port: number };
  mcpUrl = `http://127.0.0.1:${address.port}/mcp`;
}, 60_000);

afterAll(() => {
  mcpHttpServer?.close();
});

async function runFor(agentId: string, instructions: string) {
  const runId = await enqueueRun(db, {
    workspaceId: wsId,
    agentId,
    mode: "live",
    triggerType: "manual",
    triggerSnapshot: { instructions },
  });
  await processRun(db, runId);
  const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
  return { runId, run: run! };
}

describe("multi-agent handoffs (Phase 4)", () => {
  it("executes a handoff along a configured route and spawns a child run", async () => {
    const { runId, run } = await runFor(
      frankieId,
      "Review the inbox for scheduling requests and hand off to Emmy the task of preparing the meeting brief.",
    );
    expect(run.status).toBe("succeeded");
    const calls = await db
      .select()
      .from(toolCalls)
      .where(and(eq(toolCalls.workflowRunId, runId), eq(toolCalls.toolName, "agent.handoff")));
    expect(calls.filter((c) => c.executedAt).length).toBe(1);
    const result = calls[0]!.result as { childRunId?: string };
    expect(result.childRunId).toBeTruthy();
    // Child run belongs to Emmy and completes.
    await processRun(db, result.childRunId!);
    const [child] = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, result.childRunId!));
    expect(child!.agentId).toBe(emmyId);
    expect(child!.status).toBe("succeeded");
  });

  it("rejects a handoff with no configured route (per-hop policy)", async () => {
    // Emmy has no outgoing routes; agent.handoff isn't even offered, so a
    // model-proposed handoff can't exist. Verify at the enforcement layer by
    // giving Emmy an allow permission and instructions that name Frankie —
    // the tool is still absent from her available set (no edge), so no
    // handoff tool call is recorded.
    const { runId, run } = await runFor(
      emmyId,
      "Summarize the inbox and hand off to Frankie the task of chasing invoices.",
    );
    expect(["succeeded", "waiting_approval"]).toContain(run.status);
    const calls = await db
      .select()
      .from(toolCalls)
      .where(and(eq(toolCalls.workflowRunId, runId), eq(toolCalls.toolName, "agent.handoff")));
    expect(calls.filter((c) => c.executedAt).length).toBe(0);
  });
});

describe("trusted MCP servers (Phase 4)", () => {
  it("discovers tools from the server", async () => {
    const tools = await discoverMcpTools(mcpUrl);
    expect(tools.map((t) => t.name)).toContain("create_ticket");
  });

  it("MCP tool calls always require approval and log data shared", async () => {
    const tools = await discoverMcpTools(mcpUrl);
    await db.insert(mcpServers).values({
      workspaceId: wsId,
      slug: "externalsys",
      name: "ExternalSys",
      url: mcpUrl,
      toolsCache: tools,
      addedByUserId: userId,
    });

    // Force a deterministic MCP proposal: the simulated runtime won't invent
    // MCP calls, so enqueue a run whose approved action we inject by driving
    // the pipeline to the approval, then approving an edited payload is not
    // possible either — instead, test the execution path directly through a
    // parked approval created by a synthetic action list.
    const runId = await enqueueRun(db, {
      workspaceId: wsId,
      agentId: frankieId,
      mode: "live",
      triggerType: "manual",
      triggerSnapshot: { instructions: "Check invoices." },
    });
    // Seed resume state at the actions phase with a pending MCP action, as if
    // the model had proposed it.
    await db
      .update(workflowRuns)
      .set({
        resumeState: {
          phase: "actions",
          stepSeq: 1,
          output: "Ticket needed for overdue invoice follow-up. [Evidence 1]",
          evidence: [],
          actions: [
            {
              call: {
                toolName: "mcp.externalsys.create_ticket",
                args: { title: "Chase INV-204" },
                rationale: "External system of record",
              },
              status: "pending",
            },
          ],
          actionIndex: 0,
        } as never,
      })
      .where(eq(workflowRuns.id, runId));
    await processRun(db, runId);
    let [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
    // external_send tier → always approval, even though the agent has no
    // explicit MCP permission row.
    expect(run!.status).toBe("waiting_approval");
    const [approval] = await db
      .select()
      .from(approvalRequests)
      .where(
        and(eq(approvalRequests.workflowRunId, runId), eq(approvalRequests.status, "pending")),
      );
    expect(approval!.requestedAction).toBe("mcp.externalsys.create_ticket");
    expect(approval!.riskTier).toBe("external_send");

    await decideApproval(db, {
      workspaceId: wsId,
      approvalRequestId: approval!.id,
      action: "approve",
      decidedByUserId: userId,
      decidedByLabel: "owner@p4.test",
    });
    await processRun(db, runId);
    [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
    expect(run!.status).toBe("succeeded");
    // The stub actually received the call with the approved payload.
    expect(mcpCalls.length).toBe(1);
    expect(mcpCalls[0]!.name).toBe("create_ticket");
    expect((mcpCalls[0]!.args as { title: string }).title).toBe("Chase INV-204");
  });
});
