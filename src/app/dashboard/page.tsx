import Link from "next/link";
import { getDb } from "@/lib/cloudflare";
import { requireWorkspace } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";

export default async function DashboardHome() {
  const { workspace } = await requireWorkspace();
  const db = await getDb();

  const [agents, conversations, escalations, leads, recent] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as c FROM agents WHERE workspace_id = ?`).bind(workspace.id).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM conversations WHERE workspace_id = ?`).bind(workspace.id).first<{ c: number }>(),
    db
      .prepare(`SELECT COUNT(*) as c FROM conversations WHERE workspace_id = ? AND handoff_status != 'ai'`)
      .bind(workspace.id)
      .first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM leads WHERE workspace_id = ?`).bind(workspace.id).first<{ c: number }>(),
    db
      .prepare(
        `SELECT c.id, c.topic, c.status, c.last_message_at, a.name as agent_name
         FROM conversations c JOIN agents a ON a.id = c.agent_id
         WHERE c.workspace_id = ?
         ORDER BY c.last_message_at DESC LIMIT 6`,
      )
      .bind(workspace.id)
      .all(),
  ]);

  const stats = [
    { label: "Assistants", value: agents?.c || 0 },
    { label: "Conversations", value: conversations?.c || 0 },
    { label: "Escalations", value: escalations?.c || 0 },
    { label: "Leads", value: leads?.c || 0 },
  ];

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            {workspace.institution_name || workspace.name}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Monitor assistant performance and student intent.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/agents/new"><Button>Create assistant</Button></Link>
          <Link href="/dashboard/agents"><Button variant="outline">Add knowledge</Button></Link>
          <Link href="/dashboard/agents"><Button variant="secondary">Install widget</Button></Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescriptionStat label={s.label} />
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent conversations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(recent.results || []).length === 0 && (
              <p className="text-sm text-[var(--muted)]">No conversations yet. Publish an assistant and share the widget.</p>
            )}
            {((recent.results || []) as Array<{
              id: string;
              topic: string | null;
              status: string;
              agent_name: string;
            }>).map((row) => (
              <Link
                key={row.id}
                href={`/dashboard/inbox/${row.id}`}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white/70 px-3 py-3 hover:bg-white"
              >
                <div>
                  <div className="text-sm font-medium">{row.topic || "General"}</div>
                  <div className="text-xs text-[var(--muted)]">{row.agent_name}</div>
                </div>
                <Badge>{row.status}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              ["Create assistant", "/dashboard/agents/new"],
              ["Open inbox", "/dashboard/inbox"],
              ["Review analytics", "/dashboard/analytics"],
              ["Manage billing", "/dashboard/billing"],
            ].map(([label, href]) => (
              <Link key={href} href={href} className="block rounded-xl bg-[var(--secondary)]/70 px-4 py-3 text-sm hover:bg-[var(--secondary)]">
                {label}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CardDescriptionStat({ label }: { label: string }) {
  return <div className="text-sm text-[var(--muted)]">{label}</div>;
}
