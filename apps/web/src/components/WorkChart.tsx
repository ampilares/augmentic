"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { StatusBadge } from "./ui";

export interface ChartAgent {
  id: string;
  name: string;
  roleTitle: string;
  status: string;
  supervisorName: string | null;
  apps: string[];
  workflowNames: string[];
  pendingApprovals: number;
  spentCents: number;
  capCents: number | null;
  autonomyMode: string;
}

export interface ChartWorkflow {
  id: string;
  name: string;
  status: string;
  agentId: string;
  triggerType: string;
  deliveryTarget: string;
}

export interface ChartTool {
  provider: string;
  label: string;
  health: string;
  isDemo: boolean;
  agentIds: string[];
}

export interface ChartData {
  slug: string;
  humans: { id: string; name: string; role: string; agentIds: string[] }[];
  agents: ChartAgent[];
  workflows: ChartWorkflow[];
  tools: ChartTool[];
  pendingApprovalsByAgent: Record<string, number>;
}

interface EdgeSpec {
  from: string;
  to: string;
  color: string;
}

export function WorkChart({ data }: { data: ChartData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<{ d: string; color: string }[]>([]);

  const edges: EdgeSpec[] = [
    ...data.humans.flatMap((h) =>
      h.agentIds.map((a) => ({ from: `h-${h.id}`, to: `a-${a}`, color: "#94a3b8" })),
    ),
    ...data.workflows.map((w) => ({
      from: `a-${w.agentId}`,
      to: `w-${w.id}`,
      color: "#4f6ef7",
    })),
    ...data.tools.flatMap((t) =>
      t.agentIds.map((a) => ({ from: `a-${a}`, to: `t-${t.provider}`, color: "#10b981" })),
    ),
  ];

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const compute = () => {
      const cRect = container.getBoundingClientRect();
      const next: { d: string; color: string }[] = [];
      for (const edge of edges) {
        const fromEl = container.querySelector(`[data-node="${edge.from}"]`);
        const toEl = container.querySelector(`[data-node="${edge.to}"]`);
        if (!fromEl || !toEl) continue;
        const f = fromEl.getBoundingClientRect();
        const t = toEl.getBoundingClientRect();
        const leftFirst = f.left <= t.left;
        const x1 = (leftFirst ? f.right : f.left) - cRect.left;
        const y1 = f.top + f.height / 2 - cRect.top;
        const x2 = (leftFirst ? t.left : t.right) - cRect.left;
        const y2 = t.top + t.height / 2 - cRect.top;
        const mx = (x1 + x2) / 2;
        next.push({
          d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
          color: edge.color,
        });
      }
      setPaths(next);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(edges)]);

  return (
    <div ref={containerRef} className="relative">
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        {paths.map((p, i) => (
          <path key={i} d={p.d} stroke={p.color} strokeWidth="1.5" fill="none" opacity="0.45" />
        ))}
      </svg>
      <div className="relative grid grid-cols-4 gap-10">
        <ChartColumn title="People">
          {data.humans.map((h) => (
            <div
              key={h.id}
              data-node={`h-${h.id}`}
              className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
            >
              <p className="text-sm font-medium text-slate-900">{h.name}</p>
              <p className="text-xs text-slate-500">{h.role}</p>
              <p className="mt-1 text-xs text-slate-400">
                supervises {h.agentIds.length} AI employee{h.agentIds.length === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </ChartColumn>

        <ChartColumn title="AI Employees">
          {data.agents.map((a) => (
            <Link
              key={a.id}
              href={`/w/${data.slug}/agents/${a.id}`}
              data-node={`a-${a.id}`}
              className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-brand-500"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-slate-900">{a.name}</p>
                <StatusBadge status={a.status} />
              </div>
              <p className="text-xs text-slate-500">{a.roleTitle}</p>
              <div className="mt-2 space-y-0.5 text-[11px] text-slate-400">
                {a.apps.length > 0 && <p>apps: {a.apps.join(", ")}</p>}
                <p>
                  {a.workflowNames.length} workflow{a.workflowNames.length === 1 ? "" : "s"} ·{" "}
                  {a.autonomyMode.replaceAll("_", " ")}
                </p>
                {a.capCents !== null && (
                  <p>
                    spend ${(a.spentCents / 100).toFixed(2)} / ${(a.capCents / 100).toFixed(0)}
                  </p>
                )}
                {a.pendingApprovals > 0 && (
                  <p className="font-medium text-amber-600">
                    {a.pendingApprovals} pending approval{a.pendingApprovals === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </ChartColumn>

        <ChartColumn title="Workflows">
          {data.workflows.map((w) => (
            <Link
              key={w.id}
              href={`/w/${data.slug}/workflows/${w.id}`}
              data-node={`w-${w.id}`}
              className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-brand-500"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-slate-900">{w.name}</p>
                <StatusBadge status={w.status} />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                trigger: {w.triggerType} → {w.deliveryTarget.replaceAll("_", " ")}
              </p>
            </Link>
          ))}
        </ChartColumn>

        <ChartColumn title="Tools">
          {data.tools.map((t) => (
            <Link
              key={t.provider}
              href={`/w/${data.slug}/integrations`}
              data-node={`t-${t.provider}`}
              className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-brand-500"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-900">{t.label}</p>
                <StatusBadge status={t.health} />
              </div>
              {t.isDemo && <p className="mt-1 text-[11px] text-purple-600">demo account</p>}
            </Link>
          ))}
        </ChartColumn>
      </div>
    </div>
  );
}

function ChartColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
