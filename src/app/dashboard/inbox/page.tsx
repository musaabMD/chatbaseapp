import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";

export default async function InboxPage() {
  const { workspace } = await requireWorkspace();
  const db = await getDb();

  const result = await db
    .prepare(
      `SELECT c.id, c.topic, c.status, c.channel, c.handoff_status, c.message_count,
              c.last_message_at, a.name as agent_name
       FROM conversations c
       JOIN agents a ON a.id = c.agent_id
       WHERE c.workspace_id = ?
       ORDER BY c.last_message_at DESC
       LIMIT 50`,
    )
    .bind(workspace.id)
    .all<{
      id: string;
      topic: string | null;
      status: string;
      channel: string;
      handoff_status: string;
      message_count: number;
      last_message_at: string | null;
      agent_name: string;
    }>();

  const conversations = result.results || [];

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">Inbox</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">All conversations across assistants.</p>
      </div>

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
              agent_name: string;
            }) => (
              <Link
                key={c.id}
                href={`/dashboard/inbox/${c.id}`}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white/70 px-4 py-3 hover:bg-white"
              >
                <div>
                  <div className="text-sm font-medium">{c.topic || "General"}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {c.agent_name} · {c.channel} · {c.message_count} messages
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
