// Plan catalog (PRD §16): simple packaging that maps to AI employees plus
// usage — never tokens. Limits are enforced at hire time (agent count) and
// run-enqueue time (monthly live runs); over-limit runs are parked as
// `blocked`, never dropped.

export const PLAN_IDS = ["starter", "growth", "pro"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface PlanDef {
  id: PlanId;
  name: string;
  blurb: string;
  agentLimit: number;
  monthlyRunLimit: number;
  priceCentsMonthly: number;
}

export const PLANS: Record<PlanId, PlanDef> = {
  starter: {
    id: "starter",
    name: "Starter",
    blurb: "1 AI employee, core integrations, limited runs, approval center.",
    agentLimit: 1,
    monthlyRunLimit: 200,
    priceCentsMonthly: 4900,
  },
  growth: {
    id: "growth",
    name: "Growth",
    blurb: "Up to 5 AI employees, workflows, schedules, usage dashboard, team roles.",
    agentLimit: 5,
    monthlyRunLimit: 1500,
    priceCentsMonthly: 19900,
  },
  pro: {
    id: "pro",
    name: "Pro",
    blurb: "More agents, higher limits, custom workflows, vertical packs, priority support.",
    agentLimit: 15,
    monthlyRunLimit: 6000,
    priceCentsMonthly: 49900,
  },
};

export function planFromSettings(settings: unknown): PlanDef {
  const s = settings as { plan?: string; trialEndsAt?: string } | null;
  if (s?.plan && (PLAN_IDS as readonly string[]).includes(s.plan)) {
    return PLANS[s.plan as PlanId];
  }
  // New workspaces get Growth limits for the trial window so the onboarding
  // pack (3 agents) and proposals fit; after it lapses they fall to Starter.
  if (s?.trialEndsAt && Date.parse(s.trialEndsAt) > Date.now()) {
    return PLANS.growth;
  }
  return PLANS.starter;
}

export function trialEndsAt(settings: unknown): Date | null {
  const s = settings as { plan?: string; trialEndsAt?: string } | null;
  if (s?.plan || !s?.trialEndsAt) return null;
  const ts = Date.parse(s.trialEndsAt);
  return ts > Date.now() ? new Date(ts) : null;
}
