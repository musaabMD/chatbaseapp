import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getAgentForWorkspace } from "@/lib/agents";
import { AgentSettingsForm } from "@/components/dashboard/agent-settings-form";

export default async function AgentSettingsPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const { workspace } = await requireWorkspace();
  const agent = await getAgentForWorkspace(agentId, workspace.id);
  if (!agent) notFound();

  return (
    <AgentSettingsForm
      agentId={agentId}
      initialName={agent.name}
      initialDescription={agent.description || ""}
      initialAudience={agent.audience || ""}
      initialLanguage={agent.language}
    />
  );
}
