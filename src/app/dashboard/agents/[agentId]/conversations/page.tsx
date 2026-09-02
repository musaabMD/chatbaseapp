import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { getAgentForWorkspace } from "@/lib/agents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";

export default async function AgentConversationsPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const { workspace } = await requireWorkspace();
  const agent = await getAgentForWorkspace(agentId, workspace.id);
  if (!agent) notFound();

  const db = await getDb();
  const result = await db
    .prepare(
      `SELECT id, topic, status, channel, handoff_status, message_count, last_message_at, created_at
       FROM conversations WHERE agent_id = ? ORDER BY last_message_at DESC LIMIT 50`,
    )
    .bind(agentId)
    .all<{
      id: string;
      topic: string | null;
      status: string;
      channel: string;
      handoff_status: string;
      message_count: number;
      last_message_at: string | null;
      created_at: string;
    }>();

  const conversations = result.results || [];

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Conversations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {conversations.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No conversations yet.</p>
          ) : (
            conversations.map((c: {
              id: string;
              topic: string | null;
              status: string;
              channel: string;
              handoff_status: string;
              message_count: number;
              last_message_at: string | null;
            }) => (
              <Link
                key={c.id}
                href={`/dashboard/inbox/${c.id}`}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white/70 px-4 py-3 hover:bg-white"
              >
                <div>
                  <div className="text-sm font-medium">{c.topic || "General"}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {c.channel} · {c.message_count} messages
                    {c.last_message_at && ` · ${new Date(c.last_message_at).toLocaleString()}`}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge>{c.status}</Badge>
                  {c.handoff_status !== "ai" && <Badge className="bg-[var(--accent)]">Escalated</Badge>}
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
