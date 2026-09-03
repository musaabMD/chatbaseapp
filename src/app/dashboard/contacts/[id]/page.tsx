import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { workspace } = await requireWorkspace();
  const db = await getDb();

  const contact = await db
    .prepare(`SELECT * FROM contacts WHERE id = ? AND workspace_id = ?`)
    .bind(id, workspace.id)
    .first<{
      id: string;
      name: string | null;
      email: string | null;
      type: string;
      program_interest: string | null;
      conversation_count: number;
      metadata: string | null;
      last_seen_at: string | null;
      created_at: string;
    }>();

  if (!contact) notFound();

  const conversations = await db
    .prepare(
      `SELECT id, topic, channel, status, handoff_status, last_message_at
       FROM conversations WHERE workspace_id = ? AND contact_id = ?
       ORDER BY last_message_at DESC LIMIT 30`,
    )
    .bind(workspace.id, id)
    .all<{
      id: string;
      topic: string | null;
      channel: string;
      status: string;
      handoff_status: string;
      last_message_at: string | null;
    }>();

  const tickets = await db
    .prepare(
      `SELECT id, subject, status, priority, created_at FROM tickets
       WHERE workspace_id = ? AND contact_id = ?
       ORDER BY created_at DESC LIMIT 20`,
    )
    .bind(workspace.id, id)
    .all<{ id: string; subject: string; status: string; priority: string; created_at: string }>();

  // Also find conversations that mention this email in verified identity
  const byEmail =
    contact.email
      ? await db
          .prepare(
            `SELECT id, topic, channel, status, handoff_status, last_message_at
             FROM conversations
             WHERE workspace_id = ? AND verified_identity LIKE ?
             ORDER BY last_message_at DESC LIMIT 20`,
          )
          .bind(workspace.id, `%${contact.email}%`)
          .all<{
            id: string;
            topic: string | null;
            channel: string;
            status: string;
            handoff_status: string;
            last_message_at: string | null;
          }>()
      : { results: [] as Array<{
          id: string;
          topic: string | null;
          channel: string;
          status: string;
          handoff_status: string;
          last_message_at: string | null;
        }> };

  const convMap = new Map<string, (typeof conversations.results)[0]>();
  for (const c of [...(conversations.results || []), ...(byEmail.results || [])]) {
    convMap.set(c.id, c);
  }
  const allConversations = Array.from(convMap.values());

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <Link href="/dashboard/contacts" className="text-sm text-[var(--muted)] hover:underline">
          ← Contacts
        </Link>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold">
          {contact.name || contact.email || "Contact"}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {contact.email || "No email"} · {contact.type}
          {contact.program_interest ? ` · ${contact.program_interest}` : ""}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Conversations</span>
              <span>{contact.conversation_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Last seen</span>
              <span>
                {contact.last_seen_at ? new Date(contact.last_seen_at).toLocaleString() : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Created</span>
              <span>{new Date(contact.created_at).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tickets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(tickets.results || []).length === 0 && (
              <p className="text-[var(--muted)]">No tickets linked.</p>
            )}
            {(tickets.results || []).map((t) => (
              <div key={t.id} className="flex justify-between gap-2">
                <span className="line-clamp-1">{t.subject}</span>
                <Badge>{t.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conversation history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {allConversations.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No conversations yet.</p>
          )}
          {allConversations.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/inbox/${c.id}`}
              className="flex items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3 text-sm hover:bg-white/70"
            >
              <div>
                <div className="font-medium">{c.topic || "Conversation"}</div>
                <div className="text-xs text-[var(--muted)]">
                  {c.channel} · {c.last_message_at ? new Date(c.last_message_at).toLocaleString() : ""}
                </div>
              </div>
              <Badge>{c.handoff_status}</Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
