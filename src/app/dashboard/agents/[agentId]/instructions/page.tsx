import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getAgentForWorkspace } from "@/lib/agents";
import { InstructionsEditor } from "@/components/dashboard/instructions-editor";

export default async function InstructionsPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const { workspace } = await requireWorkspace();
  const agent = await getAgentForWorkspace(agentId, workspace.id);
  if (!agent) notFound();

  return (
    <InstructionsEditor
      agentId={agentId}
      initialInstructions={agent.instructions || ""}
      initialTone={agent.tone}
      initialKnowledgeMode={agent.knowledge_mode}
    />
  );
}
