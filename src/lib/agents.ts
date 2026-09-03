import { getDb } from "@/lib/cloudflare";

export type AgentRecord = {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  public_slug: string | null;
  description: string | null;
  use_case: string;
  status: string;
  language: string;
  audience: string | null;
  avatar_url: string | null;
  instructions: string | null;
  brand_voice?: string | null;
  tone: string;
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
  last_trained_at: string | null;
  published_version_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function getAgentForWorkspace(agentId: string, workspaceId: string) {
  const db = await getDb();
  return db
    .prepare(`SELECT * FROM agents WHERE id = ? AND workspace_id = ?`)
    .bind(agentId, workspaceId)
    .first<AgentRecord>();
}

export async function getAgentByPublicSlug(publicSlug: string) {
  const db = await getDb();
  return db
    .prepare(`SELECT * FROM agents WHERE public_slug = ? AND status = 'active'`)
    .bind(publicSlug)
    .first<AgentRecord>();
}
