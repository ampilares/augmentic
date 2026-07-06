import Link from "next/link";
import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${styles} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  }[variant];
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${styles}`}
    >
      {children}
    </Link>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${props.className ?? ""}`}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none ${props.className ?? ""}`}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
      {children}
    </label>
  );
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  ready: "bg-emerald-100 text-emerald-800",
  succeeded: "bg-emerald-100 text-emerald-800",
  connected: "bg-emerald-100 text-emerald-800",
  approved: "bg-emerald-100 text-emerald-800",
  executed: "bg-emerald-100 text-emerald-800",
  running: "bg-blue-100 text-blue-800",
  queued: "bg-slate-100 text-slate-700",
  draft: "bg-slate-100 text-slate-700",
  pending: "bg-amber-100 text-amber-800",
  waiting_approval: "bg-amber-100 text-amber-800",
  needs_setup: "bg-amber-100 text-amber-800",
  paused: "bg-slate-200 text-slate-700",
  blocked: "bg-red-100 text-red-800",
  failed: "bg-red-100 text-red-800",
  error: "bg-red-100 text-red-800",
  rejected: "bg-red-100 text-red-800",
  denied: "bg-red-100 text-red-800",
  cancelled: "bg-slate-200 text-slate-600",
  edited: "bg-emerald-100 text-emerald-800",
  revision_requested: "bg-amber-100 text-amber-800",
  simulation: "bg-purple-100 text-purple-800",
  chat: "bg-blue-50 text-blue-700",
  live: "bg-emerald-50 text-emerald-700",
};

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

const RISK_COLORS: Record<string, string> = {
  read: "bg-emerald-50 text-emerald-700 border-emerald-200",
  draft: "bg-sky-50 text-sky-700 border-sky-200",
  internal_write: "bg-amber-50 text-amber-700 border-amber-200",
  external_send: "bg-orange-50 text-orange-700 border-orange-200",
  publish: "bg-orange-50 text-orange-700 border-orange-200",
  delete: "bg-red-50 text-red-700 border-red-200",
  spend: "bg-red-50 text-red-700 border-red-200",
  admin: "bg-red-50 text-red-700 border-red-200",
};

export function RiskBadge({ tier }: { tier: string }) {
  const color = RISK_COLORS[tier] ?? "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-medium ${color}`}>
      {tier.replaceAll("_", " ")}
    </span>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
