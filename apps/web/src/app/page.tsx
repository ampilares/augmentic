import Link from "next/link";
import { redirect } from "next/navigation";
import { PLANS, PLAN_IDS } from "@augmentic/shared";
import { getSessionUser } from "@/lib/auth";

// Public storefront. Signed-in users skip straight to their workspaces;
// everyone else gets the pitch. All copy and visuals are original (PRD §19).

const ROLES = [
  {
    icon: "✦",
    title: "Executive Assistant",
    pitch: "Triage the inbox, prep every meeting, and draft the follow-ups — before you ask.",
  },
  {
    icon: "↗",
    title: "Sales Ops Rep",
    pitch: "Log inbound leads, nudge stalled deals, and post a pipeline summary every Monday.",
  },
  {
    icon: "◈",
    title: "Client Success Rep",
    pitch: "Weekly status drafts per client, support triage, and kickoff packs for new accounts.",
  },
  {
    icon: "$",
    title: "Finance Admin",
    pitch: "Watch the books, chase overdue invoices with escalating drafts, collect receipts.",
  },
  {
    icon: "◆",
    title: "Marketing Ops Assistant",
    pitch: "On-brand social drafts from real work, plus a weekly competitor watch.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Hire from a role, not a prompt",
    body: "Pick a job — assistant, sales ops, finance — and get an AI employee with a job description, default workflows, and safety settings already filled in.",
  },
  {
    n: "2",
    title: "Connect the tools you already use",
    body: "Gmail, Calendar, Drive, Slack, monday.com, Xero — OAuth in, permissions scoped per agent, everything visible in one catalog.",
  },
  {
    n: "3",
    title: "Approve the work, keep the control",
    body: "Agents draft by default. Anything that leaves your workspace — an email, a post, a record change — waits in the Approval Center until a human says go.",
  },
];

