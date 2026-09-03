import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { listBackstageSuggestions } from "@/lib/agent/backstage";
import { BackstageClient } from "@/components/dashboard/backstage-client";

export default async function BackstagePage() {
  const { workspace } = await requireWorkspace();
  const db = await getDb();
  const agents = await db
    .prepare(`SELECT id, name FROM agents WHERE workspace_id = ? ORDER BY updated_at DESC`)
    .bind(workspace.id)
    .all<{ id: string; name: string }>();
  const suggestions = (await listBackstageSuggestions(workspace.id)) as Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    status: string;
    created_at: string;
  }>;

  return (
    <BackstageClient
      initialSuggestions={suggestions || []}
      agents={agents.results || []}
    />
  );
}
