import { RISK_TIERS, TOOL_CATALOG_BY_NAME } from "@augmentic/shared";
import { ConnectorError, type ToolExecutionContext } from "./types";
import {
  DEMO_EMAILS,
  DEMO_EVENTS,
  DEMO_FILES,
  DEMO_SLACK_MESSAGES,
} from "./demo-data";

const tierRank = (tier: string) => RISK_TIERS.indexOf(tier as never);

function daysAgoIso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString();
}

// Single entry point the engine calls after policy clearance. Defense in
// depth: even if the engine mis-gates, simulation mode can never produce a
// side effect here.
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<unknown> {
  const spec = TOOL_CATALOG_BY_NAME[toolName];
  if (!spec) throw new ConnectorError(`Unknown tool ${toolName}`, "unknown_tool");

  if (ctx.mode === "simulation" && tierRank(spec.riskTier) > tierRank("draft")) {
    throw new ConnectorError(
      `Simulation mode: ${toolName} (${spec.riskTier}) side effects are blocked.`,
      "side_effect_blocked",
    );
  }

  if (spec.provider !== "internal" && spec.provider !== "webhook") {
    if (!ctx.connection) {
      throw new ConnectorError(
        `No ${spec.provider} connection for this workspace.`,
        "not_connected",
      );
    }
    if (!ctx.connection.isDemo && !ctx.connection.accessToken) {
      throw new ConnectorError(
        `${spec.provider} connection has no usable credentials — reconnect it.`,
        "not_connected",
      );
    }
  }

  if (ctx.connection?.isDemo || spec.provider === "internal") {
    return executeDemo(toolName, args, ctx);
  }
  if (spec.provider === "webhook") {
    return executeWebhookDeliver(args, ctx);
  }
  return executeReal(toolName, args, ctx);
}

// --------------------------------------------------------------------------
// Demo executors — deterministic sample data (fictional Beacon Studio).
// --------------------------------------------------------------------------

