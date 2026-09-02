import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { getAgentForWorkspace } from "@/lib/agents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AgentAnalyticsPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const { workspace } = await requireWorkspace();
  const agent = await getAgentForWorkspace(agentId, workspace.id);
  if (!agent) notFound();

  const db = await getDb();
  const [conversations, messages, events, avgMessages] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) as c FROM conversations WHERE agent_id = ?`)
      .bind(agentId)
      .first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as c FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.agent_id = ?`,
      )
      .bind(agentId)
      .first<{ c: number }>(),
    db
      .prepare(`SELECT COUNT(*) as c FROM analytics_events WHERE agent_id = ?`)
      .bind(agentId)
      .first<{ c: number }>(),
    db
      .prepare(
        `SELECT AVG(message_count) as avg FROM conversations WHERE agent_id = ? AND message_count > 0`,
      )
      .bind(agentId)
      .first<{ avg: number | null }>(),
  ]);

  const stats = [
    { label: "Total conversations", value: conversations?.c ?? 0 },
    { label: "Total messages", value: messages?.c ?? 0 },
    { label: "Analytics events", value: events?.c ?? 0 },
    { label: "Avg messages / conversation", value: avgMessages?.avg?.toFixed(1) ?? "—" },
  ];

  const channelBreakdown = await db
    .prepare(
      `SELECT channel, COUNT(*) as c FROM conversations WHERE agent_id = ? GROUP BY channel`,
    )
    .bind(agentId)
    .all<{ channel: string; c: number }>();

  return (
    <div className="space-y-6 p-6">
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
          <CardTitle>By channel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(channelBreakdown.results || []).length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No data yet.</p>
          ) : (
            (channelBreakdown.results || []).map((row: { channel: string; c: number }) => (
              <div key={row.channel} className="flex justify-between text-sm">
                <span>{row.channel}</span>
                <span className="font-medium">{row.c}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
