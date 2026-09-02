import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";

export default async function InboxDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { workspace } = await requireWorkspace();
  const db = await getDb();

  const conversation = await db
    .prepare(
      `SELECT c.*, a.name as agent_name FROM conversations c
       JOIN agents a ON a.id = c.agent_id
       WHERE c.id = ? AND c.workspace_id = ?`,
    )
    .bind(id, workspace.id)
    .first<{
      id: string;
      topic: string | null;
      status: string;
      channel: string;
      handoff_status: string;
      page_url: string | null;
      page_title: string | null;
      agent_id: string;
      agent_name: string;
      created_at: string;
    }>();

  if (!conversation) notFound();

  const messages = await db
    .prepare(`SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`)
    .bind(id)
    .all<{ id: string; role: string; content: string; created_at: string }>();

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/inbox" className="text-sm text-[var(--muted)] hover:underline">
            ← Back to inbox
          </Link>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold">
            {conversation.topic || "Conversation"}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {conversation.agent_name} · {conversation.channel}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge>{conversation.status}</Badge>
          {conversation.handoff_status !== "ai" && (
            <Badge className="bg-[var(--accent)]">{conversation.handoff_status}</Badge>
          )}
        </div>
      </div>

      {conversation.page_url && (
        <p className="text-xs text-[var(--muted)]">
          Page: {conversation.page_title || conversation.page_url}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(messages.results || []).map((m: { id: string; role: string; content: string; created_at: string }) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "ml-auto max-w-[85%] rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm text-white"
                  : "max-w-[85%] rounded-2xl bg-white/90 px-4 py-3 text-sm shadow-sm"
              }
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
              <div className="mt-1 text-[10px] opacity-60">
                {new Date(m.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Link
        href={`/dashboard/agents/${conversation.agent_id}/conversations`}
        className="text-sm text-[var(--primary)] hover:underline"
      >
        View all conversations for this assistant
      </Link>
    </div>
  );
}
