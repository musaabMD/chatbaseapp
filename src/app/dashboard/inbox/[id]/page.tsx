import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";
import { HelpdeskActions } from "@/components/dashboard/helpdesk-actions";
import { safeJsonParse } from "@/lib/utils";

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
      automation_state: string | null;
      page_url: string | null;
      page_title: string | null;
      agent_id: string;
      agent_name: string;
      created_at: string;
      verified_identity: string | null;
      resolution: string | null;
      metadata: string | null;
    }>();

  if (!conversation) notFound();

  const messages = await db
    .prepare(`SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`)
    .bind(id)
    .all<{ id: string; role: string; content: string; created_at: string }>();

  const escalation = await db
    .prepare(
      `SELECT id, reason, summary, status, priority, created_at FROM escalations WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(id)
    .first<{
      id: string;
      reason: string;
      summary: string | null;
      status: string;
      priority: string;
      created_at: string;
    }>();

  const notes = await db
    .prepare(`SELECT id, body, created_at FROM internal_notes WHERE conversation_id = ? ORDER BY created_at ASC`)
    .bind(id)
    .all<{ id: string; body: string; created_at: string }>();

  const traces = await db
    .prepare(
      `SELECT id, intent, tool_calls, escalation_decision, created_at FROM agent_traces WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 5`,
    )
    .bind(id)
    .all<{
      id: string;
      intent: string | null;
      tool_calls: string | null;
      escalation_decision: string | null;
      created_at: string;
    }>();

  const actions = await db
    .prepare(
      `SELECT name, status, created_at FROM action_executions WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 8`,
    )
    .bind(id)
    .all<{ name: string; status: string; created_at: string }>();

  const procedures = await db
    .prepare(
      `SELECT id, status, current_step, started_at FROM procedure_runs WHERE conversation_id = ? ORDER BY started_at DESC LIMIT 3`,
    )
    .bind(id)
    .all<{ id: string; status: string; current_step: number; started_at: string }>();

  const identity = safeJsonParse<Record<string, unknown>>(conversation.verified_identity, {});

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
            {conversation.resolution ? ` · ${conversation.resolution}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge>{conversation.status}</Badge>
          {conversation.handoff_status !== "ai" && (
            <Badge className="bg-[var(--accent)]">{conversation.handoff_status}</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-4">
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

          <HelpdeskActions
            conversationId={conversation.id}
            automationState={conversation.automation_state}
            handoffStatus={conversation.handoff_status}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Object.keys(identity).length === 0 ? (
                <p className="text-[var(--muted)]">No verified identity on this conversation.</p>
              ) : (
                Object.entries(identity).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-[var(--muted)]">{k}</span>
                    <span className="font-mono text-xs">{String(v)}</span>
                  </div>
                ))
              )}
              {conversation.page_url && (
                <p className="pt-2 text-xs text-[var(--muted)]">
                  Page: {conversation.page_title || conversation.page_url}
                </p>
              )}
            </CardContent>
          </Card>

          {escalation && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">AI handoff summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <Badge>{escalation.status}</Badge>
                  <Badge>{escalation.priority}</Badge>
                </div>
                <div className="text-xs text-[var(--muted)]">Reason: {escalation.reason}</div>
                <pre className="whitespace-pre-wrap rounded-xl bg-[var(--secondary)]/50 p-3 text-xs">
                  {escalation.summary}
                </pre>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Internal notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(notes.results || []).length === 0 && (
                <p className="text-[var(--muted)]">No notes yet.</p>
              )}
              {(notes.results || []).map((n: { id: string; body: string; created_at: string }) => (
                <div key={n.id} className="rounded-xl border border-[var(--border)] p-2 text-xs">
                  <div>{n.body}</div>
                  <div className="mt-1 text-[var(--muted)]">{new Date(n.created_at).toLocaleString()}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions & procedures</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {(actions.results || []).length === 0 && (procedures.results || []).length === 0 && (
                <p className="text-[var(--muted)]">No tool or procedure activity.</p>
              )}
              {(actions.results || []).map((a, i) => (
                <div key={`${a.name}-${i}`} className="flex justify-between gap-2">
                  <span>{a.name}</span>
                  <span className="text-[var(--muted)]">{a.status}</span>
                </div>
              ))}
              {(procedures.results || []).map((p) => (
                <div key={p.id} className="flex justify-between gap-2">
                  <span>Procedure · step {p.current_step}</span>
                  <span className="text-[var(--muted)]">{p.status}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent traces</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {(traces.results || []).length === 0 && (
                <p className="text-[var(--muted)]">No traces yet.</p>
              )}
              {(traces.results || []).map((t) => (
                <div key={t.id} className="rounded-xl border border-[var(--border)] p-2">
                  <div className="font-medium">{t.intent || "turn"}</div>
                  <div className="text-[var(--muted)]">{new Date(t.created_at).toLocaleString()}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
