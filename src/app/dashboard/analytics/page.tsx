import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default async function WorkspaceAnalyticsPage() {
  const { workspace } = await requireWorkspace();
  const db = await getDb();

  const [
    conversations,
    messages,
    leads,
    escalated,
    aiResolved,
    byChannel,
    byTopic,
    escalationReasons,
  ] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as c FROM conversations WHERE workspace_id = ?`).bind(workspace.id).first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as c FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.workspace_id = ?`,
      )
      .bind(workspace.id)
      .first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM leads WHERE workspace_id = ?`).bind(workspace.id).first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as c FROM conversations WHERE workspace_id = ? AND handoff_status IN ('escalated','human','on_hold','resolved')`,
      )
      .bind(workspace.id)
      .first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as c FROM conversations WHERE workspace_id = ? AND (resolution = 'AI_RESOLVED' OR (handoff_status = 'ai' AND status = 'closed'))`,
      )
      .bind(workspace.id)
      .first<{ c: number }>(),
    db
      .prepare(
        `SELECT channel, COUNT(*) as c FROM conversations WHERE workspace_id = ? GROUP BY channel ORDER BY c DESC`,
      )
      .bind(workspace.id)
      .all<{ channel: string; c: number }>(),
    db
      .prepare(
        `SELECT COALESCE(topic,'General') as topic, COUNT(*) as c FROM conversations WHERE workspace_id = ? GROUP BY topic ORDER BY c DESC LIMIT 8`,
      )
      .bind(workspace.id)
      .all<{ topic: string; c: number }>(),
    db
      .prepare(
        `SELECT reason, COUNT(*) as c FROM escalations WHERE workspace_id = ? GROUP BY reason ORDER BY c DESC LIMIT 8`,
      )
      .bind(workspace.id)
      .all<{ reason: string; c: number }>(),
  ]);

  const totalConv = conversations?.c ?? 0;
  const escalatedCount = escalated?.c ?? 0;
  const automationRate = totalConv ? Math.round(((totalConv - escalatedCount) / totalConv) * 100) : 0;
  const escalationRate = totalConv ? Math.round((escalatedCount / totalConv) * 100) : 0;

  const stats = [
    { label: "Conversations", value: totalConv },
    { label: "Messages", value: messages?.c ?? 0 },
    { label: "Automation rate", value: `${automationRate}%` },
    { label: "Escalation rate", value: `${escalationRate}%` },
    { label: "AI resolved", value: aiResolved?.c ?? 0 },
    { label: "Leads", value: leads?.c ?? 0 },
  ];

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Optimize automation, escalations, topics, and channels.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <div className="text-sm text-[var(--muted)]">{s.label}</div>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By channel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(byChannel.results || []).length === 0 && (
              <p className="text-sm text-[var(--muted)]">No channel data yet.</p>
            )}
            {(byChannel.results || []).map((row) => (
              <div key={row.channel} className="flex justify-between text-sm">
                <span>{row.channel}</span>
                <span className="font-medium">{row.c}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top topics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(byTopic.results || []).length === 0 && (
              <p className="text-sm text-[var(--muted)]">No topics yet.</p>
            )}
            {(byTopic.results || []).map((row) => (
              <div key={row.topic} className="flex justify-between text-sm">
                <span>{row.topic}</span>
                <span className="font-medium">{row.c}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Escalation review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(escalationReasons.results || []).length === 0 && (
              <p className="text-sm text-[var(--muted)]">No escalations yet.</p>
            )}
            {(escalationReasons.results || []).map((row) => (
              <div key={row.reason} className="flex justify-between text-sm">
                <span>{row.reason}</span>
                <span className="font-medium">{row.c}</span>
              </div>
            ))}
            <Link href="/dashboard/inbox?filter=escalated" className="text-sm text-[var(--primary)] hover:underline">
              Open escalated inbox →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
