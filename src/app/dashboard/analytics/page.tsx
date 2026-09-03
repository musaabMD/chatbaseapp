import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { listKnowledgeGaps, listTopQuestions } from "@/lib/agent/knowledge-gaps";

export default async function WorkspaceAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { workspace } = await requireWorkspace();
  const sp = await searchParams;
  const range = sp.range || "30d";
  const days = range === "1d" ? 1 : range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const db = await getDb();

  const [
    conversations,
    messages,
    leads,
    escalated,
    aiResolved,
    byChannel,
    byTopic,
    bySentiment,
    escalationReasons,
  ] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) as c FROM conversations WHERE workspace_id = ? AND created_at >= ?`)
      .bind(workspace.id, since)
      .first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as c FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.workspace_id = ? AND m.created_at >= ?`,
      )
      .bind(workspace.id, since)
      .first<{ c: number }>(),
    db
      .prepare(`SELECT COUNT(*) as c FROM leads WHERE workspace_id = ? AND created_at >= ?`)
      .bind(workspace.id, since)
      .first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as c FROM conversations WHERE workspace_id = ? AND created_at >= ? AND handoff_status IN ('escalated','human','on_hold','resolved')`,
      )
      .bind(workspace.id, since)
      .first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as c FROM conversations WHERE workspace_id = ? AND created_at >= ? AND (resolution = 'AI_RESOLVED' OR (handoff_status = 'ai' AND status = 'closed'))`,
      )
      .bind(workspace.id, since)
      .first<{ c: number }>(),
    db
      .prepare(
        `SELECT channel, COUNT(*) as c FROM conversations WHERE workspace_id = ? AND created_at >= ? GROUP BY channel ORDER BY c DESC`,
      )
      .bind(workspace.id, since)
      .all<{ channel: string; c: number }>(),
    db
      .prepare(
        `SELECT COALESCE(topic,'General') as topic, COUNT(*) as c FROM conversations WHERE workspace_id = ? AND created_at >= ? GROUP BY topic ORDER BY c DESC LIMIT 8`,
      )
      .bind(workspace.id, since)
      .all<{ topic: string; c: number }>(),
    db
      .prepare(
        `SELECT COALESCE(sentiment,'neutral') as sentiment, COUNT(*) as c FROM conversations WHERE workspace_id = ? AND created_at >= ? GROUP BY sentiment ORDER BY c DESC`,
      )
      .bind(workspace.id, since)
      .all<{ sentiment: string; c: number }>(),
    db
      .prepare(
        `SELECT reason, COUNT(*) as c FROM escalations WHERE workspace_id = ? AND created_at >= ? GROUP BY reason ORDER BY c DESC LIMIT 8`,
      )
      .bind(workspace.id, since)
      .all<{ reason: string; c: number }>(),
  ]);

  const gaps = (await listKnowledgeGaps(workspace.id, undefined, 8)) as Array<{
    id: string;
    question: string;
    occurrence_count: number;
    avg_confidence: number | null;
    last_conversation_id: string | null;
  }>;
  const topQuestions = (await listTopQuestions(workspace.id, undefined, 8)) as Array<{
    id: string;
    canonical_question: string;
    occurrence_count: number;
    sample_conversation_id: string | null;
  }>;

  const totalConv = conversations?.c ?? 0;
  const escalatedCount = escalated?.c ?? 0;
  const automationRate = totalConv ? Math.round(((totalConv - escalatedCount) / totalConv) * 100) : 0;
  const escalationRate = totalConv ? Math.round((escalatedCount / totalConv) * 100) : 0;
  const resolutionRate = totalConv
    ? Math.round(((aiResolved?.c ?? 0) / totalConv) * 100)
    : 0;

  const stats = [
    { label: "Conversations", value: totalConv },
    { label: "Messages", value: messages?.c ?? 0 },
    { label: "Automation rate", value: `${automationRate}%` },
    { label: "Escalation rate", value: `${escalationRate}%` },
    { label: "AI resolution rate", value: `${resolutionRate}%` },
    { label: "Leads", value: leads?.c ?? 0 },
  ];

  const ranges = [
    { id: "1d", label: "Today" },
    { id: "7d", label: "7 days" },
    { id: "30d", label: "30 days" },
    { id: "90d", label: "90 days" },
  ];

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Optimize automation, escalations, topics, sentiment, and knowledge gaps.
          </p>
        </div>
        <div className="flex gap-2">
          {ranges.map((r) => (
            <Link
              key={r.id}
              href={`/dashboard/analytics?range=${r.id}`}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                range === r.id ? "bg-[var(--primary)] text-white" : "bg-white/70 text-[var(--muted)]"
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
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
            <CardTitle>Topics & trends</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(byTopic.results || []).length === 0 && (
              <p className="text-sm text-[var(--muted)]">No topics yet.</p>
            )}
            {(byTopic.results || []).map((row) => (
              <div key={row.topic} className="flex justify-between text-sm">
                <Link href={`/dashboard/inbox?topic=${encodeURIComponent(row.topic)}`} className="hover:underline">
                  {row.topic}
                </Link>
                <span className="font-medium">{row.c}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sentiment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(bySentiment.results || []).length === 0 && (
              <p className="text-sm text-[var(--muted)]">No sentiment data yet.</p>
            )}
            {(bySentiment.results || []).map((row) => (
              <div key={row.sentiment} className="flex justify-between text-sm">
                <span>{row.sentiment}</span>
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

        <Card>
          <CardHeader>
            <CardTitle>What customers keep asking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topQuestions.length === 0 && (
              <p className="text-sm text-[var(--muted)]">No clustered questions yet.</p>
            )}
            {topQuestions.map((q) => (
              <div key={q.id} className="flex justify-between gap-3 text-sm">
                <span className="line-clamp-2">{q.canonical_question}</span>
                <span className="shrink-0 font-medium">{q.occurrence_count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Knowledge gaps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {gaps.length === 0 && (
              <p className="text-sm text-[var(--muted)]">No gaps detected yet.</p>
            )}
            {gaps.map((g) => (
              <div key={g.id} className="rounded-xl border border-[var(--border)] p-2 text-sm">
                <div className="line-clamp-2">{g.question}</div>
                <div className="mt-1 flex justify-between text-xs text-[var(--muted)]">
                  <span>×{g.occurrence_count}</span>
                  <span>conf {g.avg_confidence != null ? g.avg_confidence.toFixed(2) : "—"}</span>
                </div>
                {g.last_conversation_id && (
                  <Link
                    href={`/dashboard/inbox/${g.last_conversation_id}`}
                    className="text-xs text-[var(--primary)] hover:underline"
                  >
                    Review conversation →
                  </Link>
                )}
              </div>
            ))}
            <Link href="/dashboard/backstage" className="text-sm text-[var(--primary)] hover:underline">
              Ask Backstage to draft FAQs →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
