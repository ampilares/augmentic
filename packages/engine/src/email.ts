// Email delivery for notifications (FR-021). Same posture as the LLM and
// OAuth layers: fully functional when env credentials are present, silent
// no-op otherwise — in-app notification rows remain the source of truth.
//
// Transport is a Resend-compatible HTTP API (https://resend.com) selected by
// RESEND_API_KEY; EMAIL_FROM sets the sender. No SDK dependency — plain fetch,
// matching the LLM runtime pattern.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  href?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function appUrl(path: string): string {
  const base = (process.env.AUGMENTIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return `${base}${path}`;
}

export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  const html = renderEmailHtml(message);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.href ? `${message.text}\n\n${message.href}` : message.text,
        html,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    // Email is best-effort, like Slack fan-out.
    return false;
  }
}

// Minimal, mobile-first HTML: one column, large tap target for the action
// link (plan 3.4: phone approvals should be one tap from the email).
function renderEmailHtml(message: EmailMessage): string {
  const button = message.href
    ? `<p style="margin:24px 0"><a href="${message.href}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Open in Augmentic</a></p>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
  <p style="font-size:13px;color:#64748b;margin:0 0 16px">Augmentic</p>
  <h2 style="font-size:18px;margin:0 0 8px">${escapeHtml(message.subject)}</h2>
  <p style="font-size:14px;line-height:1.6;color:#334155;white-space:pre-line">${escapeHtml(message.text)}</p>
  ${button}
  <p style="font-size:12px;color:#94a3b8;margin-top:32px">You receive these because of your notification preferences in your Augmentic workspace.</p>
</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