const TRUST_POINTS = [
  {
    title: "Draft-first by default",
    body: "New AI employees can read and draft. They earn autonomy only when you grant it, one permission at a time.",
  },
  {
    title: "Approvals that wait for you",
    body: "A paused run resumes exactly where it stopped — minutes or days later — and sends exactly the payload you approved, edits included.",
  },
  {
    title: "An audit log for everything",
    body: "Every action, approval, and external send is recorded append-only and exportable. Set your own retention windows.",
  },
  {
    title: "Spend caps and run budgets",
    body: "Per-agent monthly caps hard-stop runaway work. Costs are tracked per run — you see dollars, never tokens.",
  },
];

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect("/workspaces");

  return (
    <main className="bg-white text-slate-900">
      {/* Nav ----------------------------------------------------------- */}
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <p className="text-lg font-bold text-brand-700">Augmentic</p>
          <nav className="hidden items-center gap-6 text-sm text-slate-600 md:flex">
            <a href="#how" className="hover:text-slate-900">How it works</a>
            <a href="#roles" className="hover:text-slate-900">Roles</a>
            <a href="#trust" className="hover:text-slate-900">Trust</a>
            <a href="#pricing" className="hover:text-slate-900">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero ---------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 pb-20 pt-16 text-center md:pt-24">
        <p className="mx-auto mb-4 w-fit rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
          The AI Workforce OS for small business
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
          Hire AI employees.
          <br />
          <span className="text-brand-600">Keep the final say.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
          Augmentic staffs your business with AI employees that work inside the tools you
          already use — and route every risky action to you for approval. Repetitive work
          gets done; nothing leaves your workspace without a human yes.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            className="w-full rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white hover:bg-brand-700 sm:w-auto"
          >
            Hire your first AI employee
          </Link>
          <a
            href="#how"
            className="w-full rounded-lg border border-slate-200 px-6 py-3 text-base font-medium text-slate-700 hover:bg-slate-50 sm:w-auto"
          >
            See how it works
          </a>
        </div>
        <p className="mt-4 text-sm text-slate-400">
          14-day Growth trial · draft-first by default · no card required
        </p>

        {/* Original mini Work Chart visual */}
        <div className="mx-auto mt-14 max-w-3xl rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
          <p className="mb-4 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
            Your Work Chart — who does what, and what needs your approval
          </p>
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold shadow-sm">
              You
            </div>
            <div className="h-4 w-px bg-slate-300" />
            <div className="grid w-full gap-3 sm:grid-cols-3">
              {[
                { name: "Emmy", role: "Executive Assistant", status: "3 drafts ready" },
                { name: "Sawyer", role: "Sales Ops Rep", status: "1 approval waiting" },
                { name: "Frankie", role: "Finance Admin", status: "2 invoices chased" },
              ].map((a) => (
                <div key={a.name} className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm">
                  <p className="text-sm font-semibold">{a.name}</p>
                  <p className="text-xs text-slate-500">{a.role}</p>
                  <p className="mt-2 w-fit rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                    {a.status}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Tools strip ---------------------------------------------------- */}
      <section className="border-y border-slate-100 bg-slate-50 py-8">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Works inside the tools your team already lives in
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-medium text-slate-500">
            <span>Gmail</span>
            <span>Google Calendar</span>
            <span>Google Drive</span>
            <span>Slack</span>
            <span>monday.com</span>
            <span>Xero</span>
            <span>Webhooks</span>
            <span>MCP servers</span>
          </div>
        </div>
      </section>

      {/* How it works --------------------------------------------------- */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-center text-3xl font-bold">Up and running in an afternoon</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-slate-200 p-6">
              <p className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                {s.n}
              </p>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Roles ---------------------------------------------------------- */}
      <section id="roles" className="border-y border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold">Roles, ready to hire</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">
            Every role ships with a job description, starter workflows, and safe defaults.
            Agencies: install a whole ops team in one click.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ROLES.map((r) => (
              <div key={r.title} className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-xl text-brand-600">{r.icon}</p>
                <h3 className="mt-2 font-semibold">{r.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{r.pitch}</p>
              </div>
            ))}
            <div className="rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/50 p-5">
              <p className="text-xl text-brand-600">⚡</p>
              <h3 className="mt-2 font-semibold">Agency Ops team</h3>
              <p className="mt-1 text-sm text-slate-600">
                Assistant + Sales Ops + Finance Admin with five scheduled workflows and
                agency SOPs — installed together, activated when you're ready.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust ---------------------------------------------------------- */}
      <section id="trust" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-center text-3xl font-bold">Trust before autonomy</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">
          The reason this works for real businesses: the model never has the last word.
          A deterministic policy engine decides what runs, what waits, and what's denied.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {TRUST_POINTS.map((t) => (
            <div key={t.title} className="flex gap-4 rounded-2xl border border-slate-200 p-6">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm text-emerald-700">
                ✓
              </span>
              <div>
                <h3 className="font-semibold">{t.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{t.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing -------------------------------------------------------- */}
      <section id="pricing" className="border-t border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold">Simple pricing, no token math</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">
            Plans map to AI employees plus usage. Every new workspace starts with a
            14-day Growth trial.
          </p>
          <div className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-3">
            {PLAN_IDS.map((pid) => {
              const p = PLANS[pid];
              const highlight = pid === "growth";
              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border bg-white p-6 ${highlight ? "border-brand-500 shadow-md" : "border-slate-200"}`}
                >
                  {highlight && (
                    <p className="mb-2 w-fit rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                      Most popular
                    </p>
                  )}
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="mt-2 text-3xl font-bold">
                    ${(p.priceCentsMonthly / 100).toFixed(0)}
                    <span className="text-base font-normal text-slate-400">/mo</span>
                  </p>
                  <p className="mt-3 text-sm text-slate-600">{p.blurb}</p>
                  <p className="mt-3 text-xs text-slate-400">
                    {p.agentLimit} AI employee{p.agentLimit === 1 ? "" : "s"} ·{" "}
                    {p.monthlyRunLimit.toLocaleString()} runs/mo
                  </p>
                  <Link
                    href="/sign-up"
                    className={`mt-5 block rounded-lg px-4 py-2 text-center text-sm font-semibold ${
                      highlight
                        ? "bg-brand-600 text-white hover:bg-brand-700"
                        : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Start free trial
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA + footer --------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h2 className="text-3xl font-bold">Put repetitive work on someone else's desk</h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">
          Hire an AI employee, connect two tools, and watch the first drafts land —
          with you holding the approve button the whole time.
        </p>
        <Link
          href="/sign-up"
          className="mt-8 inline-block rounded-lg bg-brand-600 px-8 py-3 text-base font-semibold text-white hover:bg-brand-700"
        >
          Get started free
        </Link>
      </section>
      <footer className="border-t border-slate-100 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-slate-400 sm:flex-row">
          <p>© {new Date().getFullYear()} Augmentic — The AI Workforce OS</p>
          <div className="flex gap-5">
            <a href="#trust" className="hover:text-slate-600">Security</a>
            <a href="#pricing" className="hover:text-slate-600">Pricing</a>
            <Link href="/sign-in" className="hover:text-slate-600">Sign in</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