async function executeDemo(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<unknown> {
  switch (toolName) {
    case "gmail.search_messages": {
      const query = String(args.query ?? "").toLowerCase();
      const max = Math.min(Number(args.maxResults ?? 25), 25);
      let msgs = DEMO_EMAILS;
      if (query.includes("newer_than:1d")) {
        msgs = msgs.filter((m) => m.daysAgo <= 1);
      } else if (query.includes("newer_than:7d")) {
        msgs = msgs.filter((m) => m.daysAgo <= 7);
      }
      if (query.includes("is:unread")) msgs = msgs.filter((m) => m.unread);
      if (query.includes("in:sent") || query.includes("label:sent")) {
        msgs = DEMO_EMAILS.filter((m) => m.labels.includes("SENT"));
      }
      const terms = query
        .replace(/(newer_than|is|in|label):\S+/g, "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (terms.length > 0) {
        msgs = msgs.filter((m) =>
          terms.some(
            (t) =>
              m.subject.toLowerCase().includes(t) ||
              m.body.toLowerCase().includes(t) ||
              m.from.toLowerCase().includes(t),
          ),
        );
      }
      return {
        messages: msgs.slice(0, max).map((m) => ({
          id: m.id,
          from: m.from,
          subject: m.subject,
          date: daysAgoIso(m.daysAgo),
          snippet: m.body.slice(0, 120),
          unread: m.unread,
        })),
      };
    }
    case "gmail.get_message": {
      const msg = DEMO_EMAILS.find((m) => m.id === args.messageId);
      if (!msg) return { error: "message not found" };
      return {
        id: msg.id,
        from: msg.from,
        to: msg.to,
        subject: msg.subject,
        date: daysAgoIso(msg.daysAgo),
        body: msg.body,
      };
    }
    case "gmail.create_draft":
      return {
        draftId: `draft-${ctx.idempotencyKey ?? Math.random().toString(36).slice(2, 10)}`,
        to: args.to,
        subject: args.subject,
        demo: true,
        note: "Draft created in demo account (no real mailbox touched).",
      };
    case "gmail.send_email":
      return {
        sent: true,
        to: args.to,
        subject: args.subject,
        demo: true,
        note: "Demo connection: send simulated, no real email left the workspace.",
      };
    case "gcal.list_events": {
      return {
        events: DEMO_EVENTS.map((e) => {
          const start = new Date();
          start.setDate(start.getDate() + e.daysFromNow);
          start.setHours(e.startHour, 0, 0, 0);
          const end = new Date(start.getTime() + e.durationMins * 60_000);
          return {
            id: e.id,
            title: e.title,
            start: start.toISOString(),
            end: end.toISOString(),
            attendees: e.attendees,
            description: e.description,
          };
        }),
      };
    }
    case "gcal.create_event":
      return { eventId: `evt-${Date.now()}`, created: true, demo: true };
    case "gdrive.search_files": {
      const q = String(args.query ?? "").toLowerCase();
      return {
        files: DEMO_FILES.filter(
          (f) =>
            q === "" ||
            f.name.toLowerCase().includes(q) ||
            f.content.toLowerCase().includes(q),
        ).map((f) => ({ id: f.id, name: f.name })),
      };
    }
    case "gdrive.read_file": {
      const f = DEMO_FILES.find((x) => x.id === args.fileId);
      return f ? { id: f.id, name: f.name, content: f.content } : { error: "not found" };
    }
    case "gdrive.create_doc":
      return { fileId: `f-${Date.now()}`, created: true, demo: true };
    case "slack.read_channel": {
      const channel = String(args.channel ?? "");
      const limit = Math.min(Number(args.limit ?? 50), 50);
      return {
        messages: DEMO_SLACK_MESSAGES.filter(
          (m) => channel === "" || m.channel === channel,
        )
          .slice(0, limit)
          .map((m) => ({
            channel: m.channel,
            user: m.user,
            date: daysAgoIso(m.daysAgo),
            text: m.text,
          })),
      };
    }
    case "slack.post_message":
      return {
        posted: true,
        channel: args.channel,
        demo: true,
        note: "Demo connection: message recorded in run log only.",
      };
    case "knowledge.search":
      // Knowledge search is wired by the engine to the workspace KB; this
      // fallback exists so demo agents don't crash when KB is empty.
      return { results: [] };
    default:
      throw new ConnectorError(
        `No demo executor for ${toolName}`,
        "not_implemented",
      );
  }
}

// --------------------------------------------------------------------------
// Real executors — OAuth-token API calls. MVP implements Gmail + Slack
// (the Phase 1 integration set); the rest raise clear errors so a real
// connection failure is visible, never silent.
// --------------------------------------------------------------------------

async function executeReal(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<unknown> {
  const token = ctx.connection!.accessToken!;
  switch (toolName) {
    case "gmail.search_messages": {
      const params = new URLSearchParams({
        q: String(args.query ?? ""),
        maxResults: String(Math.min(Number(args.maxResults ?? 10), 25)),
      });
      const res = await gfetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
        token,
      );
      return res;
    }
    case "gmail.get_message":
      return gfetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${args.messageId}?format=full`,
        token,
      );
    case "gmail.create_draft": {
      const raw = buildRfc822(
        String(args.to),
        String(args.subject),
        String(args.body),
      );
      return gfetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
        token,
        { message: { raw } },
      );
    }
    case "gmail.send_email": {
      const raw = buildRfc822(
        String(args.to),
        String(args.subject),
        String(args.body),
      );
      return gfetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        token,
        { raw },
      );
    }
    case "slack.post_message": {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ channel: args.channel, text: args.text }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok)
        throw new ConnectorError(`Slack error: ${json.error}`, "provider_error");
      return json;
    }
    case "slack.read_channel": {
      const params = new URLSearchParams({
        channel: String(args.channel),
        limit: String(Math.min(Number(args.limit ?? 20), 50)),
      });
      const res = await fetch(
        `https://slack.com/api/conversations.history?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok)
        throw new ConnectorError(`Slack error: ${json.error}`, "provider_error");
      return json;
    }
    default:
      throw new ConnectorError(
        `${toolName} is not implemented for real connections yet — use a demo connection or a supported tool.`,
        "not_implemented",
      );
  }
}

async function executeWebhookDeliver(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<unknown> {
  const url = String(args.url ?? "");
  if (!/^https?:\/\//.test(url)) {
    throw new ConnectorError("webhook.deliver: invalid url", "provider_error");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Augmentic-Idempotency-Key": ctx.idempotencyKey ?? "",
    },
    body: JSON.stringify(args.payload ?? {}),
  });
  return { status: res.status, ok: res.ok };
}

async function gfetch(
  url: string,
  token: string,
  jsonBody?: unknown,
): Promise<unknown> {
  const res = await fetch(url, {
    method: jsonBody ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(jsonBody ? { "Content-Type": "application/json" } : {}),
    },
    body: jsonBody ? JSON.stringify(jsonBody) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ConnectorError(
      `Google API ${res.status}: ${text.slice(0, 300)}`,
      res.status === 401 ? "not_connected" : "provider_error",
    );
  }
  return res.json();
}

function buildRfc822(to: string, subject: string, body: string): string {
  const message = [`To: ${to}`, `Subject: ${subject}`, "", body].join("\r\n");
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
