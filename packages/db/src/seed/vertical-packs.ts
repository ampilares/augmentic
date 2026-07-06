// Vertical pack #1: Agency / professional-services ops (PRD §17 wedge).
// A pack bundles agents (by template slug), workflows (by template slug,
// with suggested triggers/delivery), SOP knowledge docs, and recommended
// integrations — installable in one click. All content is original.

export interface PackWorkflowSpec {
  templateSlug: string;
  agentTemplateSlug: string;
  trigger: { type: "manual" } | { type: "schedule"; cron: string };
  delivery: { target: "run_log" | "slack_channel"; slackChannel?: string };
}

export interface PackSopDoc {
  title: string;
  content: string;
}

export interface VerticalPackSeed {
  slug: string;
  name: string;
  pitch: string;
  description: string;
  recommendedIntegrations: string[];
  agentTemplateSlugs: string[];
  workflows: PackWorkflowSpec[];
  sops: PackSopDoc[];
}

export const AGENCY_PACK: VerticalPackSeed = {
  slug: "agency-ops",
  name: "Agency Ops team",
  pitch:
    "Install your first AI ops team in one click: an Executive Assistant, a Sales Ops Rep, and a Finance Admin — with their workflows, SOPs, and safety defaults.",
  description:
    "Built for agencies and professional-services firms: inbox triage every morning, meeting prep before client calls, stalled-deal nudges, a weekly pipeline summary, and invoice chasing — all draft-first with approvals on anything client-facing.",
  recommendedIntegrations: ["google", "slack", "monday", "xero"],
  agentTemplateSlugs: ["executive-assistant", "sales-ops-rep", "finance-admin"],
  workflows: [
    {
      templateSlug: "daily-inbox-triage-digest",
      agentTemplateSlug: "executive-assistant",
      trigger: { type: "schedule", cron: "0 8 * * 1-5" },
      delivery: { target: "run_log" },
    },
    {
      templateSlug: "meeting-prep-brief",
      agentTemplateSlug: "executive-assistant",
      trigger: { type: "schedule", cron: "30 7 * * 1-5" },
      delivery: { target: "run_log" },
    },
    {
      templateSlug: "stalled-deal-nudge",
      agentTemplateSlug: "sales-ops-rep",
      trigger: { type: "schedule", cron: "0 9 * * 2" },
      delivery: { target: "run_log" },
    },
    {
      templateSlug: "weekly-pipeline-summary",
      agentTemplateSlug: "sales-ops-rep",
      trigger: { type: "schedule", cron: "0 16 * * 5" },
      delivery: { target: "run_log" },
    },
    {
      templateSlug: "invoice-payment-chaser",
      agentTemplateSlug: "finance-admin",
      trigger: { type: "schedule", cron: "0 9 * * 1,4" },
      delivery: { target: "run_log" },
    },
  ],
  sops: [
    {
      title: "Agency SOP: client communication standards",
      content:
        "All client-facing messages follow these rules. Reply-time expectation: same business day for clients, 48h for prospects. " +
        "Every message names a concrete next step and who owns it. Never discuss internal capacity, staffing, or other clients. " +
        "Escalate to a human immediately when a message mentions: cancellation, refund, legal, scope dispute, or anything emotionally charged. " +
        "Drafts referencing money must quote exact figures from source records, never rounded or recalled numbers.",
    },
    {
      title: "Agency SOP: pipeline stages and follow-up cadence",
      content:
        "Stages: New lead → Discovery call → Proposal sent → Negotiation → Won/Lost. " +
        "Cadence: new leads get a same-day response; proposals get a follow-up after 5 business days of silence, then 10, then a graceful close-out at 20. " +
        "A deal is 'stalled' after 7 days without a reply. Nudges reference the last concrete exchange and offer exactly one next step. " +
        "Never mark a deal Lost without a human decision.",
    },
    {
      title: "Agency SOP: invoicing and payment chasing",
      content:
        "Payment terms are 14 days unless the engagement letter says otherwise. Reminder ladder: day 3 friendly, day 14 firm with a requested payment date, day 30 final notice flagged to the owner. " +
        "Reminders always include invoice number, amount, and due date from the accounting system. One invoice per email. " +
        "If a client disputes an invoice or asks for a payment plan, stop the ladder and escalate to a human. Never offer discounts or write-offs.",
    },
  ],
};

export const VERTICAL_PACKS: VerticalPackSeed[] = [AGENCY_PACK];
