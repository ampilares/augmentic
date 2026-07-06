import type { ToolSpec } from "./types";

// Canonical MVP tool catalog. Connectors implement executors keyed by tool
// name; the seed loads these into tool_definitions; the policy engine reads
// risk tiers from here (via the DB row) — never from the model.

const str = (description: string) => ({ type: "string", description });

export const TOOL_CATALOG: ToolSpec[] = [
  // ---- Gmail -------------------------------------------------------------
  {
    provider: "gmail",
    name: "gmail.search_messages",
    description: "Search the connected Gmail inbox with a query string.",
    riskTier: "read",
    inputSchema: {
      type: "object",
      properties: {
        query: str("Gmail search query, e.g. 'newer_than:1d is:unread'"),
        maxResults: { type: "number", description: "Max messages (<=25)" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    provider: "gmail",
    name: "gmail.get_message",
    description: "Fetch a single email message body and headers by id.",
    riskTier: "read",
    inputSchema: {
      type: "object",
      properties: { messageId: str("Message id from search results") },
      required: ["messageId"],
      additionalProperties: false,
    },
  },
  {
    provider: "gmail",
    name: "gmail.create_draft",
    description:
      "Create a draft email in the connected account. The draft is not sent.",
    riskTier: "draft",
    inputSchema: {
      type: "object",
      properties: {
        to: str("Recipient email address"),
        subject: str("Email subject"),
        body: str("Plain-text email body"),
        inReplyToMessageId: {
          type: "string",
          description: "Optional message id this drafts a reply to",
        },
      },
      required: ["to", "subject", "body"],
      additionalProperties: false,
    },
  },
  {
    provider: "gmail",
    name: "gmail.send_email",
    description:
      "Send an email to an external recipient from the connected account.",
    riskTier: "external_send",
    inputSchema: {
      type: "object",
      properties: {
        to: str("Recipient email address"),
        subject: str("Email subject"),
        body: str("Plain-text email body"),
      },
      required: ["to", "subject", "body"],
      additionalProperties: false,
    },
  },
  // ---- Google Calendar ----------------------------------------------------
  {
    provider: "gcal",
    name: "gcal.list_events",
    description: "List calendar events in a date range.",
    riskTier: "read",
    inputSchema: {
      type: "object",
      properties: {
        from: str("ISO date, start of range"),
        to: str("ISO date, end of range"),
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
  },
  {
    provider: "gcal",
    name: "gcal.create_event",
    description: "Create a calendar event on the connected calendar.",
    riskTier: "internal_write",
    inputSchema: {
      type: "object",
      properties: {
        title: str("Event title"),
        start: str("ISO datetime"),
        end: str("ISO datetime"),
        attendees: {
          type: "array",
          items: { type: "string" },
          description: "Attendee email addresses",
        },
        description: str("Event description"),
      },
      required: ["title", "start", "end"],
      additionalProperties: false,
    },
  },
  // ---- Google Drive --------------------------------------------------------
  {
    provider: "gdrive",
    name: "gdrive.search_files",
    description: "Search files in the connected Drive.",
    riskTier: "read",
    inputSchema: {
      type: "object",
      properties: { query: str("File name or content query") },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    provider: "gdrive",
    name: "gdrive.read_file",
    description: "Read the text content of a Drive file by id.",
    riskTier: "read",
    inputSchema: {
      type: "object",
      properties: { fileId: str("Drive file id") },
      required: ["fileId"],
      additionalProperties: false,
    },
  },
  {
    provider: "gdrive",
    name: "gdrive.create_doc",
    description: "Create a new document in the connected Drive.",
    riskTier: "internal_write",
    inputSchema: {
      type: "object",
      properties: {
        title: str("Document title"),
        content: str("Document body text"),
      },
      required: ["title", "content"],
      additionalProperties: false,
    },
  },
  // ---- Slack ---------------------------------------------------------------
  {
    provider: "slack",
    name: "slack.read_channel",
    description: "Read recent messages from a Slack channel.",
    riskTier: "read",
    inputSchema: {
      type: "object",
      properties: {
        channel: str("Channel name, e.g. #general"),
        limit: { type: "number", description: "Max messages (<=50)" },
      },
      required: ["channel"],
      additionalProperties: false,
    },
  },
  {
    provider: "slack",
    name: "slack.post_message",
    description: "Post a message to an internal Slack channel.",
    riskTier: "internal_write",
    inputSchema: {
      type: "object",
      properties: {
        channel: str("Channel name, e.g. #reports"),
        text: str("Message text (Slack mrkdwn)"),
      },
      required: ["channel", "text"],
      additionalProperties: false,
    },
  },
  // ---- Generic webhook -------------------------------------------------------
  {
    provider: "webhook",
    name: "webhook.deliver",
    description:
      "POST a JSON payload to an external webhook URL configured for this workflow.",
    riskTier: "external_send",
    inputSchema: {
      type: "object",
      properties: {
        url: str("Destination URL"),
        payload: { type: "object", description: "JSON body to send" },
      },
      required: ["url", "payload"],
      additionalProperties: false,
    },
  },
  // ---- Internal ---------------------------------------------------------------
  {
    provider: "internal",
    name: "knowledge.search",
    description:
      "Search the workspace knowledge base for relevant documents and facts.",
    riskTier: "read",
    inputSchema: {
      type: "object",
      properties: {
        query: str("Search query"),
        limit: { type: "number", description: "Max results (<=10)" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

export const TOOL_CATALOG_BY_NAME: Record<string, ToolSpec> =
  Object.fromEntries(TOOL_CATALOG.map((t) => [t.name, t]));

export const CONNECTOR_PROVIDERS = [
  {
    provider: "google",
    label: "Google Workspace",
    description: "Gmail, Google Calendar, and Google Drive.",
    subProviders: ["gmail", "gcal", "gdrive"],
  },
  {
    provider: "slack",
    label: "Slack",
    description: "Read channels and post updates to your team.",
    subProviders: ["slack"],
  },
  {
    provider: "webhook",
    label: "Webhook",
    description: "Trigger workflows and deliver output to any URL.",
    subProviders: ["webhook"],
  },
] as const;
