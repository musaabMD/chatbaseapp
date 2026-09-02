import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getAgentForWorkspace } from "@/lib/agents";
import { ModelSettingsForm } from "@/components/dashboard/model-settings-form";

export default async function ModelSettingsPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const { workspace } = await requireWorkspace();
  const agent = await getAgentForWorkspace(agentId, workspace.id);
  if (!agent) notFound();

  return (
    <ModelSettingsForm
      agentId={agentId}
      initialModelId={agent.model_id}
      initialFallback={agent.fallback_model_id || ""}
      initialTemperature={agent.temperature}
      initialMaxTokens={agent.max_tokens}
      initialShowCitations={agent.show_citations === 1}
    />
  );
}
