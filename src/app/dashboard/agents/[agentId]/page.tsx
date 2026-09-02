import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { getAgentForWorkspace } from "@/lib/agents";
import { AgentStatusActions } from "@/components/dashboard/agent-status-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AgentOverviewPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const { workspace } = await requireWorkspace();
  const agent = await getAgentForWorkspace(agentId, workspace.id);
  if (!agent) notFound();

  const db = await getDb();
  const [conversations, sources, messages, escalations] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) as c FROM conversations WHERE agent_id = ?`)
      .bind(agentId)
      .first<{ c: number }>(),
    db
      .prepare(`SELECT COUNT(*) as c FROM knowledge_sources WHERE agent_id = ?`)
      .bind(agentId)
      .first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as c FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.agent_id = ?`,
      )
      .bind(agentId)
      .first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as c FROM conversations WHERE agent_id = ? AND handoff_status != 'ai'`,
      )
      .bind(agentId)
      .first<{ c: number }>(),
  ]);

  const stats = [
    { label: "Conversations", value: conversations?.c ?? 0 },
    { label: "Knowledge sources", value: sources?.c ?? 0 },
    { label: "Messages", value: messages?.c ?? 0 },
    { label: "Escalations", value: escalations?.c ?? 0 },
  ];

  const base = `/dashboard/agents/${agentId}`;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-[var(--muted)]">
          {agent.description || "Monitor performance and publish when ready."}
        </p>
        <div className="flex flex-wrap gap-2">
          <AgentStatusActions agentId={agentId} status={agent.status} />
          <Link href={`${base}/playground`}>
            <Button variant="secondary">Open playground</Button>
          </Link>
        </div>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Model</span>
              <span className="font-mono text-xs">{agent.model_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Knowledge mode</span>
              <span>{agent.knowledge_mode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Tone</span>
              <span>{agent.tone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Last trained</span>
              <span>
                {agent.last_trained_at
                  ? new Date(agent.last_trained_at).toLocaleDateString()
                  : "Not yet"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              ["Add knowledge", `${base}/sources`],
              ["Edit instructions", `${base}/instructions`],
              ["Install widget", `${base}/deploy/widget`],
              ["View conversations", `${base}/conversations`],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="block rounded-xl bg-[var(--secondary)]/70 px-4 py-3 text-sm hover:bg-[var(--secondary)]"
              >
                {label}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
