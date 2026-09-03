import { getDb } from "@/lib/cloudflare";
import { createId, nowIso } from "@/lib/utils";

export type AgentSnapshot = {
  instructions: string | null;
  model_provider: string;
  model_id: string;
  fallback_model_id: string | null;
  temperature: number;
  max_tokens: number;
  knowledge_mode: string;
  show_citations: number;
  guardrails: string | null;
  branding: string | null;
  widget_config: string | null;
  use_case: string;
};

export async function publishAgentVersion(input: {
  agentId: string;
  label?: string;
  createdBy?: string;
}) {
  const db = await getDb();
  const agent = await db
    .prepare(`SELECT * FROM agents WHERE id = ?`)
    .bind(input.agentId)
    .first<AgentSnapshot & { id: string; published_version_id: string | null }>();

  if (!agent) throw new Error("Agent not found");

  const latest = await db
    .prepare(`SELECT MAX(version) as v FROM agent_versions WHERE agent_id = ?`)
    .bind(input.agentId)
    .first<{ v: number | null }>();

  const version = (latest?.v || 0) + 1;
  const id = createId("aver");
  const snapshot: AgentSnapshot = {
    instructions: agent.instructions,
    model_provider: agent.model_provider,
    model_id: agent.model_id,
    fallback_model_id: agent.fallback_model_id,
    temperature: agent.temperature,
    max_tokens: agent.max_tokens,
    knowledge_mode: agent.knowledge_mode,
    show_citations: agent.show_citations,
    guardrails: agent.guardrails,
    branding: agent.branding,
    widget_config: agent.widget_config,
    use_case: agent.use_case,
  };

  await db
    .prepare(
      `INSERT INTO agent_versions (id, agent_id, version, label, status, snapshot, created_by, created_at)
       VALUES (?, ?, ?, ?, 'published', ?, ?, ?)`,
    )
    .bind(
      id,
      input.agentId,
      version,
      input.label || `v${version}`,
      JSON.stringify(snapshot),
      input.createdBy || null,
      nowIso(),
    )
    .run();

  await db
    .prepare(
      `UPDATE agents SET published_version_id = ?, status = 'active', updated_at = ? WHERE id = ?`,
    )
    .bind(id, nowIso(), input.agentId)
    .run();

  return { id, version };
}
