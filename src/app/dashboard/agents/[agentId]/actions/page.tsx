import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getAgentForWorkspace } from "@/lib/agents";
import { ActionsManager } from "@/components/dashboard/actions-manager";

export default async function ActionsPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const { workspace } = await requireWorkspace();
  const agent = await getAgentForWorkspace(agentId, workspace.id);
  if (!agent) notFound();

  return <ActionsManager agentId={agentId} />;
}
