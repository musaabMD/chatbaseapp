import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getAgentForWorkspace } from "@/lib/agents";
import { GuardrailsEditor, type GuardrailsConfig } from "@/components/dashboard/guardrails-editor";
import { safeJsonParse } from "@/lib/utils";

const DEFAULT_GUARDRAILS: GuardrailsConfig = {
  blockedTopics: ["illegal activity", "explicit content"],
  maxResponseLength: 2000,
  requireCitations: true,
  piiFilter: true,
  blockExternalLinks: false,
  escalationKeywords: ["speak to a human", "complaint", "refund"],
};

export default async function GuardrailsPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const { workspace } = await requireWorkspace();
  const agent = await getAgentForWorkspace(agentId, workspace.id);
  if (!agent) notFound();

  const guardrails = safeJsonParse<GuardrailsConfig>(agent.guardrails, DEFAULT_GUARDRAILS);

  return <GuardrailsEditor agentId={agentId} initialGuardrails={guardrails} />;
}
