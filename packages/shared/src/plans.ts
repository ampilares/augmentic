// Plan packaging (PRD §16): AI employees + usage. Limits are enforced
// server-side — hiring checks agentLimit, run preflight checks
// monthlyRunLimit. Over-limit behavior is graceful: new work pauses, nothing
// is lost (PRD §11 / Plan 2.5).

export interface PlanDef {
  id: string;
  name: string;
  blurb: string;
  agentLimit: number;
  monthlyRunLimit: number;
  priceMonthlyUsd: number;
}

export const PLAN_DEFS: PlanDef[] = [
  {
    id: "starter",
    name: "Starter",
    blurb: "1 AI employee, core integrations, limited runs, approval center.",
    agentLimit: 1,
    monthlyRunLimit: 100,
    priceMonthlyUsd: 49,
  },
  {
    id: "growth",
    name: "Growth",
    blurb: "Up to 5 AI employees, workflows, schedules, usage dashboard, team roles.",
    agentLimit: 5,
    monthlyRunLimit: 1000,
    priceMonthlyUsd: 199,
  },
  {
    id: "pro",
    name: "Pro",
    blurb: "Up to 15 agents, higher limits, custom workflows, vertical packs, priority support.",
    agentLimit: 15,
    monthlyRunLimit: 10000,
    priceMonthlyUsd: 499,
  },
];

export const DEFAULT_PLAN_ID = "starter";

export function planById(id: string | undefined | null): PlanDef {
  return PLAN_DEFS.find((p) => p.id === id) ?? PLAN_DEFS[0]!;
}
