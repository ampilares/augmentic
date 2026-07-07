import { RISK_TIERS, TOOL_CATALOG_BY_NAME } from "@augmentic/shared";
import { ConnectorError, type ToolExecutionContext } from "./types";
import {
  DEMO_EMAILS,
  DEMO_EVENTS,
  DEMO_FILES,
  DEMO_MONDAY_BOARDS,
  DEMO_SLACK_MESSAGES,
  DEMO_XERO_INVOICES,
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
    case "monday.list_boards":
      return {
        boards: DEMO_MONDAY_BOARDS.map((b) => ({ id: b.id, name: b.name })),
      };
    case "monday.get_items": {
      const board = DEMO_MONDAY_BOARDS.find((b) => b.id === args.boardId);
      if (!board) return { error: "board not found" };
      const limit = Math.min(Number(args.limit ?? 50), 50);
      return {
        board: board.name,
        items: board.items.slice(0, limit).map((i) => ({
          id: i.id,
          name: i.name,
          columns: i.columns,
          updates: i.updates,
        })),
      };
    }
    case "monday.create_item":
      return {
        itemId: `i-demo-${Date.now()}`,
        created: true,
        demo: true,
        note: "Demo connection: item recorded in run log only.",
      };
    case "monday.update_item":
    case "monday.add_update":
      return {
        itemId: args.itemId,
        updated: true,
        demo: true,
        note: "Demo connection: update recorded in run log only.",
      };
    case "xero.list_invoices": {
      const status = String(args.status ?? "").toUpperCase();
      const limit = Math.min(Number(args.limit ?? 50), 50);
      let invoices = DEMO_XERO_INVOICES;
      if (status === "OVERDUE") {
        invoices = invoices.filter((i) => i.status === "AUTHORISED" && i.dueDaysAgo > 0);
      } else if (status) {
        invoices = invoices.filter((i) => i.status === status);
      }
      return {
        invoices: invoices.slice(0, limit).map((i) => ({
          id: i.id,
          number: i.number,
          contact: i.contactName,
          contactEmail: i.contactEmail,
          amountDue: i.amountDue,
          currency: i.currency,
          dueDate: new Date(Date.now() - i.dueDaysAgo * 86_400_000)
            .toISOString()
            .slice(0, 10),
          overdueDays: Math.max(0, i.dueDaysAgo),
          status: i.status,
        })),
      };
    }
    case "xero.get_contact": {
      const inv = DEMO_XERO_INVOICES.find((i) => i.contactId === args.contactId);
      if (!inv) return { error: "contact not found" };
      const outstanding = DEMO_XERO_INVOICES.filter(
        (i) => i.contactId === args.contactId && i.status === "AUTHORISED",
      ).reduce((acc, i) => acc + i.amountDue, 0);
      return {
        id: inv.contactId,
        name: inv.contactName,
        email: inv.contactEmail,
        outstandingBalance: outstanding,
      };
    }
    case "xero.create_invoice_reminder_note":
      return {
        invoiceId: args.invoiceId,
        noted: true,
        demo: true,
        note: "Demo connection: history note recorded in run log only.",
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
  const tenantId = ctx.connection!.tenantId;
  switch (toolName) {
    case "gcal.list_events": {
      const params = new URLSearchParams({
        timeMin: new Date(String(args.from)).toISOString(),
        timeMax: new Date(String(args.to)).toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "25",
      });
      return gfetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        token,
      );
    }
    case "gcal.create_event":
      return gfetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", token, {
        summary: args.title,
        description: args.description,
        start: { dateTime: new Date(String(args.start)).toISOString() },
        end: { dateTime: new Date(String(args.end)).toISOString() },
        attendees: ((args.attendees as string[]) ?? []).map((email) => ({ email })),
      });
    case "gdrive.search_files": {
      const q = String(args.query ?? "").replaceAll("'", "\\'");
      const params = new URLSearchParams({
        q: q ? `name contains '${q}' or fullText contains '${q}'` : "trashed = false",
        pageSize: "20",
        fields: "files(id,name,mimeType,modifiedTime)",
      });
      return gfetch(`https://www.googleapis.com/drive/v3/files?${params}`, token);
    }
    case "gdrive.read_file": {
      // Export Google Docs as text; download other files directly.
      const meta = (await gfetch(
        `https://www.googleapis.com/drive/v3/files/${args.fileId}?fields=id,name,mimeType`,
        token,
      )) as { id: string; name: string; mimeType: string };
      const isGoogleDoc = meta.mimeType.startsWith("application/vnd.google-apps");
      const url = isGoogleDoc
        ? `https://www.googleapis.com/drive/v3/files/${args.fileId}/export?mimeType=text/plain`
        : `https://www.googleapis.com/drive/v3/files/${args.fileId}?alt=media`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        throw new ConnectorError(
          `Drive read ${res.status}`,
          res.status === 401 ? "not_connected" : "provider_error",
        );
      }
      const content = (await res.text()).slice(0, 20000);
      return { id: meta.id, name: meta.name, content };
    }
    case "gdrive.create_doc": {
      const boundary = "augmentic-upload";
      const body = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify({
          name: args.title,
          mimeType: "application/vnd.google-apps.document",
        }),
        `--${boundary}`,
        "Content-Type: text/plain",
        "",
        String(args.content ?? ""),
        `--${boundary}--`,
      ].join("\r\n");
      const res = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        },
      );
      if (!res.ok) {
        throw new ConnectorError(
          `Drive create ${res.status}: ${(await res.text()).slice(0, 200)}`,
          res.status === 401 ? "not_connected" : "provider_error",
        );
      }
      return res.json();
    }
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
    case "monday.list_boards":
      return mondayGql(token, `query { boards (limit: 50) { id name } }`);
    case "monday.get_items":
      return mondayGql(
        token,
        `query { boards (ids: [${JSON.stringify(String(args.boardId))}]) {
          name items_page (limit: ${Math.min(Number(args.limit ?? 50), 50)}) {
            items { id name column_values { id text } updates { body } }
          } } }`,
      );
    case "monday.create_item":
      return mondayGql(
        token,
        `mutation { create_item (board_id: ${JSON.stringify(String(args.boardId))}, item_name: ${JSON.stringify(String(args.name))}, column_values: ${JSON.stringify(JSON.stringify(args.columnValues ?? {}))}) { id } }`,
      );
    case "monday.update_item":
      return mondayGql(
        token,
        `mutation { change_multiple_column_values (item_id: ${JSON.stringify(String(args.itemId))}, column_values: ${JSON.stringify(JSON.stringify(args.columnValues ?? {}))}) { id } }`,
      );
    case "monday.add_update":
      return mondayGql(
        token,
        `mutation { create_update (item_id: ${JSON.stringify(String(args.itemId))}, body: ${JSON.stringify(String(args.body))}) { id } }`,
      );
    case "xero.list_invoices": {
      const where =
        String(args.status ?? "").toUpperCase() === "OVERDUE"
          ? `Status=="AUTHORISED" AND DueDate<DateTime(${new Date().getFullYear()},${new Date().getMonth() + 1},${new Date().getDate()})`
          : args.status
            ? `Status=="${String(args.status).toUpperCase()}"`
            : "";
      const params = new URLSearchParams(where ? { where } : {});
      return xeroFetch(token, tenantId, `Invoices?${params}`);
    }
    case "xero.get_contact":
      return xeroFetch(token, tenantId, `Contacts/${args.contactId}`);
    case "xero.create_invoice_reminder_note":
      return xeroFetch(token, tenantId, `Invoices/${args.invoiceId}/History`, {
        Details: String(args.note),
      });
    default:
      throw new ConnectorError(
        `${toolName} is not implemented for real connections yet — use a demo connection or a supported tool.`,
        "not_implemented",
      );
  }
}

async function mondayGql(token: string, query: string): Promise<unknown> {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query }),
  });
  const json = (await res.json()) as { data?: unknown; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new ConnectorError(`monday.com error: ${json.errors[0]!.message}`, "provider_error");
  }
  return json.data;
}

async function xeroFetch(
  token: string,
  tenantId: string | undefined,
  path: string,
  jsonBody?: unknown,
): Promise<unknown> {
  if (!tenantId) {
    throw new ConnectorError(
      "Xero connection missing tenant id — reconnect the integration.",
      "not_connected",
    );
  }
  const res = await fetch(`https://api.xero.com/api.xro/2.0/${path}`, {
    method: jsonBody ? "PUT" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "xero-tenant-id": tenantId,
      Accept: "application/json",
      ...(jsonBody ? { "Content-Type": "application/json" } : {}),
    },
    body: jsonBody ? JSON.stringify(jsonBody) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ConnectorError(
      `Xero API ${res.status}: ${text.slice(0, 300)}`,
      res.status === 401 ? "not_connected" : "provider_error",
    );
  }
  return res.json();
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
