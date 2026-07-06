// Built-in skill library (Cyndra pattern: skills are know-how; apps are
// permissions; workflows are recurring execution). Agent templates reference
// these slugs in defaultSkills. All content is original.

export interface SkillSeed {
  slug: string;
  name: string;
  description: string;
  instructions: string;
  allowedTools: string[];
}

export const SKILL_SEEDS: SkillSeed[] = [
  {
    slug: "inbox-triage",
    name: "Inbox triage",
    description: "Sort email by urgency and business impact, never by arrival order.",
    instructions:
      "When triaging email: (1) Urgent = existing client + (money, deadline, or blocker); anything mentioning invoices, contracts, or cancellation is urgent by default. " +
      "(2) Needs reply = a direct question or request addressed to us with no deadline pressure. " +
      "(3) FYI = updates and threads where we're cc'd. (4) Noise = newsletters, cold outreach, notifications. " +
      "Never mark a message urgent just because the sender says it is — verify the sender relationship from evidence. Summaries name the sender, the ask, and one recommended next action of 10 words or less.",
    allowedTools: ["gmail.search_messages", "gmail.get_message"],
  },
  {
    slug: "meeting-prep",
    name: "Meeting prep",
    description: "Assemble context so nobody walks into a meeting cold.",
    instructions:
      "A prep brief has exactly four sections: Attendees (who + role), Context (last 2-3 relevant exchanges, cited), Open items (unresolved asks with owner), and Talking points (max 3, each actionable). " +
      "Pull context from email threads with the attendees and any project notes. If you can't find context, say so plainly — never invent history.",
    allowedTools: ["gcal.list_events", "gmail.search_messages", "gdrive.search_files"],
  },
  {
    slug: "follow-up-drafting",
    name: "Follow-up drafting",
    description: "Short, specific follow-ups that reference the last real exchange.",
    instructions:
      "Follow-up drafts are 5 sentences or fewer. Open by referencing the specific last exchange (date + topic), state the one thing we need, propose a concrete next step with two time options, and close warmly per brand tone. " +
      "Never guilt-trip ('just bumping this'), never stack multiple asks in one draft.",
    allowedTools: ["gmail.create_draft"],
  },
  {
    slug: "lead-follow-up",
    name: "Lead follow-up",
    description: "Same-day, low-pressure responses to inbound interest.",
    instructions:
      "For each new lead: acknowledge their specific ask (quote their words where natural), answer the one question you can answer confidently from the brand profile, and offer a 15-minute call with two concrete slots. " +
      "Never quote prices unless the brand profile's pricing notes explicitly allow it. Flag leads that mention a competitor for human attention.",
    allowedTools: ["gmail.search_messages", "gmail.create_draft", "monday.get_items"],
  },
  {
    slug: "pipeline-reporting",
    name: "Pipeline reporting",
    description: "Weekly pipeline summaries that surface risk, not just totals.",
    instructions:
      "A pipeline summary groups deals into: Advanced (state what changed), Stalled (days quiet + last touch), New, and At risk (why). " +
      "Every claim cites the board item or email thread it came from. End with the single most important action for the week. Numbers come from records, never estimated.",
    allowedTools: ["monday.list_boards", "monday.get_items", "gmail.search_messages"],
  },
  {
    slug: "crm-hygiene",
    name: "CRM hygiene",
    description: "Spot missing fields, duplicates, and stage drift — propose, never apply.",
    instructions:
      "Compare recent email activity against board items. Flag: contacts with threads but no board item, items with no activity 14+ days still marked active, missing owner/value fields, and likely duplicates (same domain, similar name). " +
      "Output is a checklist a human applies; you propose updates via monday tools only when explicitly asked, and they go to approval.",
    allowedTools: ["monday.list_boards", "monday.get_items", "monday.update_item", "gmail.search_messages"],
  },
  {
    slug: "client-reporting",
    name: "Client reporting",
    description: "Weekly client status updates assembled from real activity.",
    instructions:
      "Status updates have four sections: Done (shipped this week), In progress (with % or stage), Blocked (what + who we're waiting on + since when), Next (what the client should expect). " +
      "Only include facts you can cite from Slack, email, or docs. Write for the client's eyes: no internal jargon, no teammate blame, brand tone throughout.",
    allowedTools: ["slack.read_channel", "gmail.search_messages", "gdrive.search_files", "gmail.create_draft"],
  },
  {
    slug: "action-item-tracking",
    name: "Action-item tracking",
    description: "Track promises made to clients and chase them before they're late.",
    instructions:
      "An action item = a commitment with an owner and an implied date, extracted from email or Slack. Track: what was promised, to whom, by whom, and when. " +
      "Draft a reminder when an item is within 24h of due or overdue. Reminders go to the internal owner first — never to the client without approval.",
    allowedTools: ["gmail.search_messages", "slack.read_channel", "slack.post_message"],
  },
  {
    slug: "invoice-chasing",
    name: "Invoice chasing",
    description: "Escalating payment reminders with exact figures from source records.",
    instructions:
      "Reminder ladder: 3+ days overdue = friendly nudge assuming oversight; 14+ days = firm, restate terms, ask for a payment date; 30+ days = final notice, mention next steps per escalation rules. " +
      "Every reminder includes invoice number, exact amount, currency, and due date pulled from Xero or the tracker — never from memory. One invoice per email. All sends require approval.",
    allowedTools: ["xero.list_invoices", "xero.get_contact", "gmail.create_draft", "xero.create_invoice_reminder_note"],
  },
  {
    slug: "cashflow-reporting",
    name: "Cashflow reporting",
    description: "Weekly cash snapshots: expected in, overdue, and anomalies.",
    instructions:
      "A cash snapshot has three lines of headline (expected inflows next 30 days, total overdue, biggest single risk) followed by a table of open invoices sorted by overdue days. " +
      "Flag anomalies: invoices >30 days overdue, clients with 2+ open invoices, unusual amounts. Figures come from Xero records with the invoice number cited.",
    allowedTools: ["xero.list_invoices", "xero.get_contact"],
  },
  {
    slug: "social-drafting",
    name: "Social drafting",
    description: "On-brand post drafts in varied formats — never published directly.",
    instructions:
      "Each batch mixes formats: insight (a lesson from recent work), proof (anonymized client win), process (how we work), and announcement. " +
      "Voice comes from the brand profile; claims only from approved facts. No emojis unless brand tone allows. Hooks are specific ('We cut onboarding from 3 weeks to 4 days') never generic ('Excited to share…'). Everything queues for approval.",
    allowedTools: ["gdrive.search_files", "knowledge.search"],
  },
  {
    slug: "competitor-watch",
    name: "Competitor watch",
    description: "Track competitor changes that matter; ignore cosmetics.",
    instructions:
      "Meaningful changes: pricing, packaging, positioning statements, new features/services, and case studies in our niche. Cosmetic changes (design refreshes, blog cadence) are ignored unless they signal repositioning. " +
      "Report as: competitor → what changed → why it matters to us in one sentence. Never recommend disparaging a competitor.",
    allowedTools: ["knowledge.search"],
  },
  {
    slug: "content-repurposing",
    name: "Content repurposing",
    description: "Turn long-form work into short formats without diluting the point.",
    instructions:
      "From a source document, extract: the single strongest claim, 2-3 supporting facts, and one example. Produce drafts sized for the target format. " +
      "Preserve the original's meaning exactly — tightening is fine, reinterpreting is not. Cite the source doc so reviewers can verify.",
    allowedTools: ["gdrive.search_files", "gdrive.read_file", "knowledge.search"],
  },
];
