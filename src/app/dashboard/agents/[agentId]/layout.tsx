import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getAgentForWorkspace } from "@/lib/agents";
import { AgentNav } from "@/components/dashboard/agent-nav";
import { Badge } from "@/components/ui/card";

export default async function AgentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const { workspace } = await requireWorkspace();
  const agent = await getAgentForWorkspace(agentId, workspace.id);
  if (!agent) notFound();

  return (
    <div className="flex min-h-0 flex-1">
      <AgentNav agentId={agentId} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[var(--border)] bg-white/50 px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
              {agent.name}
            </h1>
            <Badge
              className={
                agent.status === "active" ? "bg-[var(--primary)] text-white" : undefined
              }
            >
              {agent.status}
            </Badge>
            <span className="text-sm text-[var(--muted)]">{agent.use_case.replace(/_/g, " ")}</span>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
