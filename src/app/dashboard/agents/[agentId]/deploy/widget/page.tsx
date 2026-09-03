import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getAgentForWorkspace } from "@/lib/agents";
import { WidgetDeployClient, parseWidgetConfig } from "@/components/dashboard/widget-deploy-client";

export default async function WidgetDeployPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const { workspace } = await requireWorkspace();
  const agent = await getAgentForWorkspace(agentId, workspace.id);
  if (!agent) notFound();

  return (
    <WidgetDeployClient
      agentId={agentId}
      publicSlug={agent.public_slug || agent.slug}
      initialWidgetConfig={parseWidgetConfig(agent.widget_config)}
    />
  );
}
