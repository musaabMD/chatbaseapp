import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getAgentForWorkspace } from "@/lib/agents";
import { PlaygroundClient } from "@/components/dashboard/playground-client";

export default async function PlaygroundPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const { workspace } = await requireWorkspace();
  const agent = await getAgentForWorkspace(agentId, workspace.id);
  if (!agent) notFound();

  return (
    <PlaygroundClient
      agentId={agentId}
      useCase={agent.use_case}
      modelId={agent.model_id}
      knowledgeMode={agent.knowledge_mode}
      temperature={agent.temperature}
    />
  );
}
