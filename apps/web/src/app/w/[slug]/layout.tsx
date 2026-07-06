import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { approvalRequests, notifications } from "@augmentic/db";
import { requireWorkspace } from "@/lib/context";
import { signOutAction } from "@/lib/actions/auth-actions";

const NAV = [
  { href: "", label: "Work Chart", icon: "◫" },
  { href: "/agents", label: "AI Employees", icon: "✦" },
  { href: "/workflows", label: "Workflows", icon: "⚙" },
  { href: "/approvals", label: "Approvals", icon: "✓" },
  { href: "/runs", label: "Runs", icon: "▸" },
  { href: "/notifications", label: "Notifications", icon: "◎" },
  { href: "/integrations", label: "Integrations", icon: "⌘" },
  { href: "/knowledge", label: "Knowledge", icon: "▤" },
  { href: "/brand", label: "Brand", icon: "◈" },
  { href: "/roi", label: "ROI", icon: "↗" },
  { href: "/usage", label: "Usage", icon: "◔" },
  { href: "/billing", label: "Billing", icon: "$" },
  { href: "/audit", label: "Audit", icon: "≡" },
  { href: "/team", label: "Team", icon: "☰" },
  { href: "/settings", label: "Settings", icon: "⚒" },
];

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const [pending, unread] = await Promise.all([
    ctx.db
      .select({ id: approvalRequests.id })
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.workspaceId, ctx.workspace.id),
          eq(approvalRequests.status, "pending"),
        ),
      ),
    ctx.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, ctx.workspace.id),
          eq(notifications.userId, ctx.user.id),
          isNull(notifications.readAt),
        ),
      ),
  ]);

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-4">
          <Link href="/workspaces" className="block">
            <p className="text-lg font-bold text-brand-700">Augmentic</p>
            <p className="truncate text-xs text-slate-500">{ctx.workspace.name}</p>
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={`/w/${slug}${item.href}`}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              <span className="flex items-center gap-2">
                <span className="w-4 text-center text-slate-400">{item.icon}</span>
                {item.label}
              </span>
              {item.label === "Approvals" && pending.length > 0 && (
                <span className="rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-800">
                  {pending.length}
                </span>
              )}
              {item.label === "Notifications" && unread.length > 0 && (
                <span className="rounded-full bg-brand-100 px-1.5 text-xs font-semibold text-brand-700">
                  {unread.length}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <p className="mb-2 truncate px-1 text-xs text-slate-500">
            {ctx.user.email} · {ctx.role}
          </p>
          <form action={signOutAction}>
            <button className="w-full rounded-lg px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-100">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
