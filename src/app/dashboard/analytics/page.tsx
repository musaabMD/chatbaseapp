import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function WorkspaceAnalyticsPage() {
  const { workspace } = await requireWorkspace();
  const db = await getDb();

  const [conversations, messages, leads, events] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as c FROM conversations WHERE workspace_id = ?`).bind(workspace.id).first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as c FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.workspace_id = ?`,
      )
      .bind(workspace.id)
      .first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM leads WHERE workspace_id = ?`).bind(workspace.id).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM analytics_events WHERE workspace_id = ?`).bind(workspace.id).first<{ c: number }>(),
  ]);

  const stats = [
    { label: "Conversations", value: conversations?.c ?? 0 },
    { label: "Messages", value: messages?.c ?? 0 },
    { label: "Leads", value: leads?.c ?? 0 },
    { label: "Events tracked", value: events?.c ?? 0 },
  ];

  const topAgents = await db
    .prepare(
      `SELECT a.name, COUNT(c.id) as c
       FROM agents a
       LEFT JOIN conversations c ON c.agent_id = a.id
       WHERE a.workspace_id = ?
       GROUP BY a.id
       ORDER BY c DESC
       LIMIT 5`,
    )
    .bind(workspace.id)
    .all<{ name: string; c: number }>();

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Workspace-wide assistant performance.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <div className="text-sm text-[var(--muted)]">{s.label}</div>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top assistants</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(topAgents.results || []).map((row: { name: string; c: number }) => (
            <div key={row.name} className="flex justify-between text-sm">
              <span>{row.name}</span>
              <span className="font-medium">{row.c} conversations</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
