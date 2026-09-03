import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getAgentForWorkspace } from "@/lib/agents";
import { GuardrailsEditor } from "@/components/dashboard/guardrails-editor";
import { parseGuardrails } from "@/lib/agent/guardrails";

export default async function GuardrailsPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const { workspace } = await requireWorkspace();
  const agent = await getAgentForWorkspace(agentId, workspace.id);
  if (!agent) notFound();

  const rules = parseGuardrails(agent.guardrails);

  return <GuardrailsEditor agentId={agentId} initialGuardrails={rules} />;
}
