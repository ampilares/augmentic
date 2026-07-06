// MVP workflow templates (PRD §14). All content is original.

export interface WorkflowTemplateSeed {
  slug: string;
  category: string;
  name: string;
  description: string;
  instructions: string;
  dependencies: string[]; // provider slugs that must be connected
  sampleOutput: string;
  triggerOptions: string[];
  defaultRoleSlug: string;
  requiredScopes: string[];
  defaultApprovalPolicy: Record<string, string>;
  successMetric: string;
}

export const WORKFLOW_TEMPLATE_SEEDS: WorkflowTemplateSeed[] = [
  {
    slug: "daily-inbox-triage-digest",
    category: "Inbox",
    name: "Daily inbox triage digest",
    description:
      "Every morning, group new email by urgency and post a short digest with recommended actions.",
    instructions:
      "Search the inbox for messages from the last 24 hours. Group them into: urgent (client, money, deadline), needs reply, FYI, and noise. For urgent and needs-reply messages, suggest a one-line next action. Post the digest to the configured Slack channel. Do not reply to any email.",
    dependencies: ["google", "slack"],
    sampleOutput:
      "*Inbox digest — Tue*\n🔴 Urgent (2): Acme invoice question (reply today) · Contract deadline note\n🟡 Needs reply (3): intro request, scheduling, vendor quote\n⚪ FYI (5) · 🗑 Noise (12)",
    triggerOptions: ["schedule", "manual"],
    defaultRoleSlug: "executive-assistant",
    requiredScopes: ["gmail.read", "slack.write"],
    defaultApprovalPolicy: {},
    successMetric: "Digest delivered daily; urgent messages surfaced within 24h",
  },
  {
    slug: "meeting-prep-brief",
    category: "Calendar",
    name: "Meeting prep brief",
    description:
      "Before external meetings, assemble who you're meeting, recent context, and talking points.",
    instructions:
      "List today's calendar events. For each external meeting, search email for recent threads with the attendees, pull relevant knowledge-base notes, and produce a brief: attendees, purpose, recent context, open items, and 3 suggested talking points. Deliver briefs to the run log and Slack.",
    dependencies: ["google", "slack"],
    sampleOutput:
      "*Prep: Acme check-in, 2pm*\nAttendees: J. Reyes (CFO)\nContext: invoice #204 discussion last week; awaiting revised scope\nOpen: scope sign-off, Q3 dates\nTalking points: confirm scope, propose timeline, raise renewal",
    triggerOptions: ["schedule", "manual"],
    defaultRoleSlug: "executive-assistant",
    requiredScopes: ["gcal.read", "gmail.read"],
    defaultApprovalPolicy: {},
    successMetric: "Brief exists before every external meeting",
  },
  {
    slug: "post-meeting-follow-up",
    category: "Follow-ups",
    name: "Post-meeting follow-up draft",
    description:
      "After a meeting, draft the recap and next-steps email for your review.",
    instructions:
      "Given the meeting referenced by the trigger (or the most recent finished meeting), draft a follow-up email: thanks, decisions made, action items with owners, and proposed next meeting. Create it as an email draft — never send.",
    dependencies: ["google"],
    sampleOutput:
      "Draft to j.reyes@acme.com — 'Recap & next steps': decisions (2), actions (3, owners tagged), proposed next check-in Fri.",
    triggerOptions: ["manual", "app_event"],
    defaultRoleSlug: "executive-assistant",
    requiredScopes: ["gmail.draft", "gcal.read"],
    defaultApprovalPolicy: { "gmail.send_email": "require_approval" },
    successMetric: "Follow-up drafted within 1h of meeting end",
  },
  {
    slug: "stalled-deal-nudge",
    category: "Sales",
    name: "Stalled deal nudge draft",
    description:
      "Spot deals gone quiet and draft a re-engagement email for approval.",
    instructions:
      "Find deal threads with no reply for 7+ days. For each, draft a short, low-pressure nudge referencing the last exchange and offering a concrete next step. Queue each draft for approval — never send automatically.",
    dependencies: ["google"],
    sampleOutput:
      "3 stalled threads found. Draft #1 to sam@northco.com: references quote sent 9 days ago, offers 15-min call Thu/Fri.",
    triggerOptions: ["schedule", "manual"],
    defaultRoleSlug: "sales-ops-rep",
    requiredScopes: ["gmail.read", "gmail.draft"],
    defaultApprovalPolicy: { "gmail.send_email": "require_approval" },
    successMetric: "Stalled deals get a draft within 8 days of silence",
  },
  {
    slug: "weekly-pipeline-summary",
    category: "Sales",
    name: "Weekly pipeline summary",
    description:
      "Every week, summarize what moved, what stalled, and what needs attention.",
    instructions:
      "Review deal-related email from the past 7 days. Summarize: deals that advanced, deals gone quiet, new inbound interest, and risks. Post the summary to the configured Slack channel with citations to source threads.",
    dependencies: ["google", "slack"],
    sampleOutput:
      "*Pipeline — week 27*\nAdvanced: NorthCo (verbal yes) · Stalled: Acme expansion (9d quiet)\nNew: 2 inbound · Risk: BrightLabs waiting on legal 12d",
    triggerOptions: ["schedule", "manual"],
    defaultRoleSlug: "sales-ops-rep",
    requiredScopes: ["gmail.read", "slack.write"],
    defaultApprovalPolicy: {},
    successMetric: "Summary posted weekly; owner rates it accurate",
  },
  {
    slug: "crm-hygiene-suggestions",
    category: "Sales",
    name: "CRM hygiene suggestions",
    description:
      "Weekly checklist of CRM cleanups: missing fields, duplicates, stage mismatches.",
    instructions:
      "Review recent contact and deal activity visible in email. Produce a checklist of suggested CRM fixes (missing company/title, threads without a logged deal, likely duplicates). Deliver as a checklist for a human to apply — do not modify any records.",
    dependencies: ["google"],
    sampleOutput:
      "7 suggestions: add title for L. Chen · merge 'North Co'/'NorthCo' · log deal for quote thread with sam@…",
    triggerOptions: ["schedule", "manual"],
    defaultRoleSlug: "sales-ops-rep",
    requiredScopes: ["gmail.read"],
    defaultApprovalPolicy: {},
    successMetric: "≥50% of suggestions accepted by the owner",
  },
  {
    slug: "invoice-payment-chaser",
    category: "Finance",
    name: "Invoice payment chaser draft",
    description:
      "Draft escalating payment reminders for overdue invoices, queued for approval.",
    instructions:
      "Find overdue invoices from the connected records. For each, draft a reminder matched to how overdue it is: gentle at 3+ days, firm at 14+, final notice at 30+. Include invoice number, amount, and due date from the source record. Queue every draft for approval — never send automatically.",
    dependencies: ["google"],
    sampleOutput:
      "2 overdue: INV-204 Acme $3,400 (12d) → firm reminder drafted · INV-198 BrightLabs $950 (4d) → gentle reminder drafted",
    triggerOptions: ["schedule", "manual"],
    defaultRoleSlug: "finance-admin",
    requiredScopes: ["gmail.read", "gmail.draft"],
    defaultApprovalPolicy: { "gmail.send_email": "require_approval" },
    successMetric: "Overdue invoices get a reminder within 24h of threshold",
  },
  {
    slug: "receipt-collection-reminder",
    category: "Finance",
    name: "Receipt collection reminder draft",
    description:
      "Before book-close, draft requests for missing receipts and documents.",
    instructions:
      "Check for expense items missing receipts in the connected records. Draft a short request to each responsible person listing the missing items and the deadline. Queue drafts for approval.",
    dependencies: ["google"],
    sampleOutput:
      "3 people owe receipts. Draft to alex@…: 2 items (client dinner 6/28 $140, rideshare 7/1 $32), due Fri.",
    triggerOptions: ["schedule", "manual"],
    defaultRoleSlug: "finance-admin",
    requiredScopes: ["gmail.draft"],
    defaultApprovalPolicy: { "gmail.send_email": "require_approval" },
    successMetric: "Receipts collected before close without manual chasing",
  },
  {
    slug: "weekly-client-status-report",
    category: "Client success",
    name: "Weekly client status report draft",
    description:
      "Per-client weekly update: done, in progress, blocked, next — drafted for review.",
    instructions:
      "For each active client, assemble the week's activity from email, Slack, and docs into a status draft: completed, in progress, blocked (with reason), and next steps. Only include facts you can cite. Create an email draft per client for review — never send.",
    dependencies: ["google", "slack"],
    sampleOutput:
      "Draft to acme: ✅ landing page shipped · 🔄 analytics setup (80%) · ⛔ waiting on brand assets (asked 7/2) · Next: launch checklist",
    triggerOptions: ["schedule", "manual"],
    defaultRoleSlug: "client-success-rep",
    requiredScopes: ["gmail.read", "gmail.draft", "slack.read"],
    defaultApprovalPolicy: { "gmail.send_email": "require_approval" },
    successMetric: "Every active client gets a weekly update; low edit rate",
  },
  {
    slug: "support-ticket-triage-summary",
    category: "Support",
    name: "Support ticket triage summary",
    description:
      "Digest of new support requests grouped by severity with suggested owners.",
    instructions:
      "Collect new support requests from the shared inbox and Slack. Group by severity (blocking, degraded, question), suggest an owner for each, and flag anything from key accounts. Post the summary to the configured channel.",
    dependencies: ["google", "slack"],
    sampleOutput:
      "*Support digest*\n🔴 1 blocking: login failure (Acme — key account) → suggest: Dana\n🟡 2 degraded · ❓ 4 questions",
    triggerOptions: ["schedule", "manual"],
    defaultRoleSlug: "client-success-rep",
    requiredScopes: ["gmail.read", "slack.read", "slack.write"],
    defaultApprovalPolicy: {},
    successMetric: "Blocking issues surfaced within 1h of arrival",
  },
  {
    slug: "competitor-page-watch",
    category: "Marketing",
    name: "Competitor page watch summary",
    description:
      "Watch competitor pages and summarize meaningful changes weekly.",
    instructions:
      "For each competitor page listed in the knowledge base, compare current content against the last snapshot. Summarize meaningful changes (pricing, positioning, new features) and ignore cosmetic ones. Post the summary with links.",
    dependencies: ["slack"],
    sampleOutput:
      "*Competitor watch*\nNorthCo: new 'Teams' tier at $49 · BrightLabs: homepage repositioned to compliance · Others: no change",
    triggerOptions: ["schedule", "manual"],
    defaultRoleSlug: "marketing-ops-assistant",
    requiredScopes: ["slack.write"],
    defaultApprovalPolicy: {},
    successMetric: "Meaningful competitor changes reported within a week",
  },
  {
    slug: "weekly-social-post-drafts",
    category: "Marketing",
    name: "Weekly social post drafts",
    description:
      "A batch of on-brand social drafts from recent work and knowledge — for approval.",
    instructions:
      "Using the brand profile and recent completed work, draft 5 social posts for the configured platforms: a mix of insight, case-note, and announcement formats. Follow the brand tone; never use claims on the forbidden list. Queue the batch for approval — never publish.",
    dependencies: ["slack"],
    sampleOutput:
      "5 drafts: 2 LinkedIn insights, 1 client-win note (anonymized), 1 how-we-work post, 1 announcement. Queued for review.",
    triggerOptions: ["schedule", "manual"],
    defaultRoleSlug: "marketing-ops-assistant",
    requiredScopes: ["slack.write"],
    defaultApprovalPolicy: {},
    successMetric: "≥3 of 5 drafts approved weekly with light edits",
  },
  {
    slug: "webhook-task-intake",
    category: "Operations",
    name: "Webhook task intake",
    description:
      "Receive a task from any external system via signed webhook and route it to an agent.",
    instructions:
      "A JSON payload arrives via webhook. Read the 'task' field and complete it within your role and tool permissions. Summarize what you did (or drafted) to the run log.",
    dependencies: [],
    sampleOutput:
      "Webhook received: 'summarize yesterday's signups'. Summary produced and delivered to run log.",
    triggerOptions: ["webhook"],
    defaultRoleSlug: "executive-assistant",
    requiredScopes: [],
    defaultApprovalPolicy: {},
    successMetric: "External systems can hand work to agents reliably",
  },
];
