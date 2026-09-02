import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { getAgentForWorkspace } from "@/lib/agents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";

export default async function EscalationsPage({
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
      `SELECT id, topic, handoff_status, status, last_message_at, message_count
       FROM conversations
       WHERE agent_id = ? AND handoff_status != 'ai'
       ORDER BY last_message_at DESC LIMIT 50`,
    )
    .bind(agentId)
    .all<{
      id: string;
      topic: string | null;
      handoff_status: string;
      status: string;
      last_message_at: string | null;
      message_count: number;
    }>();

  const escalations = result.results || [];

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Escalations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {escalations.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No escalations — great job!</p>
          ) : (
            escalations.map((c: {
              id: string;
              topic: string | null;
              handoff_status: string;
              status: string;
              last_message_at: string | null;
              message_count: number;
            }) => (
              <Link
                key={c.id}
                href={`/dashboard/inbox/${c.id}`}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white/70 px-4 py-3 hover:bg-white"
              >
                <div>
                  <div className="text-sm font-medium">{c.topic || "Escalated conversation"}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {c.message_count} messages
                    {c.last_message_at && ` · ${new Date(c.last_message_at).toLocaleString()}`}
                  </div>
                </div>
                <Badge className="bg-[var(--accent)]">{c.handoff_status}</Badge>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
