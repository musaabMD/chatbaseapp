"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  CreditCard,
  Home,
  Inbox,
  KeyRound,
  LineChart,
  Plug,
  Settings,
  Users,
  Gauge,
  Headset,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/agents", label: "Agents", icon: Bot },
  { href: "/dashboard/inbox", label: "Inbox", icon: Inbox },
  { href: "/dashboard/contacts", label: "Contacts", icon: Users },
  { href: "/dashboard/analytics", label: "Analytics", icon: LineChart },
  { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
  { href: "/dashboard/api", label: "API", icon: KeyRound },
  { href: "/dashboard/usage", label: "Usage", icon: Gauge },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings", label: "Workspace", icon: Settings },
];

export function Sidebar({ workspaceName }: { workspaceName?: string }) {
  const pathname = usePathname();
  return (
    <aside className="flex h-full w-64 flex-col border-r border-[var(--border)] bg-[var(--sidebar)]/90 backdrop-blur">
      <div className="border-b border-[var(--border)] px-5 py-5">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)] text-white">
            <Headset className="h-5 w-5" />
          </div>
          <div>
            <div className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight">
              Campusly
            </div>
            <div className="text-xs text-[var(--muted)]">{workspaceName || "Workspace"}</div>
          </div>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-[var(--primary)] text-white shadow-sm"
                  : "text-[var(--foreground)]/80 hover:bg-white/70",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[var(--border)] p-4 text-xs text-[var(--muted)]">
          <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5" />
          AI customer agent platform
        </div>
      </div>
    </aside>
  );
}
