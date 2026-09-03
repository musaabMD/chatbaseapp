import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getAgentForWorkspace } from "@/lib/agents";
import { BrandingSettingsForm, parseBranding } from "@/components/dashboard/branding-settings-form";

export default async function BrandingSettingsPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const { workspace } = await requireWorkspace();
  const agent = await getAgentForWorkspace(agentId, workspace.id);
  if (!agent) notFound();

  return (
    <BrandingSettingsForm
      agentId={agentId}
      initialBranding={parseBranding(agent.branding)}
      initialAvatarUrl={agent.avatar_url || ""}
    />
  );
}
