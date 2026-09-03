import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; topic?: string }>;
}) {
  const { filter, topic } = await searchParams;
  const { workspace, user } = await requireWorkspace();
  const db = await getDb();

  let sql = `SELECT c.id, c.topic, c.status, c.channel, c.handoff_status, c.automation_state,
              c.message_count, c.last_message_at, a.name as agent_name
       FROM conversations c
       JOIN agents a ON a.id = c.agent_id
       WHERE c.workspace_id = ?`;
  const binds: string[] = [workspace.id];

  if (filter === "escalated") {
    sql += ` AND c.handoff_status IN ('escalated', 'human', 'on_hold')`;
  } else if (filter === "mine") {
    sql += ` AND c.assigned_to = ?`;
    binds.push(user.id);
  } else if (filter === "unassigned") {
    sql += ` AND c.handoff_status IN ('escalated', 'human') AND (c.assigned_to IS NULL OR c.assigned_to = '')`;
  } else if (filter === "closed") {
    sql += ` AND c.status = 'closed'`;
  } else if (filter === "open") {
    sql += ` AND c.status = 'open'`;
  }

  if (topic) {
    sql += ` AND c.topic = ?`;
    binds.push(topic);
  }

  sql += ` ORDER BY c.last_message_at DESC LIMIT 80`;

  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<{
      id: string;
      topic: string | null;
      status: string;
      channel: string;
      handoff_status: string;
      automation_state: string | null;
      message_count: number;
      last_message_at: string | null;
      agent_name: string;
    }>();

  const conversations = result.results || [];
  const filters = [
    { id: "all", label: "Inbox" },
    { id: "escalated", label: "Escalated" },
    { id: "mine", label: "Assigned to me" },
    { id: "unassigned", label: "Unassigned" },
    { id: "open", label: "Open" },
    { id: "closed", label: "Closed" },
  ];

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">Helpdesk</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          AI and humans share the same conversations — take over, reply, hold, or resolve.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => {
          const active = (filter || "all") === f.id || (!filter && f.id === "all");
          return (
            <Link
              key={f.id}
              href={f.id === "all" ? "/dashboard/inbox" : `/dashboard/inbox?filter=${f.id}`}
              className={`rounded-full px-3 py-1.5 text-sm ${
                active ? "bg-[var(--primary)] text-white" : "border border-[var(--border)] bg-white/70"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conversations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {conversations.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No conversations in this view.</p>
          ) : (
            conversations.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/inbox/${c.id}`}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white/70 px-4 py-3 hover:bg-white"
              >
                <div>
                  <div className="text-sm font-medium">{c.topic || "General"}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {c.agent_name} · {c.channel} · {c.message_count} messages
                    {c.last_message_at ? ` · ${new Date(c.last_message_at).toLocaleString()}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge>{c.status}</Badge>
                  {c.handoff_status !== "ai" && (
                    <Badge className="bg-[var(--accent)]">{c.automation_state || c.handoff_status}</Badge>
                  )}
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
