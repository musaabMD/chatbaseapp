import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { periodKey } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function UsagePage() {
  const { workspace } = await requireWorkspace();
  const db = await getDb();
  const period = periodKey();

  const usage = await db
    .prepare(`SELECT metric, quantity FROM usage_records WHERE workspace_id = ? AND period = ?`)
    .bind(workspace.id, period)
    .all<{ metric: string; quantity: number }>();

  const subscription = await db
    .prepare(`SELECT plan, message_limit, status FROM subscriptions WHERE workspace_id = ?`)
    .bind(workspace.id)
    .first<{ plan: string; message_limit: number; status: string }>();

  const messageCount =
    usage.results?.find((u: { metric: string; quantity: number }) => u.metric === "messages")?.quantity ??
    (
      await db
        .prepare(
          `SELECT COUNT(*) as c FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
           WHERE c.workspace_id = ?`,
        )
        .bind(workspace.id)
        .first<{ c: number }>()
    )?.c ??
    0;

  const limit = subscription?.message_limit ?? 1000;

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">Usage</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Current period: {period}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="text-sm text-[var(--muted)]">Messages this period</div>
            <CardTitle className="text-3xl">{messageCount.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-2 rounded-full bg-[var(--secondary)]">
              <div
                className="h-2 rounded-full bg-[var(--primary)]"
                style={{ width: `${Math.min(100, (messageCount / limit) * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              {messageCount.toLocaleString()} / {limit.toLocaleString()} included
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="text-sm text-[var(--muted)]">Plan</div>
            <CardTitle className="text-3xl capitalize">
              {subscription?.plan || workspace.plan}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--muted)]">
              Status: {subscription?.status || "active"}
            </p>
          </CardContent>
        </Card>
      </div>

      {(usage.results || []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Usage breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(usage.results || []).map((u: { metric: string; quantity: number }) => (
              <div key={u.metric} className="flex justify-between text-sm">
                <span>{u.metric}</span>
                <span className="font-medium">{u.quantity.toLocaleString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
