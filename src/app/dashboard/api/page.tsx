import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";

export default async function ApiPage() {
  const { workspace } = await requireWorkspace();
  const db = await getDb();

  const keys = await db
    .prepare(
      `SELECT id, name, key_prefix, scopes, last_used_at, created_at
       FROM api_keys WHERE workspace_id = ?
       ORDER BY created_at DESC`,
    )
    .bind(workspace.id)
    .all<{
      id: string;
      name: string;
      key_prefix: string;
      scopes: string | null;
      last_used_at: string | null;
      created_at: string;
    }>();

  const example = `curl -X POST https://app.campusly.ai/api/chat \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"agentId": "agent_...", "message": "Hello"}'`;

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">API</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Manage API keys for programmatic access.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>Keys are shown once at creation. Store them securely.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(keys.results || []).length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No API keys yet. Key management UI coming soon.</p>
          ) : (
            (keys.results || []).map((k: {
              id: string;
              name: string;
              key_prefix: string;
              last_used_at: string | null;
            }) => (
              <div
                key={k.id}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white/70 px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium">{k.name}</div>
                  <div className="font-mono text-xs text-[var(--muted)]">{k.key_prefix}…</div>
                </div>
                <Badge>{k.last_used_at ? "Used" : "Unused"}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick start</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-xl bg-[var(--secondary)]/60 p-4 text-xs font-mono">
            {example}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
