"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AgentNav({ agentId }: { agentId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/agents/${agentId}`;
  const groups = [
    {
      title: "Build",
      items: [
        { href: base, label: "Overview" },
        { href: `${base}/playground`, label: "Playground" },
        { href: `${base}/instructions`, label: "Instructions" },
        { href: `${base}/sources`, label: "Knowledge" },
        { href: `${base}/actions`, label: "Actions" },
        { href: `${base}/procedures`, label: "Procedures" },
        { href: `${base}/guardrails`, label: "Guardrails" },
        { href: `${base}/tests`, label: "Test suites" },
      ],
    },
    {
      title: "Deploy",
      items: [
        { href: `${base}/deploy/widget`, label: "Website widget" },
        { href: `${base}/deploy/page`, label: "Assistant page" },
        { href: `${base}/deploy/channels`, label: "Channels" },
        { href: `${base}/deploy/api`, label: "API" },
      ],
    },
    {
      title: "Activity",
      items: [
        { href: `${base}/conversations`, label: "Conversations" },
        { href: `${base}/analytics`, label: "Analytics" },
        { href: `${base}/escalations`, label: "Escalations" },
      ],
    },
    {
      title: "Settings",
      items: [
        { href: `${base}/settings`, label: "General" },
        { href: `${base}/settings/model`, label: "Model" },
        { href: `${base}/settings/branding`, label: "Branding" },
        { href: `${base}/settings/security`, label: "Security" },
      ],
    },
  ];

  return (
    <div className="w-56 shrink-0 space-y-5 border-r border-[var(--border)] bg-white/40 p-4">
      {groups.map((group) => (
        <div key={group.title}>
          <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            {group.title}
          </div>
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block rounded-lg px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-[var(--secondary)] font-medium text-[var(--foreground)]"
                      : "text-[var(--foreground)]/75 hover:bg-white/80",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
